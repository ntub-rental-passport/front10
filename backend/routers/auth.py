import base64
import hashlib
import hmac
import json
import os
import secrets
import smtplib
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

import requests as http_requests
from argon2 import PasswordHasher
from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from email_service import EmailConfigurationError, send_verification_email
from models import (
    PendingRegistration,
    User,
    UserIdentity,
    UserPasswordCredential,
    UserRole,
)
from verification import (
    generate_verification_code,
    hash_verification_code,
    verification_code_matches,
)


ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ROOT_ENV_FILE)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPES = "openid email profile"
STATE_COOKIE_NAME = "rentmate_google_oauth_state"
STATE_MAX_AGE_SECONDS = 10 * 60
TICKET_MAX_AGE_SECONDS = 2 * 60
ALLOWED_ROLES = {"tenant", "landlord"}
REGISTRATION_TOKEN_MAX_AGE_SECONDS = 10 * 60
password_hasher = PasswordHasher()

_oauth_tickets: dict[str, dict[str, object]] = {}
_ticket_lock = threading.Lock()


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1)


class GoogleTicketRequest(BaseModel):
    ticket: str = Field(min_length=1)


class GoogleAccountResponse(BaseModel):
    email: str
    emailVerified: bool
    name: str | None = None
    picture: str | None = None
    subject: str


class GoogleOAuthSessionResponse(GoogleAccountResponse):
    flowVersion: int = 2
    role: str
    redirectPath: str | None = None
    registrationRequired: bool
    registrationToken: str | None = None


class RegistrationStartRequest(BaseModel):
    email: str | None = None
    password: str | None = None
    role: str = "tenant"
    inviteCode: str | None = Field(default=None, max_length=100)
    googleRegistrationToken: str | None = None


class RegistrationIdRequest(BaseModel):
    registrationId: str = Field(min_length=36, max_length=36)


class RegistrationVerifyRequest(RegistrationIdRequest):
    code: str = Field(pattern=r"^\d{6}$")


class RegistrationPendingResponse(BaseModel):
    registrationId: str
    email: str
    expiresIn: int
    resendAvailableIn: int
    attemptsRemaining: int
    sendCount: int


class RegistrationVerifyResponse(BaseModel):
    email: str
    role: str
    displayName: str | None = None
    avatarUrl: str | None = None


def _google_config() -> tuple[str, str, str, str]:
    # 開發時允許儲存 .env 後立即重試，不必為了更新密鑰重啟後端。
    file_env = dotenv_values(ROOT_ENV_FILE)
    secret_file_value = (
        os.getenv("GOOGLE_CLIENT_SECRET_FILE")
        or str(file_env.get("GOOGLE_CLIENT_SECRET_FILE") or "")
    )
    oauth_file_config: dict[str, object] = {}
    if secret_file_value:
        try:
            secret_file = Path(secret_file_value).expanduser()
            secret_document = json.loads(secret_file.read_text(encoding="utf-8"))
            raw_config = secret_document.get("web") or secret_document.get("installed") or {}
            if isinstance(raw_config, dict):
                oauth_file_config = raw_config
        except (OSError, json.JSONDecodeError):
            oauth_file_config = {}

    client_id = (
        os.getenv("GOOGLE_CLIENT_ID")
        or str(file_env.get("GOOGLE_CLIENT_ID") or "")
        or str(oauth_file_config.get("client_id") or "")
        or os.getenv("VITE_GOOGLE_CLIENT_ID")
        or str(file_env.get("VITE_GOOGLE_CLIENT_ID") or "")
    )
    client_secret = (
        os.getenv("GOOGLE_CLIENT_SECRET")
        or str(file_env.get("GOOGLE_CLIENT_SECRET") or "")
        or str(oauth_file_config.get("client_secret") or "")
    )
    redirect_uri = (
        os.getenv("GOOGLE_REDIRECT_URI")
        or str(file_env.get("GOOGLE_REDIRECT_URI") or "")
        or "http://localhost:8000/api/auth/google/callback"
    )
    frontend_url = (
        os.getenv("FRONTEND_URL")
        or str(file_env.get("FRONTEND_URL") or "")
        or "http://localhost:5173"
    )
    return client_id, client_secret, redirect_uri, frontend_url.rstrip("/")


