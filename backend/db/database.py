import os
from dotenv import load_dotenv
from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

# 載入 .env 檔案
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # 建立 SQLAlchemy 連線引擎
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # 自動檢查連線是否活著，防止長時間沒動作被學校防火牆斷線
        pool_size=10,        # 連線池大小
        max_overflow=20      # 超過連線池時最多可再追加幾個連線
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    # Google 登入驗證不需要資料庫；開發時允許驗證端點獨立啟動。
    engine = None
    SessionLocal = None

# 宣告 ORM 模型基底
Base = declarative_base()

# FastAPI 專用的資料庫 Session 依賴項 (Dependency Injection)
def get_db():
    if SessionLocal is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="後端尚未設定 DATABASE_URL，無法判斷 Google 帳號是否已註冊。",
        )

    db = SessionLocal()
    try:
        yield db
    except OperationalError as error:
        # Only connection failures become 503; schema/query errors must remain errors.
        code = error.orig.args[0] if getattr(error.orig, 'args', ()) else None
        if error.connection_invalidated or code in (2002, 2003, 2006, 2013, 2055):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="資料庫暫時無法連線，無法讀取或儲存資料。請稍後重新載入；這不代表你的資料不存在。",
            ) from error
        raise
    finally:
        db.close() # 執行完 API 後自動關閉連線，還給連線池，防止連線溢滿
