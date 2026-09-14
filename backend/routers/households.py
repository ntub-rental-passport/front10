"""Roommate collaboration adapted from branch 28 to RentMate tenant authentication."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import User
from notes_models import Household, HouseholdMember, HouseholdTask
from security import get_current_tenant
from routers.notes import NoteCreate, NoteUpdate

router = APIRouter(prefix="/api/households", tags=["Households"])


class HouseholdCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(default="我的室友協作區", min_length=1, max_length=100)


class MemberCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(default="室友", min_length=1, max_length=100)


class TaskCreate(NoteCreate):
    assigneeId: str = ""


class TaskUpdate(NoteUpdate):
    assigneeId: str | None = None


def membership(db, household_id, user):
    member = db.query(HouseholdMember).filter_by(household_id=household_id, user_id=user.id).first()
    if member is None:
        raise HTTPException(404, "協作空間不存在或無權限")
    return member


def owned(db, household_id, user):
    membership(db, household_id, user)
    group = db.get(Household, household_id)
    if group.owner_id != user.id:
        raise HTTPException(403, "只有建立者可以管理成員與邀請連結")
    return group


def group_json(group, user):
    return {"id": group.id, "name": group.name, "inviteCode": group.invite_code,
            "isOwner": group.owner_id == user.id}


def member_json(member):
    return {"id": member.id, "name": member.name, "role": member.role,
            "accent": member.accent, "linked": member.user_id is not None}


def task_json(task):
    return {"id": task.id, "title": task.title, "content": task.content,
            "date": task.note_date.isoformat(), "time": task.note_time or "", "tag": task.tag,
            "done": task.is_done, "assigneeId": task.assignee_id or "", "creatorId": task.creator_id or ""}


def check_assignee(db, household_id, member_id):
    if member_id and not db.query(HouseholdMember).filter_by(id=member_id, household_id=household_id).first():
        raise HTTPException(422, "指派對象不在此協作空間")


@router.get("")
def list_households(user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    groups = db.query(Household).join(HouseholdMember).filter(HouseholdMember.user_id == user.id).order_by(Household.created_at, Household.id).all()
    return [group_json(group, user) for group in groups]


@router.post("", status_code=201)
def create_household(data: HouseholdCreate, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    group = Household(name=data.name, owner_id=user.id, invite_code=secrets.token_urlsafe(24))
    db.add(group)
    db.flush()
    db.add(HouseholdMember(household_id=group.id, user_id=user.id, name=user.display_name or "建立者", role="建立者"))
    db.commit()
    return group_json(group, user)


@router.post("/join/{invite_code}")
def join_household(invite_code: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    group = db.query(Household).filter_by(invite_code=invite_code).first()
    if group is None:
        raise HTTPException(404, "邀請連結無效或已更新")
    if not db.query(HouseholdMember).filter_by(household_id=group.id, user_id=user.id).first():
        db.add(HouseholdMember(household_id=group.id, user_id=user.id, name=user.display_name or "室友", role="室友"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not db.query(HouseholdMember).filter_by(household_id=group.id, user_id=user.id).first():
                raise
    return group_json(group, user)


@router.post("/{household_id}/invite")
def rotate_invite(household_id: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    group = owned(db, household_id, user)
    group.invite_code = secrets.token_urlsafe(24)
    db.commit()
    return group_json(group, user)


@router.get("/{household_id}/members")
def list_members(household_id: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    membership(db, household_id, user)
    return [member_json(m) for m in db.query(HouseholdMember).filter_by(household_id=household_id).order_by(HouseholdMember.id).all()]


@router.post("/{household_id}/members", status_code=201)
def create_member(household_id: str, data: MemberCreate, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    owned(db, household_id, user)
    member = HouseholdMember(household_id=household_id, name=data.name, role=data.role)
    db.add(member)
    db.commit()
    return member_json(member)


@router.delete("/{household_id}/members/{member_id}", status_code=204)
def remove_member(household_id: str, member_id: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    group = owned(db, household_id, user)
    member = db.query(HouseholdMember).filter_by(id=member_id, household_id=household_id).first()
    if member is None:
        raise HTTPException(404, "成員不存在")
    if member.user_id == group.owner_id:
        raise HTTPException(409, "不能移除協作空間建立者")
    db.query(HouseholdTask).filter_by(household_id=household_id, assignee_id=member.id).update({"assignee_id": None})
    db.query(HouseholdTask).filter_by(household_id=household_id, creator_id=member.id).update({"creator_id": None})
    db.delete(member)
    db.commit()
    return Response(status_code=204)


@router.get("/{household_id}/tasks")
def list_tasks(household_id: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    membership(db, household_id, user)
    return [task_json(t) for t in db.query(HouseholdTask).filter_by(household_id=household_id).order_by(HouseholdTask.note_date, HouseholdTask.id).all()]


@router.post("/{household_id}/tasks", status_code=201)
def create_task(household_id: str, data: TaskCreate, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    member = membership(db, household_id, user)
    check_assignee(db, household_id, data.assigneeId)
    task = HouseholdTask(household_id=household_id, title=data.title, content=data.content,
                         note_date=data.date, note_time=data.time, tag=data.tag,
                         assignee_id=data.assigneeId or None, creator_id=member.id)
    db.add(task)
    db.commit()
    return task_json(task)


@router.patch("/{household_id}/tasks/{task_id}")
def update_task(household_id: str, task_id: str, data: TaskUpdate, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    membership(db, household_id, user)
    task = db.query(HouseholdTask).filter_by(id=task_id, household_id=household_id).first()
    if task is None:
        raise HTTPException(404, "任務不存在")
    values = data.model_dump(exclude_unset=True)
    if "assigneeId" in values:
        check_assignee(db, household_id, values["assigneeId"])
        values["assigneeId"] = values["assigneeId"] or None
    field_map = {"date": "note_date", "time": "note_time", "done": "is_done", "assigneeId": "assignee_id"}
    for key, value in values.items():
        setattr(task, field_map.get(key, key), value)
    db.commit()
    return task_json(task)


@router.delete("/{household_id}/tasks/{task_id}", status_code=204)
def delete_task(household_id: str, task_id: str, user: User = Depends(get_current_tenant), db: Session = Depends(get_db)):
    membership(db, household_id, user)
    task = db.query(HouseholdTask).filter_by(id=task_id, household_id=household_id).first()
    if task is None:
        raise HTTPException(404, "任務不存在")
    db.delete(task)
    db.commit()
    return Response(status_code=204)
