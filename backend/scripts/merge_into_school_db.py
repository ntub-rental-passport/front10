"""把 VM 容器資料庫的內容併進學校的資料庫（2026-10-02 一次性）。

## 背景

正式站一直連 VM 容器裡的 MySQL，學校那台 140.131.114.242 另外有一份比較舊的
資料（組員建的三個帳號與三份合約）。要改成以學校那台為正式資料庫，又不想丟掉
任何一邊，所以兩邊合併。

## 怎麼併

- **同一個 email 視為同一個人**：VM 的 banana931103 併進學校既有的帳號，帳號本身
  的設定（密碼、狀態）以 VM 為準 —— 那是他現在登入正式站用的。
- **其餘的 VM 帳號重新編號**：學校已經用掉的 id 不能撞，一律接在最大號之後。
- **所有關聯跟著改號**：合約、帳單、報修、房東物件與租約、點交，依新的對照表
  重寫外鍵。
- **後台那幾張表學校沒有**，直接整批搬過去（id 是字串，不會撞）。
- **登入 session 不搬**：那是臨時資料，搬過去只會讓人以為還登著。

## 用法

在 VM 的 fastapi 容器裡跑（它同時連得到兩邊）：

    python scripts/merge_into_school_db.py --target "mysql+pymysql://帳號:密碼@140.131.114.242:3306/115-RentMate"
    python scripts/merge_into_school_db.py --target ... --commit

預設只試跑。試跑一樣會把每一筆真的寫進交易裡、最後整個回滾 —— 只數筆數不執行
的話，像唯一鍵衝突這種問題要等到正式跑才會爆出來。確認數字合理再加 --commit。
寫入是單一交易，中途失敗整個回滾。
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

from db import database  # noqa: E402

#: 要搬的資料表，照外鍵順序。(表名, 主鍵欄位, {外鍵欄位: 參照的表})
PLAN = [
    ('user_roles', None, {'user_id': 'users'}),
    ('user_identities', 'id', {'user_id': 'users'}),
    ('rentals', 'id', {'user_id': 'users'}),
    ('bills', 'id', {'rental_id': 'rentals'}),
    ('inspection_records', 'id', {'rental_id': 'rentals'}),
    ('inspection_items', 'id', {'rental_id': 'rentals', 'baseline_record_id': 'inspection_records',
                                'checkout_record_id': 'inspection_records'}),
    ('message_boards', 'id', {'rental_id': 'rentals', 'last_editor_id': 'users'}),
    ('landlord_properties', 'id', {'landlord_id': 'users'}),
    ('landlord_rooms', 'id', {'property_id': 'landlord_properties'}),
    ('landlord_tenants', 'id', {'landlord_id': 'users'}),
    ('landlord_leases', 'id', {'tenant_id': 'landlord_tenants', 'property_id': 'landlord_properties',
                               'room_id': 'landlord_rooms'}),
    ('landlord_move_outs', 'id', {'lease_id': 'landlord_leases'}),
    ('landlord_tenant_activities', 'id', {'tenant_id': 'landlord_tenants'}),
    ('repair_tickets', 'id', {'tenant_user_id': 'users', 'rental_id': 'rentals', 'lease_id': 'landlord_leases'}),
    # 事件要排在照片前面：照片的 event_id 參照事件
    ('repair_ticket_events', 'id', {'ticket_id': 'repair_tickets', 'actor_user_id': 'users'}),
    ('repair_ticket_photos', 'id', {'ticket_id': 'repair_tickets', 'event_id': 'repair_ticket_events',
                                    'uploaded_by': 'users'}),
    ('personal_notes', 'id', {'user_id': 'users'}),
    ('households', 'id', {'created_by': 'users'}),
    ('household_members', 'id', {'household_id': 'households', 'user_id': 'users'}),
    ('roommate_tasks', 'id', {'household_id': 'households'}),
    ('notifications', 'id', {'user_id': 'users'}),
    ('trash_favorites', 'id', {'user_id': 'users'}),
    ('subsidy_applications', 'id', {'user_id': 'users', 'rental_id': 'rentals'}),
    ('subsidy_documents', 'id', {'application_id': 'subsidy_applications'}),
]

#: 後台的資料：id 是字串、彼此不參照，整批搬
ADMIN_TABLES = ['site_settings', 'feature_outages', 'platform_settings', 'announcements', 'banners',
                'notification_templates', 'content_meta', 'audit_events', 'admin_notifications',
                'admin_notification_reads', 'daily_usage', 'usage_meta', 'repair_notes']

#: 臨時資料，不搬
SKIP = {'admin_sessions', 'pending_registrations', 'pending_admin_logins'}


def columns_of(connection, table):
    return [r[0] for r in connection.execute(text(
        'SELECT column_name FROM information_schema.columns '
        'WHERE table_schema = DATABASE() AND table_name = :t ORDER BY ordinal_position'), {'t': table})]


def table_exists(connection, table):
    return connection.execute(text(
        'SELECT COUNT(*) FROM information_schema.tables '
        'WHERE table_schema = DATABASE() AND table_name = :t'), {'t': table}).scalar() > 0


def main() -> int:
    parser = argparse.ArgumentParser(description='把 VM 的資料併進學校的資料庫')
    parser.add_argument('--target', required=True, help='學校資料庫的連線字串')
    parser.add_argument('--commit', action='store_true', help='真的寫入（預設只試跑）')
    args = parser.parse_args()

    target_engine = create_engine(args.target, connect_args={'connect_timeout': 15})
    source = database.engine.connect()
    target = target_engine.connect()
    transaction = target.begin()
    try:
        # ── 帳號：同 email 視為同一人，其餘重新編號 ──────────────────
        source_users = {r[0]: r[1] for r in source.execute(text('SELECT id, email FROM users'))}
        target_users = {r[1].strip().lower(): r[0] for r in target.execute(text('SELECT id, email FROM users'))}
        next_id = (target.execute(text('SELECT COALESCE(MAX(id), 0) FROM users')).scalar() or 0) + 1

        id_map = {'users': {}}
        merged, created = [], []
        for uid, email in sorted(source_users.items()):
            existing = target_users.get((email or '').strip().lower())
            if existing:
                id_map['users'][uid] = existing
                merged.append(f'{email}：VM {uid} → 學校既有的 {existing}')
            else:
                id_map['users'][uid] = next_id
                created.append(f'{email}：VM {uid} → 新的 {next_id}')
                next_id += 1

        print('帳號對應：')
        for line in created + merged:
            print('  ', line)

        # 併進既有帳號的，帳號本身以 VM 為準（密碼、狀態都是他現在在用的）
        user_columns = [c for c in columns_of(source, 'users') if c != 'id']
        for uid, email in source_users.items():
            new_id = id_map['users'][uid]
            if email.strip().lower() not in target_users:
                continue
            row = source.execute(text(f'SELECT {", ".join(f"`{c}`" for c in user_columns)} FROM users WHERE id = :i'),
                                 {'i': uid}).first()
            assignment = ', '.join(f'`{c}` = :{c}' for c in user_columns)
            target.execute(text(f'UPDATE users SET {assignment} WHERE id = :id'),
                           {**dict(zip(user_columns, row)), 'id': new_id})
        print(f'  （{len(merged)} 個帳號的密碼與狀態改以 VM 為準）')

        # 新帳號
        for uid, email in sorted(source_users.items()):
            if email.strip().lower() in target_users:
                continue
            row = source.execute(text(f'SELECT {", ".join(f"`{c}`" for c in user_columns)} FROM users WHERE id = :i'),
                                 {'i': uid}).first()
            names = ', '.join(f'`{c}`' for c in ['id'] + user_columns)
            holders = ', '.join(f':{c}' for c in ['id'] + user_columns)
            target.execute(text(f'INSERT INTO users ({names}) VALUES ({holders})'),
                           {'id': id_map['users'][uid], **dict(zip(user_columns, row))})

        # ── 其餘資料表：依對照表改號後搬過去 ────────────────────────
        print('\n資料表：')
        total = 0
        for table, pk, foreign in PLAN:
            if table in SKIP or not table_exists(source, table) or not table_exists(target, table):
                continue
            cols = columns_of(source, table)
            rows = source.execute(text(f'SELECT {", ".join(f"`{c}`" for c in cols)} FROM `{table}`')).fetchall()
            if not rows:
                continue
            id_map.setdefault(table, {})
            offset = (target.execute(text(f'SELECT COALESCE(MAX(`{pk}`), 0) FROM `{table}`')).scalar() or 0) if pk else 0
            moved = skipped = duplicated = 0
            for row in rows:
                data = dict(zip(cols, row))
                for column, referenced in foreign.items():
                    if data.get(column) is not None:
                        mapped = id_map.get(referenced, {}).get(data[column])
                        if mapped is None:
                            # 參照的那一筆沒搬過來（例如指向被併掉的帳號），整列跳過
                            data = None
                            break
                        data[column] = mapped
                if data is None:
                    skipped += 1
                    continue
                if pk:
                    old = data[pk]
                    data[pk] = offset + old
                    id_map[table][old] = data[pk]
                names = ', '.join(f'`{c}`' for c in data)
                holders = ', '.join(f':{c}' for c in data)
                # 併進既有帳號的那個人，角色、第三方登入這類資料兩邊可能都有，重複就略過。
                # 但只放過「重複」這一種錯：INSERT IGNORE 會連外鍵失敗、欄位過長
                # 一起吞掉，看起來像全部略過，其實是全部沒搬進去。
                try:
                    with target.begin_nested():
                        target.execute(text(f'INSERT INTO `{table}` ({names}) VALUES ({holders})'), data)
                    moved += 1
                except IntegrityError as error:
                    if getattr(error.orig, 'args', [None])[0] != 1062:
                        raise
                    duplicated += 1
            total += moved
            note = f'、跳過 {skipped}' if skipped else ''
            note += f'、兩邊都有而略過 {duplicated}' if duplicated else ''
            print(f'  {table:32} 搬 {moved}{note}')

        # ── 後台的資料：id 是字串，直接搬，已存在就跳過 ──────────────
        print('\n後台資料：')
        for table in ADMIN_TABLES:
            if not table_exists(source, table):
                continue
            if not table_exists(target, table):
                print(f'  {table:32} 目標還沒有這張表（先跑 20261001 的建表 SQL）')
                continue
            cols = columns_of(source, table)
            rows = source.execute(text(f'SELECT {", ".join(f"`{c}`" for c in cols)} FROM `{table}`')).fetchall()
            moved = 0
            for row in rows:
                data = dict(zip(cols, row))
                names = ', '.join(f'`{c}`' for c in data)
                holders = ', '.join(f':{c}' for c in data)
                updates = ', '.join(f'`{c}` = :{c}' for c in data)
                target.execute(text(f'INSERT INTO `{table}` ({names}) VALUES ({holders}) '
                                    f'ON DUPLICATE KEY UPDATE {updates}'), data)
                moved += 1
            total += moved
            if moved:
                print(f'  {table:32} 搬 {moved}')

        if args.commit:
            transaction.commit()
            print(f'\n完成：共搬 {total} 筆。')
        else:
            transaction.rollback()
            print(f'\n試跑結果：會搬 {total} 筆。加 --commit 才會真的寫入。')
    except BaseException:
        transaction.rollback()
        raise
    finally:
        source.close()
        target.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
