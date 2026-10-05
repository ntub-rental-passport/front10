"""從業務流程發一則站內通知給一個帳號（房東催繳、租客接受邀請…）。

跟 inbox_service 寫的是同一張 inbox_messages，但走呼叫端的 SQLAlchemy session：
通知跟觸發它的那個動作在同一筆交易裡，動作失敗通知就不會出現，反之亦然。

只送站內。Email 要經過後台的寄送佇列與 SMTP 設定，這裡不假裝寄出。
"""
import uuid
from datetime import datetime, timezone

from db.models import InboxMessage, User

CATEGORIES = ('系統', '租約', '補貼', '帳務')


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


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
) -> InboxMessage:
    if category not in CATEGORIES:
        raise ValueError(f'不認得的通知分類：{category}')
    message = InboxMessage(
        id=f'nm-{uuid.uuid4().hex[:12]}',
        batch_id=f'nb-{uuid.uuid4().hex[:12]}',
        user_id=user.id,
        user_email=user.email,
        title=title[:100],
        body=body[:2000],
        category=category,
        channels='["inapp"]',
        inapp_state='sent',
        email_state=None,
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
    return message
