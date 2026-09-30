"""每期帳單的推導：期間、應繳日與應繳租金。"""
import datetime
import unittest

from db.billing import add_months, build_bill_rows, due_date_for


class AddMonthsTests(unittest.TestCase):
    def test_day_is_clamped_to_the_shorter_month(self):
        # 1/31 加一個月不是 2/31（不存在），也不該溢出成 3/3
        self.assertEqual(add_months(datetime.date(2026, 1, 31), 1), datetime.date(2026, 2, 28))
        self.assertEqual(add_months(datetime.date(2024, 1, 31), 1), datetime.date(2024, 2, 29))

    def test_crosses_year_boundary(self):
        self.assertEqual(add_months(datetime.date(2025, 11, 15), 3), datetime.date(2026, 2, 15))


class DueDateTests(unittest.TestCase):
    def test_payment_day_31_becomes_the_last_day_of_the_month(self):
        # 契約寫「每月底以前」會存成 payment_day = 31，但二月沒有 31 號
        self.assertEqual(due_date_for(datetime.date(2026, 2, 1), 31), datetime.date(2026, 2, 28))
        self.assertEqual(due_date_for(datetime.date(2026, 4, 1), 31), datetime.date(2026, 4, 30))

    def test_ordinary_payment_day_is_kept(self):
        self.assertEqual(due_date_for(datetime.date(2026, 3, 1), 5), datetime.date(2026, 3, 5))


class BuildBillRowsTests(unittest.TestCase):
    def rows(self, **overrides):
        options = {
            'start_date': datetime.date(2025, 8, 1),
            'end_date': datetime.date(2026, 7, 31),
            'total_periods': 12,
            'payment_interval_months': 1,
            'payment_day': 5,
            'rent_amount': 20000,
        }
        options.update(overrides)
        return build_bill_rows(**options)

    def test_monthly_lease_produces_one_bill_per_month(self):
        rows = self.rows()
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[0]['period_start'], datetime.date(2025, 8, 1))
        self.assertEqual(rows[0]['period_end'], datetime.date(2025, 8, 31))
        self.assertEqual(rows[0]['due_date'], datetime.date(2025, 8, 5))
        self.assertEqual(rows[0]['rent_amount'], 20000)
        self.assertEqual([row['period_index'] for row in rows], list(range(1, 13)))

    def test_last_period_never_runs_past_the_lease_end(self):
        rows = self.rows()
        self.assertEqual(rows[-1]['period_end'], datetime.date(2026, 7, 31))

    def test_two_month_interval_charges_two_months_of_rent(self):
        rows = self.rows(payment_interval_months=2, total_periods=6)
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[0]['rent_amount'], 40000)
        self.assertEqual(rows[0]['period_start'], datetime.date(2025, 8, 1))
        self.assertEqual(rows[0]['period_end'], datetime.date(2025, 9, 30))
        self.assertEqual(rows[1]['period_start'], datetime.date(2025, 10, 1))

    def test_periods_beyond_the_lease_end_are_dropped(self):
        # total_periods 與租期對不上時，不產生落在租期之外的帳單
        rows = self.rows(total_periods=24)
        self.assertLessEqual(rows[-1]['period_start'], datetime.date(2026, 7, 31))
        self.assertEqual(len(rows), 12)

    def test_no_periods_means_no_bills(self):
        self.assertEqual(self.rows(total_periods=0), [])


if __name__ == '__main__':
    unittest.main()