def _safe_role(role: str) -> str:
    return role if role in ALLOWED_ROLES else "tenant"


def _safe_redirect_path(redirect_path: str | None) -> str | None:
    if not redirect_path or not redirect_path.startswith("/") or redirect_path.startswith("//"):
        return None
    return redirect_path


def _frontend_login_redirect(**params: str) -> RedirectResponse:
    _, _, _, frontend_url = _google_config()
    query = urlencode({key: value for key, value in params.items() if value})
    return RedirectResponse(
        url=f"{frontend_url}/login{f'?{query}' if query else ''}",
        status_code=status.HTTP_302_FOUND,
    )


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _create_signed_state(role: str, redirect_path: str | None, signing_key: str) -> str:
    payload = {
        "nonce": secrets.token_urlsafe(24),
        "role": _safe_role(role),
        "redirectPath": _safe_redirect_path(redirect_path),
        "expiresAt": int(time.time()) + STATE_MAX_AGE_SECONDS,
    }
    encoded_payload = _base64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature = _base64url_encode(
        hmac.new(signing_key.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{encoded_payload}.{signature}"


def _read_signed_state(state_value: str, signing_key: str) -> dict[str, object]:
    try:
        encoded_payload, supplied_signature = state_value.rsplit(".", 1)
        expected_signature = _base64url_encode(
            hmac.new(
                signing_key.encode("utf-8"),
                encoded_payload.encode("ascii"),
                hashlib.sha256,
            ).digest()
        )
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("state signature mismatch")

        payload = json.loads(_base64url_decode(encoded_payload))
        if int(payload["expiresAt"]) < int(time.time()):
            raise ValueError("state expired")
        return payload
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google 登入狀態無效或已過期，請重新登入。",
        ) from error


def _create_google_registration_token(
    account: GoogleAccountResponse,
    role: str,
    redirect_path: str | None,
    signing_key: str,
) -> str:
    payload = {
        "account": account.model_dump(),
        "role": _safe_role(role),
        "redirectPath": _safe_redirect_path(redirect_path),
        "expiresAt": int(time.time()) + REGISTRATION_TOKEN_MAX_AGE_SECONDS,
    }
    encoded_payload = _base64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature = _base64url_encode(
        hmac.new(signing_key.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{encoded_payload}.{signature}"


def _read_google_registration_token(token: str, signing_key: str) -> dict[str, object]:
    try:
        payload = _read_signed_state(token, signing_key)
        account = payload.get("account")
        if not isinstance(account, dict):
            raise ValueError("missing Google account")
        return payload
    except (HTTPException, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 註冊資料無效或已過期，請重新使用 Google 登入。",
        ) from error


def _normalize_email(value: str | None) -> str:
    email = (value or "").strip().lower()
    if not email or len(email) > 254 or "@" not in email:
        raise HTTPException(status_code=422, detail="請輸入有效的電子信箱。")
    return email


def _registration_limits() -> tuple[int, int, int, int]:
    expires_seconds = int(os.getenv("VERIFICATION_CODE_EXPIRES_SECONDS", "120"))
    max_attempts = int(os.getenv("VERIFICATION_CODE_MAX_ATTEMPTS", "3"))
    resend_cooldown = int(os.getenv("VERIFICATION_RESEND_COOLDOWN_SECONDS", "60"))
    max_sends = int(os.getenv("VERIFICATION_MAX_SENDS", "5"))
    return expires_seconds, max_attempts, resend_cooldown, max_sends


def _pending_response(pending: PendingRegistration, now: datetime) -> RegistrationPendingResponse:
    _, max_attempts, _, _ = _registration_limits()
    return RegistrationPendingResponse(
        registrationId=pending.id,
        email=pending.email,
        expiresIn=max(0, int((pending.expires_at - now).total_seconds())),
        resendAvailableIn=max(0, int((pending.resend_available_at - now).total_seconds())),
        attemptsRemaining=max(0, max_attempts - pending.attempt_count),
        sendCount=pending.send_count,
    )


def _verify_google_id_token(credential: str, client_id: str) -> GoogleAccountResponse:
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            client_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 登入憑證無效或已過期。",
        ) from error
    except GoogleAuthError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="暫時無法連線至 Google 驗證服務，請稍後再試。",
        ) from error

    email = claims.get("email")
    if not email or not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 帳號沒有已驗證的電子郵件。",
        )

    return GoogleAccountResponse(
        email=email,
        emailVerified=True,
        name=claims.get("name"),
        picture=claims.get("picture"),
        subject=claims["sub"],
    )


