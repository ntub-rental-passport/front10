import logging
import os
import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from db.database import engine, Base
from admin.metrics import count_requests
from routers import admin, auth, contract, garbage, landlord_properties, landlord_tenants, inspection, tenant_leases, outage
from routers import notes, households, scheduled_notifications, platform_settings_api
from routers import content_api, dashboard, repairs, inbox_api, admin_notifications_api, ai_usage_api, admin_user_records_api
from routers import admin_repairs_api, subsidy_reminders
from notifications.garbage_service import dispatch_due
from notifications.scheduled_notification_service import dispatch_due as dispatch_scheduled_notifications
from admin import monitoring_service

# ---------------------------------------------------------------
# 應用程式的 log
# ---------------------------------------------------------------
# uvicorn 只設定它自己的 logger，不動 root。Python 的 root 預設是
# WARNING，所以在這之前，程式裡所有 logger.info 都被安靜丟掉 ——
# 包括「法規檢索取了哪幾塊」「哪個 LLM provider 產生了回應」這些
# 唯一能看出請求卡在哪一步的訊息。
#
# 2026-09-14 實際踩到：合約分析在正式站卡住三分鐘，nginx 記 499，
# 但容器 log 從頭到尾只有請求結束後那一行，中間完全沒有線索。
#
# 用 force=True：uvicorn 可能已經先動過 root handler。
LOG_LEVEL = (os.getenv("LOG_LEVEL") or "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,
)
# httpx 每一次請求都會印一行。開 INFO 之後它會把上面那些訊息淹掉，
# 而它講的事情（「我打了一個 https 請求」）我們從別的地方都看得到。
logging.getLogger("httpx").setLevel(logging.WARNING)

# 啟動只檢查結構，避免在舊資料庫中自動建立另一套表格。
if engine is not None:
    from db.schema_check import require_current_schema
    require_current_schema(engine)

@asynccontextmanager
async def lifespan(app):
    async def reminders_loop():
        # 兩個排程器共用同一個迴圈，但各自 try/except ——
        # 包在一起的話，垃圾車提醒炸掉會連帶讓後台排程整輪被跳過，
        # 而它們之間沒有任何關係。
        while True:
            try:
                await asyncio.to_thread(dispatch_due)
            except Exception:
                logging.getLogger(__name__).exception('Garbage reminder scheduler failed')
            try:
                await asyncio.to_thread(dispatch_scheduled_notifications)
            except Exception:
                logging.getLogger(__name__).exception('Scheduled notification dispatcher failed')
            await asyncio.sleep(20)
    async def monitor_loop():
        # 後台監控。獨立一個任務、不跟上面的派送共用迴圈：探測最久要等
        # 3 秒 × 3 項，塞在同一個迴圈會拖慢通知寄送。
        #
        # 每 20 秒一次心跳（第一次就會補記「上次關掉到現在」的停機），
        # 每 60 秒跑一輪服務檢查，每小時清一次超過 30 天的事件。
        # 詳見 monitoring_service.py。
        tick = 0
        while True:
            try:
                await asyncio.to_thread(monitoring_service.heartbeat)
                if tick % 3 == 0:
                    await asyncio.to_thread(monitoring_service.run_checks)
                if tick % 180 == 0:
                    await asyncio.to_thread(monitoring_service.prune)
            except Exception:
                logging.getLogger(__name__).exception('Monitor loop failed')
            tick += 1
            await asyncio.sleep(20)

    tasks = [asyncio.create_task(reminders_loop()), asyncio.create_task(monitor_loop())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task

app = FastAPI(title="RentMate 租隊友後端核心系統", lifespan=lifespan)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")
# 請求計數 middleware，供後台監控頁計算錯誤率。
# 放在 CORS 之前註冊 —— FastAPI 的 middleware 是後註冊者先執行，
# 這樣計數器包在最外層，連 CORS 擋掉的請求也算得到。
app.middleware("http")(count_requests)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 將 AI 合約審查模組註冊進 FastAPI 總開關
app.include_router(contract.router)
app.include_router(auth.router)
app.include_router(landlord_properties.router)
app.include_router(landlord_tenants.router)
app.include_router(tenant_leases.router)
app.include_router(admin.router)
app.include_router(garbage.router)
app.include_router(inspection.router)
app.include_router(outage.router)
app.include_router(notes.router)
app.include_router(households.router)
app.include_router(scheduled_notifications.router)
app.include_router(subsidy_reminders.router)
app.include_router(platform_settings_api.router)
app.include_router(content_api.router)
app.include_router(dashboard.router)
app.include_router(repairs.router)
app.include_router(inbox_api.router)
app.include_router(admin_notifications_api.router)
app.include_router(ai_usage_api.router)
app.include_router(admin_user_records_api.router)
app.include_router(admin_repairs_api.router)

@app.get("/")
def root():
    return {"message": "RentMate FastAPI 後端核心已成功點火！"}


@app.get("/api/health")
def health_check():
    """健康檢查端點，供後台監控頁量測後端存活與回應時間。

    刻意不需登入：監控要能在使用者登入之前就回報後端狀態，
    若要求認證，後端掛掉時反而會因為登入不了而看不到監控結果。

    同時檢查資料庫連線 —— 只回報「能不能連上」，不回傳任何結構或資料內容，
    避免這個公開端點洩漏內部資訊。
    """
    database = "unknown"
    if engine is None:
        database = "not_configured"
    else:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            database = "ok"
        except Exception:
            # 不外洩實際錯誤訊息（可能含主機名、帳號等），只回報狀態
            database = "down"

    return {"status": "ok", "database": database}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
