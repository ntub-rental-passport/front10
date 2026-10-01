"""把後台原本存在 SQLite 小檔的資料倒進專案的資料庫（2026-10-01）。

後台自己的資料本來分散在十個 SQLite 檔（VM 上在 ~/rentmate/data/garbage/）。
第一批先搬後台介面直接要用的七個模組、十三張表。

## 用法

    # 先跑建表的 SQL，再跑這支
    python scripts/migrate_sqlite_to_mysql.py --source ~/rentmate/data/garbage
    python scripts/migrate_sqlite_to_mysql.py --source ... --commit   # 真的寫入

預設是試跑（dry run）：只報告會搬幾筆，不寫任何東西。確認數字合理再加 --commit。

## 規則

- **已經有同一筆主鍵就跳過**，不覆蓋。重複執行不會把資料弄亂，也不會把管理員
  在新資料庫上做過的修改蓋掉。
- 來源檔不存在就跳過那張表，不當成錯誤：有些功能在那台機器上從沒用過。
- 只讀來源、只寫目的地，不刪任何東西。搬完原本的 SQLite 檔請自己保留一陣子。
"""

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from db import database  # noqa: E402

#: 來源檔 → [(資料表, 主鍵欄位)]
PLAN = {
    'platform-settings.db': [('site_settings', ('key',)), ('feature_outages', ('feature_key',)),
                             ('platform_settings', ('key',))],
    'admin-content.db': [('announcements', ('id',)), ('banners', ('id',)),
                         ('notification_templates', ('id',)), ('content_meta', ('key',))],
    'admin-audit.db': [('audit_events', ('id',))],
    'admin-notifications.db': [('admin_notifications', ('id',)),
                               ('admin_notification_reads', ('notification_id', 'admin_id'))],
    'ai-usage.db': [('daily_usage', ('date', 'provider')), ('usage_meta', ('key',))],
    'admin-repair-notes.db': [('repair_notes', ('ticket_id',))],
}


def rows_of(path: Path, table: str) -> list[dict]:
    connection = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        names = {row[1] for row in connection.execute(f'PRAGMA table_info({table})')}
        if not names:
            return []
        return [dict(row) for row in connection.execute(f'SELECT * FROM {table}')]
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description='把後台的 SQLite 資料搬進專案資料庫')
    parser.add_argument('--source', required=True, help='放 SQLite 檔的資料夾')
    parser.add_argument('--commit', action='store_true', help='真的寫入（預設只試跑）')
    args = parser.parse_args()

    source = Path(args.source).expanduser()
    if not source.is_dir():
        print(f'找不到資料夾：{source}')
        return 1

    total_new = total_skipped = 0
    with database.engine.connect() as connection:
        transaction = connection.begin()
        for filename, tables in PLAN.items():
            path = source / filename
            if not path.exists():
                print(f'- {filename}：沒有這個檔，跳過')
                continue
            for table, keys in tables:
                try:
                    rows = rows_of(path, table)
                except sqlite3.DatabaseError as error:
                    print(f'  ! {table}：讀不到（{error}）')
                    continue
                new = skipped = 0
                for row in rows:
                    where = ' AND '.join(f'{k} = :{k}' for k in keys)
                    existing = connection.execute(
                        text(f'SELECT 1 FROM {table} WHERE {where}'),
                        {k: row[k] for k in keys},
                    ).first()
                    if existing:
                        skipped += 1
                        continue
                    columns = ', '.join(row)
                    values = ', '.join(f':{c}' for c in row)
                    connection.execute(text(f'INSERT INTO {table} ({columns}) VALUES ({values})'), row)
                    new += 1
                total_new += new
                total_skipped += skipped
                print(f'  {table}: 新增 {new}、已存在跳過 {skipped}')
        if args.commit:
            transaction.commit()
            print(f'\n完成：新增 {total_new} 筆，跳過 {total_skipped} 筆。')
        else:
            transaction.rollback()
            print(f'\n試跑結果：會新增 {total_new} 筆，跳過 {total_skipped} 筆。加 --commit 才會真的寫入。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
