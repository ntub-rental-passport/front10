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
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from email_service import (
    EmailConfigurationError,
    send_admin_login_code,
    send_verification_email,
)
from models import (
    PendingAdminLogin,
    PendingRegistration,
    User,
    UserIdentity,
    UserPasswordCredential,
    UserRole,
)
from security import (
    CurrentUser,
    clear_auth_cookie,
    create_access_token,   # Bearer 版（Authorization 標頭）
    create_cookie_token,   # Cookie 版（HttpOnly JWT）
    get_current_user,
    set_auth_cookie,
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


class EmailLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)
    role: str


class EmailLoginResponse(BaseModel):
    userId: int
    email: str
    role: str
    displayName: str | None = None
    avatarUrl: str | None = None
    accessToken: str


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
    userId: int | None = None
    flowVersion: int = 2
    role: str
    redirectPath: str | None = None
    registrationRequired: bool
    registrationToken: str | None = None
    accessToken: str | None = None


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
    userId: int
    email: str
    role: str
    displayName: str | None = None
    avatarUrl: str | None = None
    accessToken: str


def _google_config() -> tuple[str, str, str, str]:
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


# ==========================================
# 1. 一般密碼登入
# ==========================================
# ==========================================
# 帳號狀態
# ==========================================

SUSPENDED_DETAIL = "此帳號已被停用，請聯絡管理員。"


def _reject_if_suspended(user: User) -> None:
    """帳號被停用時中止登入。

    ⚠️ 每一條登入路徑都必須呼叫這個函式。後台若有「停用」按鈕卻擋不住登入，
    那顆按鈕就是假的 —— 比沒有更糟，因為管理員會以為問題已經處理了。

    這裡的訊息刻意講明「已被停用」而非含糊的「帳號或密碼不正確」：
    停用是管理員主動做的處置，當事人有權知道自己被停權、該找誰處理；
    而且能走到這一步的人本來就已經通過帳密驗證，不存在洩漏帳號存在與否的問題。
    """
    if getattr(user, "status", "active") == "suspended":
        raise HTTPException(status_code=403, detail=SUSPENDED_DETAIL)


def _record_login(db: Session, user: User) -> None:
    """蓋上最後登入時間。

    失敗不影響登入 —— 這只是後台的參考資訊，
    不該因為寫不進去就把已經驗證成功的人擋在門外。
    """
    try:
        user.last_login_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()


@router.post("/login", response_model=EmailLoginResponse)
def login_with_email(
    payload: EmailLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> EmailLoginResponse:
    email = _normalize_email(payload.email)
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail="role-mismatch")

    user = db.query(User).filter(User.email == email).first()
    if user is None or user.password_credential is None:
        raise HTTPException(status_code=404, detail="account-not-found")
    if user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="email-not-verified")
    if not any(user_role.role == payload.role for user_role in user.roles):
        raise HTTPException(status_code=403, detail="role-mismatch")

    try:
        password_hasher.verify(user.password_credential.password_hash, payload.password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        raise HTTPException(status_code=401, detail="invalid-password")

    if password_hasher.check_needs_rehash(user.password_credential.password_hash):
        user.password_credential.password_hash = password_hasher.hash(payload.password)
        user.password_credential.password_changed_at = datetime.utcnow()
        db.commit()

    _reject_if_suspended(user)
    _record_login(db, user)

    # 登入成功：簽發 JWT 並放進 HttpOnly cookie，後續請求以此驗證身分。
    # 角色取自本次驗證通過的 payload.role —— 合併後 User 已無 role 欄位
    # （角色改存於 user_roles 表，一個帳號可有多重角色），
    # 故 token 記錄的是「本次以何種身分登入」，而非帳號的唯一角色。
    set_auth_cookie(response, create_cookie_token(user.id, user.email, payload.role))

    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role=payload.role,
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        accessToken=create_access_token(user.id, payload.role),
    )


def _registration_limits() -> tuple[int, int, int, int]:
    expires_seconds = int(os.getenv("VERIFICATION_CODE_EXPIRES_SECONDS", "120"))
    max_attempts = int(os.getenv("VERIFICATION_CODE_MAX_ATTEMPTS", "3"))
    resend_cooldown = int(os.getenv("VERIFICATION_RESEND_COOLDOWN_SECONDS", "60"))
    max_sends = int(os.getenv("VERIFICATION_MAX_SENDS", "5"))
    return expires_seconds, max_attempts, resend_cooldown, max_sends


