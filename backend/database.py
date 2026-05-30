import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 載入 .env 檔案
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("❌ 找不到 DATABASE_URL，請檢查 backend/.env 檔案是否存在！")

# 建立 SQLAlchemy 連線引擎
engine = create_engine(
    DATABASE_URL, 
    pool_pre_ping=True,  # 自動檢查連線是否活著，防止長時間沒動作被學校防火牆斷線
    pool_size=10,        # 連線池大小
    max_overflow=20      # 超過連線池時最多可再追加幾個連線
)

# 建立本地 Session 類別
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 宣告 ORM 模型基底
Base = declarative_base()

# FastAPI 專用的資料庫 Session 依賴項 (Dependency Injection)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() # 執行完 API 後自動關閉連線，還給連線池，防止連線溢滿