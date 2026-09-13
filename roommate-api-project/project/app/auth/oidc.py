"""
Google OIDC 登入流程 (Authorization Code Flow)

流程：
1. 前端呼叫 GET /api/auth/google/login -> 後端回傳 Google 授權頁 URL，前端導頁過去
2. 使用者在 Google 完成登入同意後，Google 導回本系統的 redirect_uri，
   並帶上 ?code=xxxx
3. 前端把 code 傳給後端 GET /api/auth/google/callback?code=xxxx
4. 後端用 code + client_id + client_secret 向 Google Token Endpoint
   換取 id_token / access_token（client_secret 全程只在後端使用）
5. 後端驗證 Google 的 id_token（簽章、發行者、audience、過期時間）
6. 後端用驗證後的使用者資訊（email, sub, name...）建立/更新本地 User
7. 後端簽發「本系統自己的」JWT access_token + refresh_token 給前端
"""
import httpx
from authlib.jose import jwt as authlib_jwt
from authlib.jose.errors import JoseError
from fastapi import HTTPException

from app.core.config import settings

_discovery_cache: dict | None = None


async def _get_google_discovery() -> dict:
    global _discovery_cache
    if _discovery_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.GOOGLE_DISCOVERY_URL)
            resp.raise_for_status()
            _discovery_cache = resp.json()
    return _discovery_cache


async def build_google_login_url(state: str) -> str:
    discovery = await _get_google_discovery()
    auth_endpoint = discovery["authorization_endpoint"]
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{auth_endpoint}?{query}"


async def exchange_code_for_tokens(code: str) -> dict:
    """
    拿 authorization code 向 Google 換 token。
    client_secret 只在這裡被使用，且僅存在後端記憶體/請求中，不外流。
    """
    discovery = await _get_google_discovery()
    token_endpoint = discovery["token_endpoint"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            token_endpoint,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="向 Google 交換 token 失敗")
        return resp.json()  # 包含 id_token, access_token, expires_in ...


async def verify_google_id_token(id_token: str) -> dict:
    """
    驗證 Google 回傳的 ID Token：
    - 簽章是否正確（用 Google 的公開金鑰，JWKS）
    - iss 是否為 accounts.google.com
    - aud 是否等於本系統的 GOOGLE_CLIENT_ID
    - exp 是否未過期
    驗證通過後回傳 payload（含 email, sub, name, picture 等）。
    """
    discovery = await _get_google_discovery()
    jwks_uri = discovery["jwks_uri"]

    async with httpx.AsyncClient() as client:
        jwks_resp = await client.get(jwks_uri)
        jwks_resp.raise_for_status()
        jwks = jwks_resp.json()

    try:
        claims = authlib_jwt.decode(id_token, jwks)
        claims.validate()
    except JoseError:
        raise HTTPException(status_code=401, detail="Google ID Token 驗證失敗")

    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="ID Token audience 不符")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="ID Token issuer 不符")

    return dict(claims)
