"""JWT 簽發與驗證核心模組。

登入成功後由後端簽發 JWT，以 HttpOnly cookie 交給瀏覽器保存：
- HttpOnly：JavaScript 讀不到，XSS 偷不走 token
- Secure：正式環境（HTTPS）才透過 COOKIE_SECURE=true 開啟
- SameSite=Lax：基本 CSRF 防護

FastAPI 與 OCR Express server 共用同一組 JWT_SECRET（都從 .env 讀），
因此這裡簽出的 token，Express 端也驗得過。
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt  # PyJWT
from dotenv import load_dotenv
from fastapi import HTTPException, Request, Response, status
from pydantic import BaseModel

ROOT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ROOT_ENV_FILE)

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
AUTH_COOKIE_NAME = "access_token"
# access token 有效期：24 小時（畢業專題規模先不做 refresh token 輪替）
ACCESS_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60

if not JWT_SECRET:
    raise RuntimeError(
        "缺少 JWT_SECRET 環境變數。請在專案根目錄 .env 加入一行：\n"
        '  JWT_SECRET="<用 openssl rand -hex 32 產生的隨機字串>"\n'
        "（FastAPI 與 OCR Express server 必須共用同一組值）"
    )


def _cookie_secure() -> bool:
    """本機開發走 http，Secure cookie 會被瀏覽器丟棄；正式環境設 COOKIE_SECURE=true。"""
    return os.getenv("COOKIE_SECURE", "false").strip().lower() == "true"


class CurrentUser(BaseModel):
    """驗證通過後，從 token 還原出的使用者身分。"""

    id: int
    email: str
    role: str


def create_access_token(user_id: int, email: str, role: str) -> str:
    """以使用者資訊簽發 JWT。sub 依 RFC 7519 慣例放使用者唯一識別。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=ACCESS_TOKEN_MAX_AGE_SECONDS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    """把 JWT 放進 HttpOnly cookie 回給瀏覽器，之後的請求會自動帶上。"""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """登出：清除認證 cookie。"""
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")


def get_current_user(request: Request) -> CurrentUser:
    """FastAPI 依賴：從 cookie 取出並驗證 JWT，失敗一律回 401。

    需要登入的端點加上 `user: CurrentUser = Depends(get_current_user)` 即受保護；
    整個 router 要保護則在 APIRouter 加 `dependencies=[Depends(get_current_user)]`。
    """
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登入，請先登入後再操作。",
        )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return CurrentUser(
            id=int(payload["sub"]),
            email=str(payload.get("email", "")),
            role=str(payload.get("role", "tenant")),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登入已過期，請重新登入。",
        )
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無效的登入憑證，請重新登入。",
        )
