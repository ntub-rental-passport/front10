"""身分驗證核心模組。

⚠️ 目前並存兩套驗證機制（合併 teddy-dev 與 main 的結果）：

    A. Cookie 版（JWT，本檔案上半部）
       登入時簽發 JWT 放入 HttpOnly cookie，用於租客端的合約分析、OCR 等端點。
       HttpOnly 使 JavaScript 讀不到 token，XSS 無法竊取身分。

    B. Bearer 版（自訂 token，本檔案下半部）
       登入時另外回傳 accessToken，由前端放入 Authorization 標頭，
       用於房東／租客的物件管理、報修等端點。

登入端點會**同時**發出兩者，故兩套機制可並行運作。

本檔案原為兩人各自建立的同名檔案（teddy：JWT cookie／max：Bearer header），
合併時保留雙方實作。因兩邊都有 `create_access_token` 但簽名不同，
Cookie 版已更名為 `create_cookie_token`，Bearer 版維持原名以免動到既有呼叫端。

> 後續建議：長期應收斂為單一機制，避免兩套金鑰與兩套邏輯造成維護負擔。
"""

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt  # PyJWT
from dotenv import load_dotenv
from fastapi import Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import AdminSession, User, UserRole

ROOT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ROOT_ENV_FILE)


# ==========================================================================
# A. Cookie 版（JWT）—— 租客端合約分析、OCR 等端點使用
# ==========================================================================

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
AUTH_COOKIE_NAME = "access_token"
# access token 有效期：24 小時（畢業專題規模先不做 refresh token 輪替）
def session_seconds(role: str) -> int:
    """登入憑證的有效秒數。

    一般使用者照後台「系統設定」的登入有效時間；管理員固定，不受那個設定影響 ——
    一般使用者的期限設錯時，管理員必須還進得來改回去（見 platform_settings.py）。
    延遲 import：platform_settings 會用到稽核紀錄，不讓這裡在啟動時就牽一串。
    """
    import platform_settings

    if role == "admin":
        return platform_settings.ADMIN_SESSION_MINUTES * 60
    return platform_settings.session_minutes() * 60

if not JWT_SECRET:
    raise RuntimeError(
        "缺少 JWT_SECRET 環境變數。請在專案根目錄 .env 加入一行：\n"
        '  JWT_SECRET="<用 openssl rand -hex 32 產生的隨機字串>"\n'
        "（FastAPI 與 OCR Express server 必須共用同一組值）"
    )


def _cookie_secure() -> bool:
    """本機開發走 http，Secure cookie 會被瀏覽器丟棄；正式環境設 COOKIE_SECURE=true。"""
    return os.getenv("COOKIE_SECURE", "false").strip().lower() == "true"


class CurrentUser(BaseModel):
    """驗證通過後，從 token 還原出的使用者身分。"""

    id: int
    email: str
    role: str
    #: cookie 的到期時間（epoch 秒）。/me 重發 Bearer token 時沿用它，登入期限才不會被重新整理延長
    exp: int | None = None
    #: 管理員登入的 AdminSession id（見 get_current_admin 的閒置判斷）；其他身分沒有
    sid: str | None = None


