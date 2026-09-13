import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db import get_db
from app.models import Household, HouseholdMember, Task
from app.schemas import HouseholdCreate, HouseholdOut, TaskCreate, TaskOut

router = APIRouter(prefix="/api/households", tags=["households"])


def _require_membership(household_id: str, user_id: str, db: Session) -> HouseholdMember:
    """
    協作區的每一支 API 都必須先過這一關：
    確認目前登入的使用者確實屬於這個 household，
    否則回 404（不要透露該 household 是否存在，避免資訊洩漏）。
    """
    member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="協作空間不存在或無權限")
    return member


@router.post("", response_model=HouseholdOut)
def create_household(
    data: HouseholdCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    household = Household(name=data.name, invite_code=secrets.token_urlsafe(6))
    db.add(household)
    db.commit()
    db.refresh(household)

    # 建立者自動成為 admin
    db.add(HouseholdMember(household_id=household.id, user_id=user_id, role="admin"))
    db.commit()
    return household


@router.post("/join/{invite_code}", response_model=HouseholdOut)
def join_household(
    invite_code: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    household = db.query(Household).filter(Household.invite_code == invite_code).first()
    if household is None:
        raise HTTPException(status_code=404, detail="邀請碼無效")

    existing = _require_membership_optional(household.id, user_id, db)
    if existing is None:
        db.add(HouseholdMember(household_id=household.id, user_id=user_id, role="member"))
        db.commit()
    return household


def _require_membership_optional(household_id: str, user_id: str, db: Session):
    return (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
        .first()
    )


@router.get("/{household_id}/tasks", response_model=list[TaskOut])
def list_tasks(
    household_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_membership(household_id, user_id, db)
    return db.query(Task).filter(Task.household_id == household_id).all()


@router.post("/{household_id}/tasks", response_model=TaskOut)
def create_task(
    household_id: str,
    data: TaskCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_membership(household_id, user_id, db)
    task = Task(household_id=household_id, **data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{household_id}/tasks/{task_id}", response_model=TaskOut)
def update_task_status(
    household_id: str,
    task_id: str,
    status: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_membership(household_id, user_id, db)
    task = db.query(Task).filter(Task.id == task_id, Task.household_id == household_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="任務不存在")
    if status not in ("todo", "in_progress", "done"):
        raise HTTPException(status_code=400, detail="無效的狀態")
    task.status = status
    db.commit()
    db.refresh(task)
    return task
