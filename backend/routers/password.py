"""Email recovery and authenticated password changes for shared tenant/landlord accounts."""
import hashlib
import re
import smtplib
import threading
import time
import uuid
from datetime import datetime, timedelta

from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from admin import platform_settings
from auth.security import CurrentUser, clear_auth_cookie, get_current_user
from auth.verification import generate_verification_code, hash_verification_code, verification_code_matches
from db.database import get_db
from db.models import AdminSession, PasswordResetChallenge, PendingAdminLogin, PendingRegistration, User
from notifications.email_service import EmailConfigurationError, _smtp_config, send_password_reset_code
from routers.auth import password_hasher

router = APIRouter(prefix='/api/auth/password', tags=['Authentication'])
EXPIRY = 600
COOLDOWN = 60
MAX_ATTEMPTS = 5
MAX_SENDS = 5
GENERIC_MESSAGE = '若此信箱有可重設密碼的帳號，將收到驗證信。請同時檢查垃圾郵件。'
INVALID_CODE = '驗證碼不正確、已失效或已使用，請重新申請。'
_change_attempts: dict[int, list[float]] = {}
_change_lock = threading.Lock()


class ResetStart(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetComplete(BaseModel):
    challengeId: str = Field(min_length=36, max_length=36)
    code: str = Field(pattern=r'^\d{6}$')
    newPassword: str = Field(min_length=1, max_length=128)


class PasswordChange(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=1, max_length=128)


def _fingerprint(user: User | None) -> str:
    return hashlib.sha256((user.password_hash if user and user.password_hash else '').encode()).hexdigest()


def _eligible(user: User | None) -> bool:
    # Google-only users keep their Google sign-in; this route never grants a new login method.
    return bool(user and user.status == 'active' and user.password_hash and user.email_verified_at
                and (user.has_role('tenant') or user.has_role('landlord')) and not user.has_role('admin'))


def _validate_password(value: str) -> None:
    minimum = platform_settings.password_min_length()
    if not minimum <= len(value) <= platform_settings.PASSWORD_MAX_LENGTH:
        raise HTTPException(422, f'密碼長度必須介於 {minimum} 到 {platform_settings.PASSWORD_MAX_LENGTH} 個字元。')


def _matches(user: User, value: str) -> bool:
    try:
        return password_hasher.verify(user.password_hash, value)
    except (VerificationError, InvalidHashError, TypeError):
        return False


def _replace_password(db: Session, user: User, new_password: str) -> None:
    if _matches(user, new_password):
        raise HTTPException(422, '新密碼不能與原密碼相同。')
    user.password_hash = password_hasher.hash(new_password)
    user.password_changed_at = datetime.utcnow()
    # Invalidate outstanding registration/second-factor challenges as well as active sessions.
    db.query(PendingRegistration).filter(PendingRegistration.email == user.email).delete()
    db.query(PendingAdminLogin).filter(PendingAdminLogin.user_id == user.id).delete()
    db.query(AdminSession).filter(AdminSession.user_id == user.id).delete()
    db.query(PasswordResetChallenge).filter(PasswordResetChallenge.email == user.email).update({'consumed': True})


@router.post('/reset/start')
def start_reset(payload: ResetStart, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(422, '請輸入有效的電子信箱。')
    # Validate service configuration regardless of account existence.
    try:
        _smtp_config()
    except (EmailConfigurationError, ValueError):
        raise HTTPException(503, '驗證信服務暫時無法使用，請稍後再試。')
    now = datetime.utcnow()
    ip = request.client.host[:45] if request.client else 'unknown'
    recent_sends = db.query(func.coalesce(func.sum(PasswordResetChallenge.send_count), 0)).filter(
        PasswordResetChallenge.request_ip == ip,
        PasswordResetChallenge.window_started_at > now - timedelta(hours=1),
    ).scalar()
    if recent_sends >= 30:
        raise HTTPException(429, '申請次數過多，請一小時後再試。', headers={'Retry-After': '3600'})
    # Lock account first, then challenge: same lock order as completion/change.
    user = db.query(User).filter(User.email == email).with_for_update().first()
    pending = db.query(PasswordResetChallenge).filter(PasswordResetChallenge.email == email).with_for_update().first()
    if pending and pending.resend_available_at > now:
        seconds = max(1, int((pending.resend_available_at - now).total_seconds()) + 1)
        raise HTTPException(429, f'請在 {seconds} 秒後再寄送。', headers={'Retry-After': str(seconds)})
    if pending and pending.window_started_at > now - timedelta(hours=1) and pending.send_count >= MAX_SENDS:
        raise HTTPException(429, '此信箱的申請次數已達上限，請一小時後再試。', headers={'Retry-After': '3600'})
    if pending is None:
        pending = PasswordResetChallenge(email=email, window_started_at=now, send_count=0)
        db.add(pending)
    if pending.window_started_at <= now - timedelta(hours=1):
        pending.window_started_at = now
        pending.send_count = 0
    pending.id = str(uuid.uuid4())
    code = generate_verification_code()
    pending.code_hash = hash_verification_code('password-reset:' + pending.id, code)
    pending.user_id = user.id if _eligible(user) else None
    pending.credential_hash = _fingerprint(user)
    pending.expires_at = now + timedelta(seconds=EXPIRY)
    pending.resend_available_at = now + timedelta(seconds=COOLDOWN)
    pending.attempt_count = 0
    pending.send_count += 1
    pending.request_ip = ip
    pending.consumed = False
    try:
        db.flush()
        if pending.user_id:
            send_password_reset_code(email, code)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(429, '已有申請正在處理，請稍後再試。', headers={'Retry-After': '60'})
    except (EmailConfigurationError, smtplib.SMTPException, OSError):
        db.rollback()
        raise HTTPException(503, '驗證信寄送失敗，請稍後重新申請。')
    return {'challengeId': pending.id, 'expiresIn': EXPIRY, 'resendAvailableIn': COOLDOWN,
            'message': GENERIC_MESSAGE}


@router.post('/reset/complete')
def complete_reset(payload: ResetComplete, response: Response, db: Session = Depends(get_db)):
    _validate_password(payload.newPassword)
    candidate = db.query(PasswordResetChallenge).filter(PasswordResetChallenge.id == payload.challengeId).first()
    if candidate is None:
        raise HTTPException(400, INVALID_CODE)
    user = db.query(User).filter(User.id == candidate.user_id).with_for_update().first() if candidate.user_id else None
    pending = db.query(PasswordResetChallenge).filter(PasswordResetChallenge.id == payload.challengeId).populate_existing().with_for_update().first()
    if not pending or pending.consumed or pending.expires_at <= datetime.utcnow() or pending.attempt_count >= MAX_ATTEMPTS:
        raise HTTPException(400, INVALID_CODE)
    valid = verification_code_matches('password-reset:' + pending.id, payload.code, pending.code_hash)
    if not valid or not _eligible(user) or pending.credential_hash != _fingerprint(user):
        pending.attempt_count += 1
        db.commit()
        raise HTTPException(400, INVALID_CODE)
    # Conditional consumption also protects SQLite, where SELECT FOR UPDATE is ignored.
    claimed = db.query(PasswordResetChallenge).filter(
        PasswordResetChallenge.id == payload.challengeId,
        PasswordResetChallenge.consumed.is_(False),
    ).update({'consumed': True}, synchronize_session=False)
    if claimed != 1:
        raise HTTPException(400, INVALID_CODE)
    _replace_password(db, user, payload.newPassword)
    db.commit()
    clear_auth_cookie(response)
    return {'ok': True}


@router.post('/change')
def change_password(payload: PasswordChange, response: Response,
                    current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    _validate_password(payload.newPassword)
    with _change_lock:
        now = time.monotonic()
        for key in list(_change_attempts):
            _change_attempts[key] = [t for t in _change_attempts[key] if t > now - 900]
            if not _change_attempts[key]:
                del _change_attempts[key]
        attempts = _change_attempts.setdefault(current.id, [])
        if len(attempts) >= 5:
            raise HTTPException(429, '嘗試次數過多，請 15 分鐘後再試。')
        attempts.append(now)
    user = db.query(User).filter(User.id == current.id).populate_existing().with_for_update().first()
    if not _eligible(user):
        raise HTTPException(400, '此帳號無法在此修改密碼；Google 帳號請至 Google 管理密碼。')
    if not _matches(user, payload.currentPassword):
        raise HTTPException(400, '目前密碼不正確。')
    _replace_password(db, user, payload.newPassword)
    db.commit()
    with _change_lock:
        _change_attempts.pop(current.id, None)
    clear_auth_cookie(response)
    return {'ok': True}