def _google_http_session() -> http_requests.Session:
    session = http_requests.Session()
    session.trust_env = os.getenv("GOOGLE_OAUTH_TRUST_ENV_PROXY", "false").lower() in {
        "1",
        "true",
        "yes",
    }
    return session


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
        with _google_http_session() as session:
            claims = id_token.verify_oauth2_token(
                credential,
                GoogleRequest(session=session),
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
        with _google_http_session() as session:
            token_response = session.post(
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


# ==========================================
# 2. Google 登入 Session 交換 (自動建立/直接登入)
# ==========================================
@router.post("/google/session", response_model=GoogleOAuthSessionResponse)
def exchange_google_ticket(
    payload: GoogleTicketRequest,
    response: Response,
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

    _reject_if_suspended(user)
    _record_login(db, user)

    # Google 登入成功：與一般登入相同，簽發 JWT cookie（角色取本次登入所選身分）
    set_auth_cookie(response, create_cookie_token(user.id, user.email, requested_role))

    return GoogleOAuthSessionResponse(
        **account.model_dump(),
        userId=(identity.user_id if identity else None),
        flowVersion=2,
        role=requested_role,
        redirectPath=(
            str(ticket_data["redirectPath"])
            if ticket_data.get("redirectPath")
            else None
        ),
        registrationRequired=registration_required,
        registrationToken=registration_token,
        accessToken=(create_access_token(identity.user_id, requested_role) if identity else None),
    )


@router.post("/google", response_model=GoogleAccountResponse)
def verify_google_login(payload: GoogleLoginRequest) -> GoogleAccountResponse:
    client_id, _, _, _ = _google_config()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="伺服器尚未設定 Google OAuth Client ID。",
        )
    return _verify_google_id_token(payload.credential, client_id)


# ==========================================
# 3. 註冊發送信箱驗證碼
# ==========================================
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


# ==========================================
# 4. 完成信箱驗證，寫入 User 表
# ==========================================
@router.post("/registration/verify", response_model=RegistrationVerifyResponse)
def verify_registration(
    payload: RegistrationVerifyRequest,
    http_response: Response,
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

    # 建立正式的 User 紀錄
    user = User(
        email=pending.email,
        display_name=pending.display_name,
        avatar_url=pending.avatar_url,
        email_verified_at=now,
        created_at=now,
    )
    db.add(user)
    try:
        db.flush()  # 先取得新使用者的自增 id，才能建立關聯資料與簽發 token
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
            userId=user.id,
            email=pending.email,
            role=pending.role,
            displayName=pending.display_name,
            avatarUrl=pending.avatar_url,
            accessToken=create_access_token(user.id, pending.role),
        )
        db.delete(pending)
        db.commit()
        # 註冊完成即視為已登入：同時發出兩套憑證（見 security.py 開頭說明）
        # cookie 版供合約／OCR 端點使用，Bearer 版（response.accessToken）供房東／租客端點使用
        set_auth_cookie(http_response, create_cookie_token(user.id, user.email, pending.role))
        return response
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="帳號已由另一個驗證程序建立，請直接登入。") from error


# ==========================================
# 5. Session 查詢與登出
# ==========================================
@router.get("/me", response_model=EmailLoginResponse)
def get_me(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailLoginResponse:
    """回傳目前登入者資料。前端重新整理頁面時以此還原登入狀態。

    角色取自 cookie 中的 JWT（記錄本次以何種身分登入），而非查 User ——
    合併後角色改存於 user_roles 表，一個帳號可能同時是租客與房東，
    直接查表無從得知「這次登入的是哪個身分」。

    同時重新簽發 Bearer token，讓前端重新整理後仍能呼叫需要
    Authorization 標頭的端點（兩套憑證並存，見 security.py 說明）。
    """
    user = db.query(User).filter(User.id == current.id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號不存在，請重新登入。")

    # 已登入者被停用時，這裡是最快被觸發的檢查點：
    # 前端每次重新整理都會打 /me，不必等 cookie 過期
    _reject_if_suspended(user)

    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role=current.role,
        displayName=user.display_name,
        avatarUrl=getattr(user, "avatar_url", None),
        accessToken=create_access_token(user.id, current.role),
    )


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    """登出：清除 HttpOnly 認證 cookie。"""
    clear_auth_cookie(response)
    return {"ok": True}


# ==========================================
# 6. 管理員登入（兩階段：帳密 → 信箱驗證碼）
# ==========================================
#
# 為何管理員需要第二階段驗證，而一般使用者不需要：
# 管理員可存取全站使用者資料、調整系統設定、關閉功能，
# 帳密外洩的損害遠大於單一使用者帳號。要求「必須能收到該信箱的信」，
# 可擋下純粹的帳密外洩（攻擊者有密碼但沒有信箱存取權）。
#
# 附帶效果：驗證信本身即是入侵偵測 —— 帳密若遭盜用，
# 真正的管理員會先收到一封自己沒有發起的登入通知。

ADMIN_LOGIN_CODE_EXPIRES_SECONDS = 5 * 60
ADMIN_LOGIN_MAX_ATTEMPTS = 3


class AdminLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)


class AdminLoginChallengeResponse(BaseModel):
    """第一階段回應：不含任何身分資訊，僅給後續驗證用的識別碼。"""

    challengeId: str
    email: str
    expiresIn: int
    attemptsRemaining: int


class AdminLoginVerifyRequest(BaseModel):
    challengeId: str = Field(min_length=36, max_length=36)
    code: str = Field(pattern=r"^\d{6}$")


def _client_ip(request: Request) -> str | None:
    """取得真實來源 IP。

    正式環境經 Cloudflare 與 Nginx 代理，直接取連線位址只會得到代理的 IP。
    Nginx 已設定 real_ip 還原並轉發 X-Forwarded-For，取其第一段即原始來源。
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host[:45] if request.client else None


@router.post("/admin/login", response_model=AdminLoginChallengeResponse)
def admin_login_start(
    payload: AdminLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AdminLoginChallengeResponse:
    """第一階段：驗證帳密與管理員身分，寄出驗證碼。

    ⚠️ 所有失敗情形一律回相同的 401 與相同訊息 —— 不可透露
    「帳號不存在」「不是管理員」「密碼錯誤」之別，否則等同提供
    攻擊者一個列舉管理員帳號的工具。
    """
    email = _normalize_email(payload.email)
    generic_error = HTTPException(status_code=401, detail="帳號或密碼不正確。")

    user = db.query(User).filter(User.email == email).first()
    if user is None or user.password_credential is None:
        raise generic_error
    if not any(r.role == "admin" for r in user.roles):
        raise generic_error
    try:
        password_hasher.verify(user.password_credential.password_hash, payload.password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        raise generic_error

    # 停用的帳號連驗證碼都不該寄出：寄了等於讓被停權的人以為還能登入，
    # 也讓攻擊者能拿被停用的管理員帳號當寄信管道
    _reject_if_suspended(user)

    now = datetime.utcnow()

    # 同一帳號同時只保留一組有效挑戰，避免併發登入產生多組可用驗證碼
    db.query(PendingAdminLogin).filter(PendingAdminLogin.user_id == user.id).delete()

    code = generate_verification_code()
    challenge_id = str(uuid.uuid4())
    client_ip = _client_ip(request)

    challenge = PendingAdminLogin(
        id=challenge_id,
        user_id=user.id,
        email=user.email,
        verification_code_hash=hash_verification_code(challenge_id, code),
        expires_at=now + timedelta(seconds=ADMIN_LOGIN_CODE_EXPIRES_SECONDS),
        attempt_count=0,
        request_ip=client_ip,
        created_at=now,
    )
    db.add(challenge)

    try:
        db.flush()
        send_admin_login_code(
            user.email,
            code,
            max(1, ADMIN_LOGIN_CODE_EXPIRES_SECONDS // 60),
            client_ip,
        )
        db.commit()
    except EmailConfigurationError as error:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (OSError, smtplib.SMTPException) as error:
        db.rollback()
        raise HTTPException(status_code=503, detail="驗證信寄送失敗，請稍後再試。") from error

    return AdminLoginChallengeResponse(
        challengeId=challenge_id,
        email=user.email,
        expiresIn=ADMIN_LOGIN_CODE_EXPIRES_SECONDS,
        attemptsRemaining=ADMIN_LOGIN_MAX_ATTEMPTS,
    )


@router.post("/admin/verify", response_model=EmailLoginResponse)
def admin_login_verify(
    payload: AdminLoginVerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> EmailLoginResponse:
    """第二階段：驗證碼正確才簽發憑證，完成登入。"""
    now = datetime.utcnow()
    challenge = (
        db.query(PendingAdminLogin)
        .filter(PendingAdminLogin.id == payload.challengeId)
        .with_for_update()
        .first()
    )

    if challenge is None:
        raise HTTPException(status_code=404, detail="登入請求不存在，請重新登入。")
    if challenge.expires_at <= now:
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=410, detail="驗證碼已過期，請重新登入。")

    if not verification_code_matches(challenge.id, payload.code, challenge.verification_code_hash):
        challenge.attempt_count += 1
        remaining = max(0, ADMIN_LOGIN_MAX_ATTEMPTS - challenge.attempt_count)
        if remaining == 0:
            # 次數用盡即作廢整組挑戰，必須重新輸入帳密 —— 使暴力猜測
            # 六位數驗證碼的成本回到「需先通過帳密驗證」
            db.delete(challenge)
            db.commit()
            raise HTTPException(status_code=429, detail="驗證錯誤次數過多，請重新登入。")
        db.commit()
        raise HTTPException(status_code=400, detail=f"驗證碼不正確，還可嘗試 {remaining} 次。")

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if user is None or not any(r.role == "admin" for r in user.roles):
        # 帳號在挑戰有效期間被刪除或撤銷管理員權限
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=403, detail="此帳號已無管理員權限。")

    db.delete(challenge)
    db.commit()

    # 挑戰有效期間才被停用的情況：驗證碼是正確的，但帳號已經不能用了
    _reject_if_suspended(user)
    _record_login(db, user)

    # 與其他登入路徑一致：同時發出 cookie 與 Bearer 兩套憑證
    set_auth_cookie(response, create_cookie_token(user.id, user.email, "admin"))
    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role="admin",
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        accessToken=create_access_token(user.id, "admin"),
    )
