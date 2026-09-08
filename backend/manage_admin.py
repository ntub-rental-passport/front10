"""管理員帳號維護工具（授予／撤銷 admin、設定後台密碼）。

後台沒有、也刻意不做「網頁上新增管理員」的功能：那等於把提權的入口
放在網路上，一旦任一管理員帳號被盜，攻擊者就能自行擴增管理員。
授予管理員權限只能由能登入伺服器的人在指令列執行。

密碼一律以 getpass 互動輸入，不接受命令列參數 —— 寫在參數裡會留在
shell 歷史（~/.bash_history）與 ps 的行程列表中，等同明文外洩。

## 用法

    python manage_admin.py list                     # 列出目前所有管理員
    python manage_admin.py grant <email>            # 授予管理員並設定後台密碼
    python manage_admin.py password <email>         # 只重設後台密碼
    python manage_admin.py revoke <email>           # 撤銷管理員權限

正式機（容器內）：

    docker compose exec fastapi python manage_admin.py list
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from argon2 import PasswordHasher  # noqa: E402

from database import SessionLocal, engine  # noqa: E402
from models import PendingAdminLogin, User, UserPasswordCredential, UserRole  # noqa: E402

MIN_PASSWORD_LENGTH = 12

password_hasher = PasswordHasher()


def _normalize(email: str) -> str:
    return email.strip().lower()


def _require_user(db, email: str) -> User:
    user = db.query(User).filter(User.email == _normalize(email)).first()
    if user is None:
        sys.exit(f"❌ 找不到帳號 {email}。請先讓本人在網站完成註冊，再授予管理員權限。")
    return user


def _prompt_password() -> str:
    """互動輸入密碼並二次確認。

    管理員密碼下限訂得比一般使用者高：後台一旦被進入，影響是全站性的，
    而管理員只有少數幾人，提高長度要求的實務成本很低。
    """
    while True:
        password = getpass.getpass("請輸入後台密碼（不會顯示）：")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"   密碼至少 {MIN_PASSWORD_LENGTH} 個字元，請重新輸入。")
            continue
        if password != getpass.getpass("請再輸入一次確認："):
            print("   兩次輸入不一致，請重新輸入。")
            continue
        return password


def _set_password(db, user: User, password: str) -> None:
    credential = (
        db.query(UserPasswordCredential)
        .filter(UserPasswordCredential.user_id == user.id)
        .first()
    )
    if credential is None:
        db.add(UserPasswordCredential(user_id=user.id, password_hash=password_hasher.hash(password)))
    else:
        credential.password_hash = password_hasher.hash(password)


def cmd_list() -> None:
    db = SessionLocal()
    try:
        admins = (
            db.query(User)
            .join(UserRole, UserRole.user_id == User.id)
            .filter(UserRole.role == "admin")
            .all()
        )
        if not admins:
            print("目前沒有任何管理員帳號。")
            return
        print(f"目前共 {len(admins)} 位管理員：")
        for user in admins:
            has_password = user.password_credential is not None
            roles = ",".join(sorted(r.role for r in user.roles))
            print(f"  #{user.id} {user.email}  角色={roles}  後台密碼={'已設定' if has_password else '⚠️ 未設定'}")
    finally:
        db.close()


def cmd_grant(email: str) -> None:
    db = SessionLocal()
    try:
        user = _require_user(db, email)
        already = any(r.role == "admin" for r in user.roles)
        print(f"帳號 #{user.id} {user.email}" + ("（已是管理員，將只重設密碼）" if already else ""))

        password = _prompt_password()
        if not already:
            db.add(UserRole(user_id=user.id, role="admin"))
        _set_password(db, user, password)
        db.commit()

        print(f"✅ {user.email} 已可使用 /staff-login 登入後台。")
        print("   登入時會寄送六位數驗證碼到這個信箱，收得到信才能完成登入。")
    finally:
        db.close()


def cmd_password(email: str) -> None:
    db = SessionLocal()
    try:
        user = _require_user(db, email)
        if not any(r.role == "admin" for r in user.roles):
            sys.exit(f"❌ {user.email} 不是管理員，請先執行 grant。")
        _set_password(db, user, _prompt_password())
        db.commit()
        print(f"✅ 已重設 {user.email} 的後台密碼。")
    finally:
        db.close()


def cmd_revoke(email: str) -> None:
    db = SessionLocal()
    try:
        user = _require_user(db, email)
        removed = (
            db.query(UserRole)
            .filter(UserRole.user_id == user.id, UserRole.role == "admin")
            .delete()
        )
        if not removed:
            print(f"{user.email} 本來就不是管理員，未做任何變更。")
            return

        # 撤銷權限的同時清掉進行中的登入挑戰，避免「已通過帳密、
        # 驗證碼還在手上」的人趁著挑戰有效期間完成登入
        db.query(PendingAdminLogin).filter(PendingAdminLogin.user_id == user.id).delete()
        db.commit()

        remaining = (
            db.query(UserRole).filter(UserRole.role == "admin").count()
        )
        print(f"✅ 已撤銷 {user.email} 的管理員權限。")
        if remaining == 0:
            print("⚠️  目前已無任何管理員帳號，請盡快用 grant 指定一位，否則無人能進入後台。")
    finally:
        db.close()


def main() -> None:
    if engine is None:
        sys.exit("❌ 未設定 DATABASE_URL，無法連線資料庫。")

    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)

    command, params = args[0], args[1:]
    if command == "list":
        cmd_list()
    elif command in {"grant", "password", "revoke"}:
        if len(params) != 1:
            sys.exit(f"用法：python manage_admin.py {command} <email>")
        {"grant": cmd_grant, "password": cmd_password, "revoke": cmd_revoke}[command](params[0])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
