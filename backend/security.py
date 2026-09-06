import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserRole


def _secret() -> bytes:
    return os.getenv("AUTH_TOKEN_SECRET", "rentmate-development-secret-change-me").encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(user_id: int, role: str, expires_seconds: int = 86400) -> str:
    payload = {"sub": user_id, "role": role, "exp": int(time.time()) + expires_seconds}
    body = _encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{signature}"


def read_access_token(token: str) -> dict[str, object]:
    try:
        body, supplied = token.rsplit(".", 1)
        expected = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("signature")
        payload = json.loads(_decode(body))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登入憑證無效或已過期。") from error


def get_current_landlord(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入房東帳號。")
    payload = read_access_token(authorization[7:])
    user_id = int(payload["sub"])
    if payload.get("role") != "landlord":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此功能僅限房東使用。")
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == "landlord").first()
    if not user or not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="房東權限不存在。")
    return user


def get_current_tenant(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入租客帳號。")
    payload = read_access_token(authorization[7:])
    user_id = int(payload["sub"])
    if payload.get("role") != "tenant":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此功能僅限租客使用。")
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == "tenant").first()
    if not user or not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="租客權限不存在。")
    return user
