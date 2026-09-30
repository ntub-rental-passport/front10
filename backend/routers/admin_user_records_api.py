"""後台使用者詳情的押金對帳與點交存證（見 admin/user_records.py）。僅限管理員，只讀。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from admin import user_records
from auth.security import get_current_admin
from db.database import get_db
from db.models import User

router = APIRouter(tags=['Admin user records'])


@router.get('/api/admin/users/{user_id}/records')
def read_user_records(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='找不到這個帳號。')
    return user_records.user_records(db, user)
