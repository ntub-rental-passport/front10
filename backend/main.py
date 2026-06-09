from fastapi import FastAPI
from database import engine, Base
from routers import contract # 👈 引入剛才建立的 AI 路由功能

# 當程式啟動時，會自動去檢查 MySQL 裡有沒有這 10 張表，如果沒有會自動補建（雙重保險）
Base.metadata.create_all(bind=engine)

app = FastAPI(title="RentMate 租隊友後端核心系統")

# 將 AI 合約審查模組註冊進 FastAPI 總開關
app.include_router(contract.router)

@app.get("/")
def root():
    return {"message": "RentMate FastAPI 後端核心已成功點火！"}