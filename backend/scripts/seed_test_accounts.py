"""建立／重設兩個固定的測試帳號（房東、租客）。

為什麼要有這支：每次要在手機寬度驗版面、或跑一輪手動 QA，都得先有能登入
的帳號。臨時註冊會卡在 email 驗證碼，而且每個人手上的帳號不一樣，回報問題
時對不上。固定兩個帳號、固定 email，誰都能用同一組重現。

密碼不寫在這個檔案裡 —— 它會進版控。改從 .env 讀（.env 已被 gitignore）：

    TEST_LANDLORD_PASSWORD=...
    TEST_TENANT_PASSWORD=...

沒設的話這支會用 secrets 產生一組強密碼、寫回 .env，並在輸出裡告訴你去哪看。

這支會直接寫 DATABASE_URL 指到的資料庫。那通常不是本機 —— 跑之前先確認
你連的是哪一台：

    python scripts/seed_test_accounts.py --dry-run     # 只印出會做什麼，不寫入

## 用法

    python scripts/seed_test_accounts.py               # 建立或重設兩個帳號
    python scripts/seed_test_accounts.py --dry-run     # 預演
    python scripts/seed_test_accounts.py --remove      # 刪掉這兩個帳號

帳號已存在時是「重設密碼並補齊角色」，不會重複建立，所以可以重複執行。
"""

import argparse
import os
import re
import secrets
import string
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from argon2 import PasswordHasher  # noqa: E402

from db.database import DATABASE_URL, SessionLocal  # noqa: E402
from db.models import User, UserRole  # noqa: E402

ENV_PATH = ROOT.parent / ".env"
PASSWORD_LENGTH = 20

# 固定 email：用 example.com 這個 RFC 2606 保留網域，確保不會真的寄信出去。
ACCOUNTS = [
    {"email": "test.landlord@example.com", "name": "測試房東", "role": "landlord",
     "env_key": "TEST_LANDLORD_PASSWORD"},
    {"email": "test.tenant@example.com", "name": "測試租客", "role": "tenant",
     "env_key": "TEST_TENANT_PASSWORD"},
]

password_hasher = PasswordHasher()


def generate_password() -> str:
    # 排除容易看錯的字元；這是人要從 .env 複製貼上的密碼。
    alphabet = (string.ascii_letters + string.digits).translate(str.maketrans("", "", "O0lI1"))
    return "".join(secrets.choice(alphabet) for _ in range(PASSWORD_LENGTH))


def read_env_value(key: str) -> str | None:
    if not ENV_PATH.exists():
        return None
    match = re.search(rf"^{re.escape(key)}=(.*)$", ENV_PATH.read_text(encoding="utf-8"), re.MULTILINE)
    return match.group(1).strip().strip('"').strip("'") if match else None


def write_env_value(key: str, value: str) -> None:
    existing = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
    if re.search(rf"^{re.escape(key)}=", existing, re.MULTILINE):
        existing = re.sub(rf"^{re.escape(key)}=.*$", f"{key}={value}", existing, flags=re.MULTILINE)
    else:
        prefix = "" if existing.endswith("\n") or not existing else "\n"
        existing += f"{prefix}{key}={value}\n"
    ENV_PATH.write_text(existing, encoding="utf-8")


def resolve_password(env_key: str, dry_run: bool) -> tuple[str, bool]:
    """回傳 (密碼, 是否為這次新產生的)。"""
    existing = read_env_value(env_key)
    if existing:
        return existing, False
    password = generate_password()
    if not dry_run:
        write_env_value(env_key, password)
    return password, True


def upsert(db, spec: dict, password: str) -> str:
    now = datetime.utcnow()
    user = db.query(User).filter(User.email == spec["email"]).one_or_none()
    action = "更新"
    if user is None:
        user = User(email=spec["email"], display_name=spec["name"], created_at=now)
        db.add(user)
        db.flush()
        action = "建立"

    user.display_name = spec["name"]
    user.password_hash = password_hasher.hash(password)
    user.password_changed_at = now
    # 登入會擋 email_verified_at 為 null 的帳號；測試帳號直接標記已驗證，
    # 否則每次都得去收驗證碼，而那個信箱根本不存在。
    user.email_verified_at = user.email_verified_at or now
    user.status = "active"

    if not any(item.role == spec["role"] for item in user.roles):
        db.add(UserRole(user_id=user.id, role=spec["role"], created_at=now))
    return action


def remove(db, spec: dict) -> str:
    user = db.query(User).filter(User.email == spec["email"]).one_or_none()
    if user is None:
        return "不存在"
    db.delete(user)
    return "刪除"


def main() -> None:
    parser = argparse.ArgumentParser(description="建立／重設固定的測試帳號")
    parser.add_argument("--dry-run", action="store_true", help="只印出會做什麼，不寫入資料庫或 .env")
    parser.add_argument("--remove", action="store_true", help="刪掉這兩個測試帳號")
    args = parser.parse_args()

    if SessionLocal is None:
        sys.exit("❌ 沒有設定 DATABASE_URL，無法連線。")

    # 連線字串含帳密，只印出主機與資料庫名，讓人確認連對了地方。
    target = re.sub(r"://[^@]*@", "://***@", DATABASE_URL or "")
    print(f"資料庫：{target}")
    if args.dry_run:
        print("（--dry-run：以下只是預演，不會寫入）")

    with SessionLocal() as db:
        for spec in ACCOUNTS:
            if args.remove:
                action = remove(db, spec) if not args.dry_run else "將刪除"
                print(f"  {action}：{spec['email']}")
                continue

            password, generated = resolve_password(spec["env_key"], args.dry_run)
            action = upsert(db, spec, password) if not args.dry_run else "將建立或更新"
            if not generated:
                source = f"沿用 .env 的 {spec['env_key']}"
            else:
                source = f"將新產生並寫入 .env 的 {spec['env_key']}" if args.dry_run \
                    else f"新產生，已寫入 .env 的 {spec['env_key']}"
            print(f"  {action}：{spec['email']}（{spec['role']}）— 密碼{source}")

        if args.dry_run:
            db.rollback()
        else:
            db.commit()

    if not args.dry_run and not args.remove:
        print("\n密碼在 .env，不印在這裡；.env 已被 gitignore。")
        print("登入頁要選對身分：房東帳號只能用房東入口，租客帳號只能用租客入口。")


if __name__ == "__main__":
    main()
