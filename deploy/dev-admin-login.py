#!/usr/bin/env python3
"""本機開發用的管理員登入捷徑。

## 為什麼需要

管理員登入是兩階段的：帳密通過後寄六位數驗證碼到信箱，輸入正確才發憑證。
本機開發沒有設定 SMTP，所以第一階段就會失敗，根本拿不到驗證碼 ——
結果是後台頁面在本機完全打不開。

這支腳本把第二階段的挑戰直接寫進開發資料庫，用一組已知的驗證碼。

## 它「沒有」做的事

  - 不改任何應用程式碼
  - 不繞過 /admin/verify，走的是正式那個端點
  - 不繞過密碼雜湊，用的是 verification.py 同一個函式
  - 不動正式環境（見下方的守衛）

換句話說，它只是「代替信箱」把驗證碼交到你手上，驗證流程本身一步沒少。

## 為什麼這個檔案不推 GitHub

它會讓「有資料庫寫入權的人」不需要信箱就能登入管理員後台。
那種人本來就能改 JWT_SECRET 自己簽憑證，所以實際上沒有多開一個洞 ——
但把一支名字叫「admin login」的腳本放在公開 repo 裡，
遲早有人在不該跑的地方跑它。放在 deploy/ 這個本機專用目錄。

## 守衛

只在資料庫主機是 localhost / 127.0.0.1 時才動作。
VM 上的 DATABASE_URL 指向 compose 的 `mysql` 這個主機名，會直接被擋下。

## 用法

    python deploy/dev-admin-login.py                       # 用唯一的管理員
    python deploy/dev-admin-login.py admin@example.com     # 指定帳號

跑完會印出一段 JavaScript，貼到瀏覽器的主控台（F12 → Console）按 Enter，
就會登入並跳到後台。
"""

import datetime
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

import os  # noqa: E402

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND.parent / ".env")

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}
CODE = "123456"


def assert_local_database() -> None:
    """只在本機資料庫上動作。

    這個檢查是這支腳本能存在的前提。拿掉它，就等於在正式環境放了一把
    不需要信箱的管理員鑰匙。
    """
    url = os.getenv("DATABASE_URL", "")
    if not url:
        sys.exit("❌ 沒有 DATABASE_URL，不確定會連到哪個資料庫，拒絕執行。")

    # SQLAlchemy 的 URL 前綴（mysql+pymysql://）urlparse 解得動
    host = (urlparse(url).hostname or "").lower()
    if host not in LOCAL_HOSTS:
        sys.exit(
            f"❌ 資料庫主機是「{host}」，不是本機。\n"
            "   這支腳本只能在開發機上用。正式環境請走正常的信箱驗證碼流程。"
        )


def main() -> None:
    assert_local_database()

    from database import SessionLocal
    from models import PendingAdminLogin, User, UserRole
    from verification import hash_verification_code

    wanted = sys.argv[1].strip().lower() if len(sys.argv) > 1 else ""

    db = SessionLocal()
    try:
        admins = (
            db.query(User)
            .join(UserRole, UserRole.user_id == User.id)
            .filter(UserRole.role == "admin")
            .all()
        )
        if not admins:
            sys.exit(
                "❌ 這個資料庫裡沒有任何管理員。\n"
                "   先執行：python backend/manage_admin.py grant <你的email>"
            )

        if wanted:
            user = next((u for u in admins if u.email.lower() == wanted), None)
            if user is None:
                listed = "\n".join(f"     {u.email}" for u in admins)
                sys.exit(f"❌ 找不到管理員 {wanted}。目前有：\n{listed}")
        elif len(admins) == 1:
            user = admins[0]
        else:
            listed = "\n".join(f"     {u.email}" for u in admins)
            sys.exit(f"有多位管理員，請指定一位：\n{listed}")

        # 同一個帳號只留一個有效挑戰，跟正式流程一致
        db.query(PendingAdminLogin).filter(PendingAdminLogin.user_id == user.id).delete()

        challenge_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow()
        db.add(
            PendingAdminLogin(
                id=challenge_id,
                user_id=user.id,
                email=user.email,
                verification_code_hash=hash_verification_code(challenge_id, CODE),
                expires_at=now + datetime.timedelta(minutes=15),
                attempt_count=0,
                request_ip="127.0.0.1",
                created_at=now,
            )
        )
        db.commit()
        # 在 session 關掉之前把要用的欄位取出來 ——
        # close() 之後 ORM 物件會被卸離，再讀屬性會丟 DetachedInstanceError
        email = user.email
    finally:
        db.close()

    snippet = (
        "await fetch('/api/auth/admin/verify',{method:'POST',"
        "headers:{'Content-Type':'application/json'},credentials:'include',"
        f"body:JSON.stringify({{challengeId:'{challenge_id}',code:'{CODE}'}})}});"
        "const m=await (await fetch('/api/auth/me',{credentials:'include'})).json();"
        "localStorage.setItem('rentmate-auth-session-v2',JSON.stringify({"
        "userId:String(m.userId),email:m.email,isAuthenticated:true,role:m.role,"
        "emailVerified:true,nickname:m.displayName,issuedAt:Date.now(),"
        "accessToken:m.accessToken}));location.href='/admin/users'"
    )

    print(f"✅ 已為 {email} 準備好登入（15 分鐘內有效）\n")
    print("步驟：")
    print("  1. 確認後端有在跑：npm run dev:backend")
    print("  2. 瀏覽器開 http://localhost:5173")
    print("  3. 按 F12 打開主控台（Console），貼上下面這一整行，按 Enter\n")
    print(snippet)
    print()
    print("⚠️  這段只在本機有效。它帶的驗證碼 15 分鐘後失效，")
    print("    再跑一次這支腳本就會拿到新的。")


if __name__ == "__main__":
    main()
