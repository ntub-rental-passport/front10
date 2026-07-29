from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from database import get_db
import models
from passlib.context import CryptContext

router = APIRouter(prefix="/api/auth", tags=["Auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 定義前端傳過來的 Request 格式
class LoginSchema(BaseModel):
    email: EmailStr
    password: str
    role: str

@router.post("/login")
def login(credentials: LoginSchema, db: Session = Depends(get_db)):
    print(f"收到前端傳來的資料: {credentials}")
    # 1. 去 MySQL 資料庫查詢是否有這個 Email
    user = db.query(models.User).filter(models.User.email == credentials.email).first()
    print(f"資料庫查到的使用者: {user}")
    if not user:
        print("失敗原因: 找不到此 Email")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="此帳號不存在，請先註冊"
        )
        
    db_password = getattr(user, 'password', getattr(user, 'hashed_password', None))
    print(f"資料庫密碼: {db_password}, 前端傳來的密碼: {credentials.password}") # 👈 加這行
    if db_password != credentials.password:
        print("失敗原因: 密碼不相符")
        raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST, 
        detail="密碼不正確，請重新輸入"
    )
        
    # 3. 驗證成功，回傳使用者資訊
    return {
        "message": "登入成功",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": credentials.role
        }
    }
class RegisterSchema(BaseModel):
    email: EmailStr
    password: str

@router.post("/register")
def register(data: RegisterSchema, db: Session = Depends(get_db)):
    # 檢查 Email 是否已存在
    existing_user = db.query(models.User).filter(models.User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="此 Email 已被註冊")
    
    # 建立新使用者並寫入 MySQL
    # 注意：請確認你的 models.User 欄位叫 password 還是 hashed_password
    new_user = models.User(
        email=data.email,
        password=data.password  # 若模型欄位叫 password 則改為 password=data.password
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "註冊成功", "user_id": new_user.id}