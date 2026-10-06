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
