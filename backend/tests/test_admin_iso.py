import unittest
from datetime import datetime, timedelta, timezone

from routers.admin import _iso


class AdminIsoTests(unittest.TestCase):
    """後台使用者清單的時間格式。

    資料庫存的是 naive UTC（datetime.utcnow()），輸出時沒帶時區的話，
    瀏覽器會當成本地時間解析，在 UTC+8 整整早 8 小時。
    """

    def test_naive_datetime_is_treated_as_utc(self):
        self.assertEqual(_iso(datetime(2026, 9, 24, 4, 48)), '2026-09-24T04:48:00+00:00')

    def test_output_always_carries_an_offset(self):
        # 前端 new Date() 看到沒有時區的字串會當成本地時間 —— 這正是要避免的
        self.assertRegex(_iso(datetime(2026, 1, 1)), r'[+-]\d{2}:\d{2}$')

    def test_aware_datetime_is_kept_as_is(self):
        taipei = timezone(timedelta(hours=8))
        self.assertEqual(
            _iso(datetime(2026, 9, 24, 12, 48, tzinfo=taipei)),
            '2026-09-24T12:48:00+08:00',
        )

    def test_none_stays_none(self):
        self.assertIsNone(_iso(None))


if __name__ == '__main__':
    unittest.main()