def create_cookie_token(user_id: int, email: str, role: str, sid: str | None = None) -> str:
    """簽發放入 HttpOnly cookie 的 JWT。

    原名為 create_access_token，因與 Bearer 版同名而更名。
    sub 依 RFC 7519 慣例放使用者唯一識別。
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=session_seconds(role)),
    }
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _seconds_until_exp(token: str) -> int | None:
    """cookie 的 max_age 跟著 token 本身的期限走，兩者才不會一個比一個久。"""
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return max(0, int(payload["exp"]) - int(time.time()))
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return None


def set_auth_cookie(response: Response, token: str) -> None:
    """把 JWT 放進 HttpOnly cookie 回給瀏覽器，之後的請求會自動帶上。"""
    import platform_settings

    max_age = _seconds_until_exp(token)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age if max_age is not None else platform_settings.DEFAULT_SESSION_MINUTES * 60,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """登出：清除認證 cookie。"""
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")


def get_current_user(request: Request) -> CurrentUser:
    """FastAPI 依賴：從 cookie 取出並驗證 JWT，失敗一律回 401。

    需要登入的端點加上 `user: CurrentUser = Depends(get_current_user)` 即受保護；
    整個 router 要保護則在 APIRouter 加 `dependencies=[Depends(get_current_user)]`。
    """
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登入，請先登入後再操作。",
        )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return CurrentUser(
            id=int(payload["sub"]),
            email=str(payload.get("email", "")),
            role=str(payload.get("role", "tenant")),
            exp=int(payload["exp"]) if payload.get("exp") is not None else None,
            sid=str(payload["sid"]) if payload.get("sid") else None,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登入已過期，請重新登入。",
        )
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無效的登入憑證，請重新登入。",
        )


# ==========================================================================
# B. Bearer 版（自訂 token）—— 房東／租客的物件管理、報修等端點使用
# ==========================================================================


def _secret() -> bytes:
    """Bearer 版的簽章金鑰。

    ⚠️ 原實作在未設定環境變數時會退回寫死的預設值
    （"rentmate-development-secret-change-me"）。若正式環境忘記設定，
    將**靜默使用公開於原始碼中的字串**，任何人皆可自行簽發任意身分的 token。
    已改為未設定即拒絕啟動 —— 寧可在部署當下大聲失敗，也不要上線後無聲失效。
    """
    value = os.getenv("AUTH_TOKEN_SECRET", "")
    if not value:
        raise RuntimeError(
            "缺少 AUTH_TOKEN_SECRET 環境變數。請在專案根目錄 .env 加入一行：\n"
            '  AUTH_TOKEN_SECRET="<用 openssl rand -hex 32 產生的隨機字串>"'
        )
    return value.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(
    user_id: int,
    role: str,
    expires_seconds: int | None = None,
    expires_at: int | None = None,
    sid: str | None = None,
) -> str:
    """簽發放入 Authorization 標頭的 Bearer token。

    `expires_at`（epoch 秒）優先：/me 重發時要沿用登入當下決定的期限，
    否則每次重新整理都會把登入延長一輪。沒給就照 session_seconds(role)。
    """
    if expires_at is None:
        expires_at = int(time.time()) + (expires_seconds if expires_seconds is not None else session_seconds(role))
    payload: dict[str, object] = {"sub": user_id, "role": role, "exp": int(expires_at)}
    if sid:
        payload["sid"] = sid
    body = _encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{signature}"


def read_access_token(token: str) -> dict[str, object]:
    try:
        body, supplied = token.rsplit(".", 1)
        expected = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("signature")
        payload = json.loads(_decode(body))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="登入憑證無效或已過期。"
        ) from error


SUSPENDED_DETAIL = "此帳號已被停用，請聯絡管理員。"


def _reject_if_suspended(user: User) -> None:
    """帳號被停用時拒絕存取。

    每個角色守門員都會呼叫。為什麼要在這裡再檢查一次（登入時已經擋過）：
    token 簽發後在有效期內內容不會變，若只在登入時檢查，
    停用一個「已經登入」的帳號要等到 token 過期（最長 24 小時）才生效。
    處置一個正在搗亂的帳號時，等 24 小時是不能接受的。
    """
    if getattr(user, "status", "active") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUSPENDED_DETAIL)


def get_current_landlord(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入房東帳號。")
    payload = read_access_token(authorization[7:])
    user_id = int(payload["sub"])
    if payload.get("role") != "landlord":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此功能僅限房東使用。")
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == "landlord").first()
    if not user or not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="房東權限不存在。")
    _reject_if_suspended(user)
    return user


def get_current_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """後台 API 的權限守門員。所有只給管理員的端點都必須掛這個相依。

    用法：

        @router.get("/api/admin/users")
        def list_users(admin: User = Depends(get_current_admin), db=Depends(get_db)):
            ...

    ⚠️ 不可以用「前端沒有給連結」當作防護 —— 攻擊者是直接對 API 發請求，
    根本不會經過你的畫面。權限一定要在每一支端點上檢查。

    兩件與其他角色相同、但對管理員更重要的事：

    1. **只收 Bearer 標頭，不收 cookie。** 後台功能破壞力大，而 cookie 會被
       瀏覽器自動附帶在跨站請求上（CSRF）；Bearer token 存在 localStorage，
       其他網站的 JavaScript 讀不到，攻擊者無法誘導管理員的瀏覽器代打。

    2. **token 說是 admin 還不算數，一定要回資料庫再確認一次。** token 簽發後
       在有效期內內容不會變，若只信 token，撤銷管理員權限要等到 token 過期
       才會生效。查一次 DB，撤銷就能立即生效。

    第 3 點（閒置登出）見 admin_session_from。
    """
    user, _ = admin_session_from(authorization, db)
    return user


#: 閒置被登出時的訊息。前端看到這句就知道要帶使用者回內部登入頁
ADMIN_IDLE_DETAIL = "閒置太久，請重新登入。"


def admin_session_from(authorization: str | None, db: Session) -> tuple[User, AdminSession]:
    """驗證管理員的 Bearer token，並確認伺服器端的登入紀錄還在、沒有閒置太久。

    3. **閒置太久要重新登入。** token 本身是無狀態的，只看它的話，拿到的人可以
       一路用到期限（8 小時）。每個管理員登入都有一筆 AdminSession，記最後一次
       「真的有人在操作」的時間；超過 ADMIN_IDLE_MINUTES 就作廢。

       這裡**不更新**最後操作時間：後台有些頁面會在背景輪詢，把輪詢算成操作的話，
       人走開了也永遠不會閒置。更新只走 POST /api/auth/admin/activity，
       由前端在偵測到滑鼠、鍵盤操作時回報。
    """
    import platform_settings

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入管理員帳號。")
    payload = read_access_token(authorization[7:])
    user_id = int(payload["sub"])
    if payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此功能僅限管理員使用。")
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == "admin").first()
    if not user or not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理員權限不存在。")
    _reject_if_suspended(user)

    sid = payload.get("sid")
    session = (
        db.query(AdminSession).filter(AdminSession.id == str(sid), AdminSession.user_id == user_id).first()
        if sid
        else None
    )
    # 沒有 sid 的是改版前簽發的憑證：一律請他重新登入一次，不給舊憑證繞過閒置判斷
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登入已失效，請重新登入。")
    idle = datetime.utcnow() - session.last_active_at
    if idle > timedelta(minutes=platform_settings.ADMIN_IDLE_MINUTES):
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=ADMIN_IDLE_DETAIL)
    return user, session


def get_current_tenant(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入租客帳號。")
    payload = read_access_token(authorization[7:])
    user_id = int(payload["sub"])
    if payload.get("role") != "tenant":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此功能僅限租客使用。")
    user = db.query(User).filter(User.id == user_id).first()
    role = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role == "tenant").first()
    if not user or not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="租客權限不存在。")
    _reject_if_suspended(user)
    return user
