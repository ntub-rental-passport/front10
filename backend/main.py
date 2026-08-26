import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
<<<<<<< HEAD

from database import Base, engine
from routers import auth, contract, notes

if engine is not None:
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="RentMate API")
=======
from database import engine, Base
from routers import auth, contract # 👈 引入剛才建立的 AI 路由功能

# 有設定 MySQL 時才建立資料表；Google 登入驗證本身不依賴資料庫。
if engine is not None:
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="RentMate 租隊友後端核心系統")
>>>>>>> 7283143ec24d46c421c1663fe7eb03f2b76b78de

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

<<<<<<< HEAD
app.include_router(contract.router)
app.include_router(auth.router)
app.include_router(notes.router)


@app.get("/")
def root():
    return {"message": "RentMate FastAPI is running"}
=======
# 將 AI 合約審查模組註冊進 FastAPI 總開關
app.include_router(contract.router)
app.include_router(auth.router)

@app.get("/")
def root():
    return {"message": "RentMate FastAPI 後端核心已成功點火！"}
>>>>>>> 7283143ec24d46c421c1663fe7eb03f2b76b78de


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