def _store_ticket(account: GoogleAccountResponse, role: str, redirect_path: str | None) -> str:
    ticket = secrets.token_urlsafe(32)
    now = time.time()
    with _ticket_lock:
        expired_tickets = [
            key
            for key, value in _oauth_tickets.items()
            if float(value["expiresAt"]) < now
        ]
        for expired_ticket in expired_tickets:
            _oauth_tickets.pop(expired_ticket, None)

        _oauth_tickets[ticket] = {
            "account": account,
            "role": _safe_role(role),
            "redirectPath": _safe_redirect_path(redirect_path),
            "expiresAt": now + TICKET_MAX_AGE_SECONDS,
        }
    return ticket


@router.get("/google/start")
def start_google_oauth(
    role: str = Query(default="tenant"),
    redirect_path: str | None = Query(default=None, alias="redirect"),
) -> RedirectResponse:
    client_id, client_secret, redirect_uri, _ = _google_config()
    safe_role = _safe_role(role)
    if not client_id or not client_secret:
        return _frontend_login_redirect(google_error="missing_config", role=safe_role)

    state_value = _create_signed_state(safe_role, redirect_path, client_secret)
    authorization_query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "state": state_value,
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(
        url=f"{GOOGLE_AUTHORIZATION_URL}?{authorization_query}",
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        key=STATE_COOKIE_NAME,
        value=state_value,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        secure=redirect_uri.startswith("https://"),
        samesite="lax",
        path="/api/auth/google",
    )
    return response


@router.get("/google/callback")
def google_oauth_callback(
    code: str | None = None,
    state_value: str | None = Query(default=None, alias="state"),
    oauth_error: str | None = Query(default=None, alias="error"),
    state_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE_NAME),
) -> RedirectResponse:
    client_id, client_secret, redirect_uri, _ = _google_config()
    if oauth_error:
        return _frontend_login_redirect(google_error="access_denied")
    if not client_id or not client_secret:
        return _frontend_login_redirect(google_error="missing_config")
    if not code or not state_value or not state_cookie:
        return _frontend_login_redirect(google_error="invalid_state")
    if not hmac.compare_digest(state_value, state_cookie):
        return _frontend_login_redirect(google_error="invalid_state")

    try:
        state_payload = _read_signed_state(state_value, client_secret)
        token_response = http_requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            timeout=15,
        )
        token_response.raise_for_status()
        credential = token_response.json().get("id_token")
        if not credential:
            raise ValueError("Google token response did not include an ID token")

        account = _verify_google_id_token(credential, client_id)
        ticket = _store_ticket(
            account,
            str(state_payload.get("role", "tenant")),
            state_payload.get("redirectPath") if isinstance(state_payload.get("redirectPath"), str) else None,
        )
        response = _frontend_login_redirect(google_ticket=ticket)
    except HTTPException:
        response = _frontend_login_redirect(google_error="verification_failed")
    except (GoogleAuthError, ValueError, http_requests.RequestException):
        response = _frontend_login_redirect(google_error="verification_failed")

    response.delete_cookie(key=STATE_COOKIE_NAME, path="/api/auth/google")
    return response


@router.post("/google/session", response_model=GoogleOAuthSessionResponse)
def exchange_google_ticket(
    payload: GoogleTicketRequest,
    db: Session = Depends(get_db),
) -> GoogleOAuthSessionResponse:
    with _ticket_lock:
        ticket_data = _oauth_tickets.pop(payload.ticket, None)

    if not ticket_data or float(ticket_data["expiresAt"]) < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 登入票證無效或已過期，請重新登入。",
        )

    account = ticket_data["account"]
    if not isinstance(account, GoogleAccountResponse):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google 登入資料格式錯誤。",
        )

    identity = db.query(UserIdentity).filter(
        UserIdentity.provider == "google",
        UserIdentity.provider_subject == account.subject,
    ).first()
    registration_required = identity is None
    requested_role = _safe_role(str(ticket_data["role"]))
    if identity and not db.query(UserRole).filter(
        UserRole.user_id == identity.user_id,
        UserRole.role == requested_role,
    ).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="此帳號尚未開通目前選擇的租客／房東身分。",
        )
    _, client_secret, _, _ = _google_config()
    registration_token = (
        _create_google_registration_token(
            account,
            requested_role,
            str(ticket_data["redirectPath"]) if ticket_data.get("redirectPath") else None,
            client_secret,
        )
        if registration_required
        else None
    )

    return GoogleOAuthSessionResponse(
        **account.model_dump(),
        flowVersion=2,
        role=requested_role,
        redirectPath=(
            str(ticket_data["redirectPath"])
            if ticket_data.get("redirectPath")
            else None
        ),
        registrationRequired=registration_required,
        registrationToken=registration_token,
    )


