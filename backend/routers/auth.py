import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import smtplib
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode, urlparse, urlsplit, urlunsplit

import requests as http_requests
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from dotenv import dotenv_values, load_dotenv
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from admin import audit_service
from admin import platform_settings
from db.database import get_db
from notifications.email_service import (
    EmailConfigurationError,
    send_admin_login_code,
    send_verification_email,
)
from db.models import (
    AdminSession,
    PendingAdminLogin,
    PendingRegistration,
    User,
    UserIdentity,
    UserRole,
)
from auth.security import (
    CurrentUser,
    admin_session_from,
    clear_auth_cookie,
    create_access_token,   # Bearer 版（Authorization 標頭）
    create_cookie_token,   # Cookie 版（HttpOnly JWT）
    get_current_user,
    set_auth_cookie,
)
from auth.verification import (
    generate_verification_code,
    hash_verification_code,
    verification_code_matches,
)


ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ROOT_ENV_FILE)

logger = logging.getLogger(__name__)

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

    user = db.query(User).filter(User.email == email, User.has_role(payload.role)).first()
    if user is None or not user.password_hash:
        raise HTTPException(status_code=404, detail="account-not-found")
    if user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="email-not-verified")
    if not user.has_role(payload.role):
        raise HTTPException(status_code=403, detail="role-mismatch")

    try:
        password_hasher.verify(user.password_hash, payload.password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        raise HTTPException(status_code=401, detail="invalid-password")

    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(payload.password)
        user.password_changed_at = datetime.utcnow()
        db.commit()

    _reject_if_suspended(user)
    _record_login(db, user)

    # 登入成功：簽發 JWT 並放進 HttpOnly cookie，後續請求以此驗證身分。
    # payload.role 已與 user_roles 核對；token 代表本次選定的身分。
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
    request: Request,
    role: str = Query(default="tenant"),
    redirect_path: str | None = Query(default=None, alias="redirect"),
) -> RedirectResponse:
    client_id, client_secret, redirect_uri, _ = _google_config()
    safe_role = _safe_role(role)
    if not client_id or not client_secret:
        return _frontend_login_redirect(google_error="missing_config", role=safe_role)

    # OAuth state cookie 必須與 callback 使用相同主機名稱。
    # 本機可能從 127.0.0.1 開頁，但 Google 設定的 callback 是 localhost。
    callback = urlsplit(redirect_uri)
    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    if (
        request.url.hostname in loopback_hosts
        and callback.hostname in loopback_hosts
        and request.url.hostname != callback.hostname
    ):
        query = urlencode({"role": safe_role, "redirect": _safe_redirect_path(redirect_path)})
        return RedirectResponse(
            url=urlunsplit((callback.scheme, callback.netloc, "/api/auth/google/start", query, "")),
            status_code=status.HTTP_302_FOUND,
        )

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

    requested_role = _safe_role(str(ticket_data["role"]))
    identity = db.query(UserIdentity).filter(
        UserIdentity.provider == "google",
        UserIdentity.provider_subject == account.subject,
    ).first()
    user = None
    if identity:
        user = db.query(User).filter(User.id == identity.user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Google 帳號對應的會員資料不存在，請聯絡管理者。")
        _reject_if_suspended(user)
    registration_required = user is None or not user.has_role(requested_role)
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

    # ⚠️ 憑證只在「已綁定過 Google 的帳號」時簽發。
    #
    # registration_required 為 True 代表這個 Google 帳號還沒有對應的本站帳號，
    # 此時只回註冊票證讓前端引導完成註冊 —— 還不是登入狀態，不可給 cookie。
    #
    # 這裡原本直接寫 create_cookie_token(user.id, ...)，但這個函式裡從來沒有
    # user 這個變數（合併 main 時留下的），只要真的走到就會 NameError。
    # 之所以很久沒被發現，是因為 Google 的 redirect URI 尚未設定完成，
    # 這支端點一直到不了 —— 設定完成後第一次執行就 500。
    #
    # identity 在但 user 不見了 → 401 且請對方聯絡管理者，不是叫他重新註冊：
    # identity 還在的話重新註冊會撞到唯一鍵，等於叫人去撞牆。
    # Only a registered identity with the requested role may receive a login cookie.
    # New Google accounts must finish registration before becoming authenticated.
    if not registration_required:
        _record_login(db, user)
        set_auth_cookie(response, create_cookie_token(user.id, user.email, requested_role))

    return GoogleOAuthSessionResponse(
        **account.model_dump(),
        userId=(user.id if not registration_required else None),
        flowVersion=2,
        role=requested_role,
        redirectPath=(
            str(ticket_data["redirectPath"])
            if ticket_data.get("redirectPath")
            else None
        ),
        registrationRequired=registration_required,
        registrationToken=registration_token,
        accessToken=(create_access_token(user.id, requested_role) if not registration_required else None),
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
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail="role-mismatch")
    role = payload.role

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
        role = str(token_payload.get("role") or role)
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=422, detail="role-mismatch")
        if not provider_subject:
            raise HTTPException(status_code=401, detail="Google 註冊資料缺少帳號識別碼。")
    else:
        email = _normalize_email(payload.email)
        password = payload.password or ""
        # 最短長度照後台「系統設定」（platform_settings.py）；已註冊的人不受影響
        minimum = platform_settings.password_min_length()
        if len(password) < minimum or len(password) > platform_settings.PASSWORD_MAX_LENGTH:
            raise HTTPException(
                status_code=422,
                detail=f"密碼長度必須介於 {minimum} 到 {platform_settings.PASSWORD_MAX_LENGTH} 個字元。",
            )
        password_hash = password_hasher.hash(password)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        _reject_if_suspended(existing_user)
        if existing_user.has_role(role):
            raise HTTPException(status_code=409, detail="此電子信箱已有此身分，請直接登入。")
        if provider == "password":
            if not existing_user.password_hash:
                raise HTTPException(status_code=409, detail="請使用原有 Google 登入方式新增身分。")
            try:
                password_hasher.verify(existing_user.password_hash, payload.password)
            except (InvalidHashError, VerificationError, VerifyMismatchError):
                raise HTTPException(status_code=401, detail="invalid-password")
    identity = db.query(UserIdentity).filter(
        UserIdentity.provider == provider,
        UserIdentity.provider_subject == provider_subject,
    ).first() if provider_subject else None
    if identity and (existing_user is None or identity.user_id != existing_user.id):
        raise HTTPException(status_code=409, detail="此 Google 身分已綁定其他帳號。")

    pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == email, PendingRegistration.role == role
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

    if pending.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="公開註冊不能授予此身分。")
    # 驗證信箱所有權後，沿用既有帳號；不覆寫其密碼或個人資料。
    user = db.query(User).filter(User.email == pending.email).with_for_update().first()
    is_new = user is None
    if is_new:
        user = User(email=pending.email, display_name=pending.display_name,
                    avatar_url=pending.avatar_url, email_verified_at=now, created_at=now)
        db.add(user)
    else:
        _reject_if_suspended(user)
        if user.has_role(pending.role):
            raise HTTPException(status_code=409, detail="此帳號已有此身分，請直接登入。")
    try:
        db.flush()  # 先取得新使用者的自增 id，才能建立關聯資料與簽發 token
        if pending.provider == "google":
            identity = db.query(UserIdentity).filter(
                UserIdentity.provider == "google",
                UserIdentity.provider_subject == pending.provider_subject,
            ).first()
            if identity and identity.user_id != user.id:
                raise HTTPException(status_code=409, detail="此 Google 身分已綁定其他帳號。")
            if not identity:
                db.add(UserIdentity(user_id=user.id, provider="google",
                    provider_subject=pending.provider_subject, provider_email=pending.email, created_at=now))
        elif pending.password_hash:
            if is_new:
                user.password_hash = pending.password_hash
                user.password_changed_at = now
        else:
            raise HTTPException(status_code=500, detail="註冊資料缺少登入憑證。")

        user.roles.append(UserRole(role=pending.role))
        user.email_verified_at = user.email_verified_at or now
        user.last_login_at = now
        response = RegistrationVerifyResponse(
            userId=user.id,
            email=user.email,
            role=pending.role,
            displayName=user.display_name,
            avatarUrl=user.avatar_url,
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
    except HTTPException:
        db.rollback()
        raise


# ==========================================
# 5. Session 查詢與登出
# ==========================================
@router.get("/me", response_model=EmailLoginResponse)
def get_me(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailLoginResponse:
    """Restore the selected session role only while the account still owns it."""
    user = db.query(User).filter(User.id == current.id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號不存在，請重新登入。")

    if not user.has_role(current.role):
        raise HTTPException(status_code=401, detail="Account role changed; sign in again")

    # 已登入者被停用時，這裡是最快被觸發的檢查點：
    # 前端每次重新整理都會打 /me，不必等 cookie 過期
    _reject_if_suspended(user)

    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role=current.role,
        displayName=user.display_name,
        avatarUrl=getattr(user, "avatar_url", None),
        # 沿用 cookie 的到期時間：重新整理不該把登入期限延長一輪
        accessToken=create_access_token(user.id, current.role, expires_at=current.exp, sid=current.sid),
    )


class ProfileUpdateRequest(BaseModel):
    displayName: str = Field(min_length=1, max_length=100)


@router.patch("/profile", response_model=EmailLoginResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailLoginResponse:
    """更新顯示名稱。

    註冊最後一步（/welcome）就是呼叫這裡 —— 暱稱只存在 localStorage 的話，
    換一台裝置登入就會被當成「還沒設定暱稱」，再被要求輸入一次。
    """
    user = db.query(User).filter(User.id == current.id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號不存在，請重新登入。")
    if not user.has_role(current.role):
        raise HTTPException(status_code=401, detail="Account role changed; sign in again")
    _reject_if_suspended(user)

    display_name = payload.displayName.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="顯示名稱不能為空白。")

    user.display_name = display_name
    db.commit()
    db.refresh(user)

    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role=current.role,
        displayName=user.display_name,
        avatarUrl=getattr(user, "avatar_url", None),
        accessToken=create_access_token(user.id, current.role),
    )


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, bool]:
    """登出：清除 HttpOnly 認證 cookie；管理員的話，連伺服器端的登入紀錄一起刪掉，
    手上那張 Bearer token 也就跟著失效，不必等它自己過期。"""
    try:
        current = get_current_user(request, db)
    except HTTPException:
        current = None
    if current is not None and current.sid:
        db.query(AdminSession).filter(AdminSession.id == current.sid).delete()
        db.commit()
    clear_auth_cookie(response)
    return {"ok": True}


@router.post("/admin/activity")
def report_admin_activity(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """前端偵測到管理員真的在操作（滑鼠、鍵盤）時回報，延後閒置登出。

    只有這支會更新最後操作時間；一般 API 請求不會 —— 見 security.admin_session_from。
    已經閒置過頭的，這裡跟其他後台 API 一樣回 401，不能用回報來「復活」。
    """
    _, admin_session = admin_session_from(authorization, db)
    admin_session.last_active_at = datetime.utcnow()
    db.commit()
    return {"idleMinutes": platform_settings.ADMIN_IDLE_MINUTES}


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


# 本機開發：資料庫在這幾個主機上，才允許免驗證碼登入
_LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _dev_no_2fa_email() -> str:
    """本機開發時可以免驗證碼登入的那一個帳號。沒有就回空字串。

    ## 為什麼需要

    管理員登入的第二階段靠信箱收驗證碼。開發用的測試帳號信箱是假的
    （admin@rentmate.tw 這種），信寄得出去但沒有人收得到 ——
    結果是後台頁面在開發機根本打不開。

    真正的管理員用真信箱，不受影響，也不該受影響。

    ## 兩道守衛，缺一不可

      1. DEV_ADMIN_NO_2FA_EMAIL 必須設定，而且只對這一個帳號生效
      2. DATABASE_URL 的主機必須是本機

    第 2 道是結構性的：VM 上的 DATABASE_URL 指向 compose 的 `mysql`
    主機名，所以就算有人不小心把 DEV_ADMIN_NO_2FA_EMAIL 抄進正式環境的
    .env，這裡也不會生效。只靠環境變數的話，一次複製貼上就會把
    2FA 關掉，而且不會有任何人發現。

    ## 它沒有繞過的東西

    挑戰紀錄、雜湊、嘗試次數上限、過期時間全部照走，/admin/verify
    也是同一個端點 —— 只是把驗證碼從信箱改成直接回給前端。
    帳號密碼一樣要正確，停用的帳號一樣進不來。
    """
    email = (os.getenv("DEV_ADMIN_NO_2FA_EMAIL") or "").strip().lower()
    if not email:
        return ""

    host = (urlparse(os.getenv("DATABASE_URL", "")).hostname or "").lower()
    if host not in _LOCAL_DB_HOSTS:
        logger.warning(
            "DEV_ADMIN_NO_2FA_EMAIL 有設定，但資料庫主機是「%s」不是本機 —— 已忽略。"
            "免驗證碼登入只能用在開發機。",
            host or "（未設定）",
        )
        return ""

    return email


class AdminLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)


class AdminLoginChallengeResponse(BaseModel):
    """第一階段回應：不含任何身分資訊，僅給後續驗證用的識別碼。

    devCode 只在本機開發、且該帳號被明確指定時才有值（見 _dev_no_2fa_email）。
    正式環境永遠是 None —— 驗證碼只會出現在信箱裡。
    """

    challengeId: str
    email: str
    expiresIn: int
    attemptsRemaining: int
    devCode: str | None = None


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

    user = db.query(User).filter(User.email == email, User.has_role("admin")).first()
    if user is None or not user.password_hash:
        raise generic_error
    if not user.has_role("admin"):
        raise generic_error
    try:
        password_hasher.verify(user.password_hash, payload.password)
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

    # 本機開發的指定帳號：不寄信，驗證碼直接回給前端。
    #
    # 之所以需要這條路：測試帳號的信箱是假的，寄出去沒人收得到。
    #
    # 注意這裡**沒有**跳過驗證 —— 挑戰紀錄照建、雜湊照算、嘗試次數與
    # 過期時間照舊，前端仍要拿這個碼去打 /admin/verify。差別只在
    # 「碼從哪裡來」。這樣就不會多出一條沒人在看的登入路徑。
    if email == _dev_no_2fa_email():
        db.commit()
        logger.warning("本機免驗證碼登入：%s（正式環境不會有這行）", user.email)
        return AdminLoginChallengeResponse(
            challengeId=challenge_id,
            email=user.email,
            expiresIn=ADMIN_LOGIN_CODE_EXPIRES_SECONDS,
            attemptsRemaining=ADMIN_LOGIN_MAX_ATTEMPTS,
            devCode=code,
        )

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


def _audit_admin_login(email: str, user_id: int, detail: str, request: Request) -> None:
    """管理員登入寫進稽核紀錄。只記這一步（驗證碼）—— 能拿到後台權限的只有這條路，
    帳密那一步的失敗不記，理由見 audit_service 的說明。"""
    audit_service.record(
        "登入", email, detail, actor=email, subject=f"user:{user_id}", ip=_client_ip(request)
    )


@router.post("/admin/verify", response_model=EmailLoginResponse)
def admin_login_verify(
    payload: AdminLoginVerifyRequest,
    request: Request,
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
        # 走到這一步代表帳密是對的：驗證碼過不了，密碼很可能已經外洩
        email, user_id = challenge.email, challenge.user_id
        if remaining == 0:
            # 次數用盡即作廢整組挑戰，必須重新輸入帳密 —— 使暴力猜測
            # 六位數驗證碼的成本回到「需先通過帳密驗證」
            db.delete(challenge)
            db.commit()
            _audit_admin_login(
                email,
                user_id,
                f"帳密正確，但驗證碼錯誤 {ADMIN_LOGIN_MAX_ATTEMPTS} 次，這次登入已作廢",
                request,
            )
            raise HTTPException(status_code=429, detail="驗證錯誤次數過多，請重新登入。")
        db.commit()
        _audit_admin_login(email, user_id, f"帳密正確，但驗證碼錯誤（還可再試 {remaining} 次）", request)
        raise HTTPException(status_code=400, detail=f"驗證碼不正確，還可嘗試 {remaining} 次。")

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if user is None or not user.has_role("admin"):
        # 帳號在挑戰有效期間被刪除或撤銷管理員權限
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=403, detail="此帳號已無管理員權限。")

    db.delete(challenge)
    db.commit()

    # 挑戰有效期間才被停用的情況：驗證碼是正確的，但帳號已經不能用了
    _reject_if_suspended(user)
    _record_login(db, user)
    _audit_admin_login(user.email, user.id, "管理員登入", request)

    # 伺服器端的登入紀錄：閒置太久就作廢（見 security.admin_session_from）
    admin_session = AdminSession(id=str(uuid.uuid4()), user_id=user.id, created_at=now, last_active_at=now)
    db.add(admin_session)
    db.commit()

    # 與其他登入路徑一致：同時發出 cookie 與 Bearer 兩套憑證
    set_auth_cookie(response, create_cookie_token(user.id, user.email, "admin", sid=admin_session.id))
    return EmailLoginResponse(
        userId=user.id,
        email=user.email,
        role="admin",
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        accessToken=create_access_token(user.id, "admin", sid=admin_session.id),
    )
