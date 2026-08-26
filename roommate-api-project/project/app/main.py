from fastapi import FastAPI

from app.api import auth, households, notes
from app.db import Base, engine

# 開發階段可直接建表；正式環境建議改用 alembic migration
Base.metadata.create_all(bind=engine)

app = FastAPI(title="個人記事 & 室友協作區 API")

app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(households.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