# 保留舊的 GIS credential 驗證端點，避免既有用戶端在部署切換期間失效。
@router.post("/google", response_model=GoogleAccountResponse)
def verify_google_login(payload: GoogleLoginRequest) -> GoogleAccountResponse:
    client_id, _, _, _ = _google_config()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="伺服器尚未設定 Google OAuth Client ID。",
        )
    return _verify_google_id_token(payload.credential, client_id)


@router.post("/registration/start", response_model=RegistrationPendingResponse)
def start_registration(
    payload: RegistrationStartRequest,
    db: Session = Depends(get_db),
) -> RegistrationPendingResponse:
    now = datetime.utcnow()
    expires_seconds, _, resend_cooldown, max_sends = _registration_limits()
    provider = "password"
    provider_subject = None
    display_name = None
    avatar_url = None
    password_hash = None
    role = _safe_role(payload.role)

    if payload.googleRegistrationToken:
        _, client_secret, _, _ = _google_config()
        token_payload = _read_google_registration_token(
            payload.googleRegistrationToken,
            client_secret,
        )
        account = token_payload["account"]
        if not isinstance(account, dict):
            raise HTTPException(status_code=401, detail="Google 註冊資料格式錯誤。")
        provider = "google"
        email = _normalize_email(str(account.get("email") or ""))
        provider_subject = str(account.get("subject") or "")
        display_name = str(account.get("name")) if account.get("name") else None
        avatar_url = str(account.get("picture")) if account.get("picture") else None
        role = _safe_role(str(token_payload.get("role") or role))
        if not provider_subject:
            raise HTTPException(status_code=401, detail="Google 註冊資料缺少帳號識別碼。")
    else:
        email = _normalize_email(payload.email)
        password = payload.password or ""
        if len(password) < 8 or len(password) > 128:
            raise HTTPException(status_code=422, detail="密碼長度必須介於 8 到 128 個字元。")
        password_hash = password_hasher.hash(password)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="此電子信箱已經註冊，請直接登入。")
    if provider_subject and db.query(UserIdentity).filter(
        UserIdentity.provider == provider,
        UserIdentity.provider_subject == provider_subject,
    ).first():
        raise HTTPException(status_code=409, detail="此 Google 帳號已經註冊，請直接登入。")

    pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == email
    ).with_for_update().first()
    if pending and pending.resend_available_at > now:
        retry_after = max(1, int((pending.resend_available_at - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail=f"寄送過於頻繁，請在 {retry_after} 秒後再試。",
            headers={"Retry-After": str(retry_after)},
        )
    if pending and pending.send_count >= max_sends:
        raise HTTPException(status_code=429, detail="驗證信寄送次數已達上限，請稍後重新註冊。")

    code = generate_verification_code()
    if pending is None:
        pending = PendingRegistration(
            id=str(uuid.uuid4()),
            email=email,
            provider=provider,
            send_count=1,
            created_at=now,
        )
        db.add(pending)
    else:
        pending.send_count += 1

    pending.provider = provider
    pending.provider_subject = provider_subject
    pending.display_name = display_name
    pending.avatar_url = avatar_url
    pending.password_hash = password_hash
    pending.role = role
    pending.invite_code = payload.inviteCode.strip() if payload.inviteCode else None
    pending.verification_code_hash = hash_verification_code(pending.id, code)
    pending.expires_at = now + timedelta(seconds=expires_seconds)
    pending.resend_available_at = now + timedelta(seconds=resend_cooldown)
    pending.attempt_count = 0
    pending.updated_at = now

    try:
        db.flush()
        send_verification_email(email, code, max(1, expires_seconds // 60))
        db.commit()
        db.refresh(pending)
    except EmailConfigurationError as error:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (OSError, smtplib.SMTPException) as error:
        db.rollback()
        raise HTTPException(status_code=503, detail="驗證信寄送失敗，請稍後再試。") from error
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="此帳號已有待驗證的註冊資料。") from error

    return _pending_response(pending, now)


@router.post("/registration/resend", response_model=RegistrationPendingResponse)
def resend_registration_code(
    payload: RegistrationIdRequest,
    db: Session = Depends(get_db),
) -> RegistrationPendingResponse:
    now = datetime.utcnow()
    expires_seconds, _, resend_cooldown, max_sends = _registration_limits()
    pending = db.query(PendingRegistration).filter(
        PendingRegistration.id == payload.registrationId
    ).with_for_update().first()
    if not pending:
        raise HTTPException(status_code=404, detail="找不到待驗證的註冊資料，請重新註冊。")
    if pending.resend_available_at > now:
        retry_after = max(1, int((pending.resend_available_at - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail=f"請在 {retry_after} 秒後再重新寄送。",
            headers={"Retry-After": str(retry_after)},
        )
    if pending.send_count >= max_sends:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=429, detail="驗證信寄送次數已達上限，請重新註冊。")

    code = generate_verification_code()
    pending.verification_code_hash = hash_verification_code(pending.id, code)
    pending.expires_at = now + timedelta(seconds=expires_seconds)
    pending.resend_available_at = now + timedelta(seconds=resend_cooldown)
    pending.attempt_count = 0
    pending.send_count += 1

    try:
        db.flush()
        send_verification_email(pending.email, code, max(1, expires_seconds // 60))
        db.commit()
        db.refresh(pending)
    except EmailConfigurationError as error:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (OSError, smtplib.SMTPException) as error:
        db.rollback()
        raise HTTPException(status_code=503, detail="驗證信寄送失敗，請稍後再試。") from error

    return _pending_response(pending, now)


@router.post("/registration/verify", response_model=RegistrationVerifyResponse)
def verify_registration(
    payload: RegistrationVerifyRequest,
    db: Session = Depends(get_db),
) -> RegistrationVerifyResponse:
    now = datetime.utcnow()
    _, max_attempts, _, _ = _registration_limits()
    pending = db.query(PendingRegistration).filter(
        PendingRegistration.id == payload.registrationId
    ).with_for_update().first()
    if not pending:
        raise HTTPException(status_code=404, detail="找不到待驗證的註冊資料，請重新註冊。")
    if pending.expires_at <= now:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=410, detail="驗證碼已過期，請重新註冊。")

    if not verification_code_matches(pending.id, payload.code, pending.verification_code_hash):
        pending.attempt_count += 1
        attempts_remaining = max(0, max_attempts - pending.attempt_count)
        if attempts_remaining == 0:
            db.delete(pending)
            db.commit()
            raise HTTPException(status_code=429, detail="驗證錯誤已達 3 次，請重新註冊。")
        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"驗證碼不正確，還可嘗試 {attempts_remaining} 次。",
        )

    user = User(
        email=pending.email,
        display_name=pending.display_name,
        avatar_url=pending.avatar_url,
        email_verified_at=now,
        created_at=now,
    )
    db.add(user)
    try:
        db.flush()
        db.add(UserRole(user_id=user.id, role=pending.role, created_at=now))
        if pending.provider == "google":
            db.add(UserIdentity(
                user_id=user.id,
                provider="google",
                provider_subject=pending.provider_subject,
                provider_email=pending.email,
                created_at=now,
            ))
        elif pending.password_hash:
            db.add(UserPasswordCredential(
                user_id=user.id,
                password_hash=pending.password_hash,
                password_changed_at=now,
            ))
        else:
            raise HTTPException(status_code=500, detail="註冊資料缺少登入憑證。")

        response = RegistrationVerifyResponse(
            email=pending.email,
            role=pending.role,
            displayName=pending.display_name,
            avatarUrl=pending.avatar_url,
        )
        db.delete(pending)
        db.commit()
        return response
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="帳號已由另一個驗證程序建立，請直接登入。") from error
