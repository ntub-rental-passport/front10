"""由租約欄位推導每期帳單。

`rentals` 是合約快照（一份契約談好的條件），`bills` 是每期實際要繳的帳單。
契約一旦被使用者確認為終版，每一期的期間與應繳日就已經確定了，
所以在存檔當下就把整份 bills 建出來 —— 儀表板、繳租提醒、逾期判斷
都直接讀 bills，不必每次重算，使用者也能逐期記錄付款與憑證。

水電金額刻意留 NULL：那是收到帳單後才知道的實際數字，
契約上沒有。NULL 代表「尚未收到」，不是 0 元。
"""
import calendar
import datetime


def add_months(date: datetime.date, months: int) -> datetime.date:
    """加月份，日期超過當月天數時取當月最後一天（1/31 + 1 月 = 2/28）。"""
    month_index = date.month - 1 + months
    year = date.year + month_index // 12
    month = month_index % 12 + 1
    return datetime.date(year, month, min(date.day, calendar.monthrange(year, month)[1]))


def due_date_for(period_start: datetime.date, payment_day: int) -> datetime.date:
    """該期的應繳日：期初所在月份的第 payment_day 天。

    payment_day 可能是 31（契約寫「每月底以前」），而二月沒有 31 號，
    所以一律用當月最後一天封頂 —— 否則會建出不存在的日期。
    """
    last_day = calendar.monthrange(period_start.year, period_start.month)[1]
    return datetime.date(period_start.year, period_start.month, min(payment_day, last_day))


def build_bill_rows(
    *,
    start_date: datetime.date,
    end_date: datetime.date,
    total_periods: int,
    payment_interval_months: int,
    payment_day: int,
    rent_amount: int,
) -> list[dict]:
    """算出每一期的期間、應繳日與應繳租金。

    每期租金 = 月租 × 每期月數（契約談的是月租，但可能兩個月繳一次）。
    最後一期的期末不超過租期結束日。
    """
    interval = max(1, payment_interval_months)
    rows: list[dict] = []

    for index in range(max(0, total_periods)):
        period_start = add_months(start_date, index * interval)
        if period_start > end_date:
            # 期數與租期對不上（例如 total_periods 被手動改過）就停，
            # 不要產生落在租期之外的帳單。
            break
        period_end = min(add_months(start_date, (index + 1) * interval) - datetime.timedelta(days=1), end_date)
        rows.append({
            "period_index": index + 1,
            "period_start": period_start,
            "period_end": period_end,
            "due_date": due_date_for(period_start, payment_day),
            "rent_amount": rent_amount * interval,
        })

    return rows
