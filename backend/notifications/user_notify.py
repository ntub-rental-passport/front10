"""從業務流程發一則通知給一個帳號（房東催繳、租客接受邀請…）。

跟 inbox_service 寫的是同一張 inbox_messages，但走呼叫端的 SQLAlchemy session：
通知跟觸發它的那個動作在同一筆交易裡，動作失敗通知就不會出現，反之亦然。

Email：email=True 而且 SMTP 有設定時，同一則通知也寄一份 Email。
寄信在交易 commit 之後才在背景執行緒進行 —— 動作 rollback 的話不會寄出，
也不會讓使用者的請求等 SMTP。每封寄出／失敗記在 inbox_messages.email_state，
後台的發送紀錄看得到（跟後台的「立即發送」同一套，見 inbox_service.send_pending_emails）。
"""
import logging
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.orm import Session

from db.models import InboxMessage, User

logger = logging.getLogger(__name__)

CATEGORIES = ('系統', '租約', '補貼', '帳務')
_PENDING_KEY = 'pending_email_batches'


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def email_available() -> bool:
    """業務通知寄 Email 的總開關：要明確設定 LANDLORD_EMAIL_ENABLED=true 才會寄。

    2026-10-06 開發機的後端與測試在共用 SMTP 下寄出大量信件給組員，所以預設關閉。
    """
    import os
    from notifications.scheduled_notification_service import email_configured
    return os.getenv('LANDLORD_EMAIL_ENABLED', '').lower() == 'true' and email_configured()


def notify_user(
    db,
    user: User,
    *,
    title: str,
    body: str,
    category: str,
    source_label: str,
    created_by: str,
    action_url: str | None = None,
    action_label: str | None = None,
    email: bool = False,
) -> InboxMessage:
    if category not in CATEGORIES:
        raise ValueError(f'不認得的通知分類：{category}')
    with_email = bool(email and user.email and email_available())
    message = InboxMessage(
        id=f'nm-{uuid.uuid4().hex[:12]}',
        batch_id=f'nb-{uuid.uuid4().hex[:12]}',
        user_id=user.id,
        user_email=user.email,
        title=title[:100],
        body=body[:2000],
        category=category,
        channels='["inapp", "email"]' if with_email else '["inapp"]',
        inapp_state='sent',
        email_state='pending' if with_email else None,
        push_state=None,
        recipient_label=(user.display_name or user.email)[:60],
        source_label=source_label[:60],
        source_type='landlord',
        action_url=action_url,
        action_label=(action_label or '')[:20] or None if action_url else None,
        created_by=created_by[:255],
        created_at=_iso_now(),
        read_at=None,
    )
    db.add(message)
    if with_email:
        db.info.setdefault(_PENDING_KEY, []).append(message.batch_id)
    return message


def _send_batches(batch_ids: list[str]) -> None:
    from notifications.inbox_service import send_pending_emails
    for batch_id in batch_ids:
        try:
            send_pending_emails(batch_id)
        except Exception:
            # 寄不出去記在 email_state = failed（send_pending_emails 內），這裡只防整個執行緒炸掉
            logger.exception('Email for notification batch %s failed', batch_id)


def start_email_delivery(batch_ids: list[str]) -> None:
    """測試會換掉這個函式，避免真的連 SMTP。"""
    threading.Thread(target=_send_batches, args=(list(batch_ids),), daemon=True).start()


@event.listens_for(Session, 'after_commit')
def _deliver_after_commit(session) -> None:
    batch_ids = session.info.pop(_PENDING_KEY, None)
    if batch_ids:
        start_email_delivery(batch_ids)


@event.listens_for(Session, 'after_rollback')
def _drop_after_rollback(session) -> None:
    # 動作沒成功，通知也一起消失，信就不該寄
    session.info.pop(_PENDING_KEY, None)
