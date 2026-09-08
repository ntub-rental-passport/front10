import os
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import engine, Base
from metrics import count_requests
from routers import admin, auth, contract, garbage, landlord_properties, landlord_tenants, tenant_leases # 👈 引入剛才建立的 AI 路由功能
from garbage_service import dispatch_due

# 有設定 MySQL 時才建立資料表；Google 登入驗證本身不依賴資料庫。
if engine is not None:
    Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app):
    async def reminders_loop():
        while True:
            try:
                await asyncio.to_thread(dispatch_due)
            except Exception:
                logging.getLogger(__name__).exception('Garbage reminder scheduler failed')
            await asyncio.sleep(20)
    task = asyncio.create_task(reminders_loop())
    try:
        yield
    finally:
        task.cancel()
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
