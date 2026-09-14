"""本機免驗證碼登入的守衛測試。

這個機制讓一個指定的帳號在開發機上免收驗證碼就能登入。它只在
**本機**成立 —— 而「只在本機」這件事必須是結構性的，不能只靠
「記得不要在正式環境設那個變數」。一次複製貼上 .env 就會把 2FA 關掉，
而且不會有任何人發現。

所以這裡測的重點不是「開發機能不能用」，是「非開發機一定關掉」。
"""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers.auth import _dev_no_2fa_email  # noqa: E402

LOCAL_DB = "mysql+pymysql://u:p@localhost:3306/db"


class DevBypassGuardTest(unittest.TestCase):
    def setUp(self):
        self.saved = dict(os.environ)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.saved)

    def _set(self, db_url: str, email: str | None) -> None:
        os.environ["DATABASE_URL"] = db_url
        if email is None:
            os.environ.pop("DEV_ADMIN_NO_2FA_EMAIL", None)
        else:
            os.environ["DEV_ADMIN_NO_2FA_EMAIL"] = email

    # ---- 該啟用的情況 ----

    def test_enabled_on_localhost(self):
        self._set(LOCAL_DB, "admin@rentmate.tw")
        self.assertEqual(_dev_no_2fa_email(), "admin@rentmate.tw")

    def test_enabled_on_loopback_ip(self):
        self._set("mysql+pymysql://u:p@127.0.0.1:3306/db", "admin@rentmate.tw")
        self.assertEqual(_dev_no_2fa_email(), "admin@rentmate.tw")

    def test_email_is_normalized(self):
        """大小寫與空白不該造成「設了卻沒生效」這種難查的狀況。"""
        self._set(LOCAL_DB, "  Admin@RentMate.TW  ")
        self.assertEqual(_dev_no_2fa_email(), "admin@rentmate.tw")

    # ---- 必須關閉的情況 ----

    def test_disabled_on_compose_host(self):
        """VM 上的 DATABASE_URL 指向 compose 的 mysql 主機名。

        這是最重要的一條：就算有人把整份開發 .env 複製到 VM，
        免驗證碼登入也不會生效。
        """
        self._set("mysql+pymysql://u:p@mysql:3306/db", "admin@rentmate.tw")
        self.assertEqual(_dev_no_2fa_email(), "")

    def test_disabled_on_remote_host(self):
        self._set("mysql+pymysql://u:p@10.0.0.5:3306/db", "admin@rentmate.tw")
        self.assertEqual(_dev_no_2fa_email(), "")

    def test_disabled_without_database_url(self):
        """不確定會連到哪個資料庫時，一律當成不是本機。"""
        self._set("", "admin@rentmate.tw")
        self.assertEqual(_dev_no_2fa_email(), "")

    def test_disabled_when_not_configured(self):
        """預設關閉。沒有設定就沒有這個功能。"""
        self._set(LOCAL_DB, None)
        self.assertEqual(_dev_no_2fa_email(), "")

    def test_blank_email_is_not_configured(self):
        """空字串不能變成「比對任何帳號都相等」。"""
        self._set(LOCAL_DB, "   ")
        self.assertEqual(_dev_no_2fa_email(), "")


if __name__ == "__main__":
    unittest.main()
