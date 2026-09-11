"""將舊 schema 的使用者資料遷移至新的關聯表結構。

## 背景

合併 main 後，使用者的角色、密碼、第三方身分由 `users` 表的欄位
改為三張關聯表：

    users.role          → user_roles（一個帳號可有多重角色）
    users.password_hash → user_password_credentials
    users.google_sub    → user_identities（provider='google'）

登入邏輯已改讀新表，若不遷移，既有帳號會全數登入失敗（account-not-found）。

## 特性

- **冪等**：可重複執行，已遷移的資料不會重複寫入
- **不刪除舊欄位**：保留 users.role / password_hash / google_sub 作為回溯依據，
  確認新結構穩定後再另行清理
- **先預覽後執行**：預設只顯示將要做什麼，加 --apply 才實際寫入

## 用法

    python migrations/migrate_to_user_roles.py           # 預覽
    python migrations/migrate_to_user_roles.py --apply   # 實際執行
"""

import sys
from datetime import datetime

from sqlalchemy import text

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from database import SessionLocal, engine, Base  # noqa: E402
from models import User, UserRole, UserIdentity, UserPasswordCredential  # noqa: E402


def main(apply: bool) -> int:
    if engine is None:
        print("❌ 未設定 DATABASE_URL")
        return 1

    # 確保新表存在（create_all 只建缺少的表，不會動到既有表）
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    now = datetime.utcnow()
    planned = {"roles": [], "passwords": [], "identities": []}

    try:
        # 舊欄位可能已不在 ORM 模型中，故以原生查詢讀取（欄位名稱寫死，無使用者輸入）
        rows = db.execute(text(
            "SELECT id, email, role, password_hash, google_sub FROM users"
        )).fetchall()

        for uid, email, old_role, pw_hash, google_sub in rows:
            user = db.query(User).filter(User.id == uid).first()
            if user is None:
                continue

            # 1. 角色
            if old_role and not any(r.role == old_role for r in user.roles):
                planned["roles"].append(f"{email} → {old_role}")
                if apply:
                    db.add(UserRole(user_id=uid, role=old_role, created_at=now))

            # 2. 密碼
            if pw_hash and user.password_credential is None:
                planned["passwords"].append(email)
                if apply:
                    db.add(UserPasswordCredential(
                        user_id=uid, password_hash=pw_hash, password_changed_at=now,
                    ))

            # 3. Google 身分
            if google_sub:
                exists = db.query(UserIdentity).filter(
                    UserIdentity.user_id == uid, UserIdentity.provider == "google",
                ).first()
                if exists is None:
                    planned["identities"].append(email)
                    if apply:
                        db.add(UserIdentity(
                            user_id=uid,
                            provider="google",
                            provider_subject=google_sub,
                            provider_email=email,
                            created_at=now,
                        ))

        print(f"{'執行' if apply else '預覽'}：共 {len(rows)} 個帳號")
        for label, key in [("角色", "roles"), ("密碼", "passwords"), ("Google 身分", "identities")]:
            items = planned[key]
            print(f"  {label:12}：{len(items)} 筆" + (f" — {', '.join(items)}" if items else " — 無需遷移"))

        if apply:
            db.commit()
            print("\n✅ 已寫入")
        else:
            print("\n（預覽模式，未寫入。加 --apply 實際執行）")
        return 0
    except Exception as error:
        db.rollback()
        print(f"❌ 失敗，已復原：{error}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main(apply="--apply" in sys.argv))
