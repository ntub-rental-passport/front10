"""替還沒有帳單的租約補建每期 bills。

存檔終版契約時會一併建立帳單，但這是 2026-09-30 才加的；在那之前存檔的
租約沒有任何 bills，儀表板的金額會全部顯示「--」。

可重複執行：已經有帳單的租約一律跳過，不會重建或覆蓋繳費紀錄。

    python backend/scripts/backfill_bills.py            # 實際寫入
    python backend/scripts/backfill_bills.py --dry-run  # 只列出會補哪些
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from sqlalchemy import func  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from db import models  # noqa: E402
from db.billing import build_bill_rows  # noqa: E402
from db.database import engine  # noqa: E402


def main(dry_run: bool) -> None:
    with Session(engine) as db:
        billed = {row[0] for row in db.query(models.Bill.rental_id).group_by(models.Bill.rental_id)}
        # 只選需要的欄位：不碰加密欄位，金鑰有問題也能跑
        rentals = db.query(
            models.Rental.id, models.Rental.user_id, models.Rental.start_date, models.Rental.end_date,
            models.Rental.total_periods, models.Rental.payment_interval_months,
            models.Rental.payment_day, models.Rental.rent_amount,
        ).all()

        created = 0
        for rental in rentals:
            if rental.id in billed:
                continue
            rows = build_bill_rows(
                start_date=rental.start_date, end_date=rental.end_date,
                total_periods=rental.total_periods,
                payment_interval_months=rental.payment_interval_months,
                payment_day=rental.payment_day, rent_amount=rental.rent_amount,
            )
            print(f"rental {rental.id}（user {rental.user_id}）：補 {len(rows)} 期帳單")
            if not dry_run:
                db.add_all(models.Bill(rental_id=rental.id, **row) for row in rows)
            created += len(rows)

        if dry_run:
            print(f"[dry-run] 共會補 {created} 筆，未寫入")
            return
        db.commit()
        total = db.query(func.count(models.Bill.id)).scalar()
        print(f"完成：新增 {created} 筆，bills 目前共 {total} 筆")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
