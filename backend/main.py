from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import contract
from routers import auth  # 👈 1. 確保有引入 auth 模組

Base.metadata.create_all(bind=engine)

app = FastAPI(title="RentMate 租隊友後端核心系統")

# 👈 2. 加上 CORS，允許前端 (localhost:5173) 跨網域連線
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(contract.router)
app.include_router(auth.router)  # 👈 3. 一定要有這行！把登入 API 掛載上去！

@app.get("/")
def root():
    return {"message": "RentMate FastAPI 後端核心已成功點火！"}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)