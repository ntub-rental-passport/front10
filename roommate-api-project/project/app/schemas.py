from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = None
    tags: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None
    is_pinned: Optional[bool] = None


class NoteOut(BaseModel):
    id: str
    title: str
    content: Optional[str]
    tags: Optional[str]
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HouseholdCreate(BaseModel):
    name: str


class HouseholdOut(BaseModel):
    id: str
    name: str
    invite_code: str

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None


class TaskOut(BaseModel):
    id: str
    title: str
    assignee_id: Optional[str]
    due_date: Optional[datetime]
    status: str

    class Config:
        from_attributes = True
