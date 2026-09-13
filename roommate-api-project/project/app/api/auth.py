import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.oidc import (
    build_google_login_url,
    exchange_code_for_tokens,
    verify_google_id_token,
)
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.db import get_db
from app.models import User
from app.schemas import TokenPair

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 生產環境請改用 Redis 或有過期機制的儲存，這裡先用記憶體示意 CSRF state
_pending_states: set[str] = set()


@router.get("/google/login")
async def google_login():
    state = secrets.token_urlsafe(16)
    _pending_states.add(state)
    url = await build_google_login_url(state)
    return RedirectResponse(url)


@router.get("/google/callback", response_model=TokenPair)
async def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    if state not in _pending_states:
        raise HTTPException(status_code=400, detail="無效的 state，可能為 CSRF 攻擊")
    _pending_states.discard(state)

    # 1. 用 code 向 Google 換 token（client_secret 只在後端使用，不外傳）
    tokens = await exchange_code_for_tokens(code)
    id_token = tokens["id_token"]

    # 2. 驗證 Google 的 ID Token
    claims = await verify_google_id_token(id_token)
    google_sub = claims["sub"]
    email = claims["email"]
    name = claims.get("name")
    avatar_url = claims.get("picture")

    # 3. 建立或更新本地使用者
    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user is None:
        user = User(google_sub=google_sub, email=email, name=name, avatar_url=avatar_url)
        db.add(user)
    else:
        user.name = name
        user.avatar_url = avatar_url
    db.commit()
    db.refresh(user)

    # 4. 簽發本系統自己的 JWT
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh_token(refresh_token: str):
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="需要使用 refresh token")
    user_id = payload["sub"]
    return TokenPair(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )
