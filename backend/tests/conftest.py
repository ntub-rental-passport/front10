"""所有測試共用的防護。"""
import pytest


@pytest.fixture(autouse=True)
def _never_send_real_email(monkeypatch):
    """業務流程的通知在 commit 後會在背景寄 Email（notifications/user_notify.py）。

    測試時根目錄 .env 的 SMTP 設定也會被讀進來，不攔下的話會真的用專題的 Gmail
    寄信給 tenant@test.example 這類假信箱。個別測試要驗證寄信時自己再 patch。
    """
    from notifications import user_notify
    monkeypatch.setattr(user_notify, "start_email_delivery", lambda batch_ids: None)


@pytest.fixture(autouse=True)
def _never_send_real_push(monkeypatch):
    """測試可能讀到 .env 的 VAPID 設定，禁止啟動背景推播或真的連外送給裝置。

    同時攔住業務通知與後台／排程的送出入口；推播測試自行換回函式並替換 pywebpush。
    """
    from notifications import push_service, user_notify
    monkeypatch.setattr(user_notify, "start_push_delivery", lambda message_ids: None)
    monkeypatch.setattr(push_service, "send_to_user", lambda *args, **kwargs: None)
