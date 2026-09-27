from datetime import date as DateValue, datetime, time as TimeValue

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator
from sqlalchemy.orm import Session
from typing import Literal

from database import get_db
from models import Note, User
from security import get_current_tenant as get_current_user

router = APIRouter(prefix="/api/notes", tags=["Notes"])


class NoteCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=10_000)
    date: DateValue | None = None
    time: str | None = Field(default=None, pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$")
    tag: Literal['租務', '提醒', '維護', '採買']

    @field_validator('date', mode='before')
    @classmethod
    def blank_date(cls, value):
        return None if value == '' else value


class NoteUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator('date', mode='before')
    @classmethod
    def blank_date(cls, value):
        return None if value == '' else value

    @model_validator(mode="after")
    def reject_null_fields(self):
        for name in self.model_fields_set:
            if name not in {"time", "date", "assigneeId"} and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=10_000)
    date: DateValue | None = None
    time: str | None = Field(default=None, pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$")
    tag: Literal['租務', '提醒', '維護', '採買'] | None = None
    done: bool | None = None


class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    date: str
    time: str
    tag: str
    done: bool
    createdAt: datetime
    updatedAt: datetime


def serialize(note: Note) -> NoteResponse:
    return NoteResponse(id=str(note.id), title=note.title, content=note.content or "", date=note.due_date.isoformat() if note.due_date else "", time=note.due_time.strftime("%H:%M") if note.due_time else "", tag=note.tag, done=note.done, createdAt=note.created_at, updatedAt=note.updated_at)


def note_for_user(note_id: int, user: User, db: Session) -> Note:
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="note-not-found")
    return note


@router.get("", response_model=list[NoteResponse])
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [serialize(note) for note in db.query(Note).filter(Note.user_id == user.id).order_by(Note.due_date, Note.due_time, Note.id).all()]


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = Note(user_id=user.id, title=payload.title.strip(), content=payload.content.strip(), due_date=payload.date, due_time=TimeValue.fromisoformat(payload.time) if payload.time else None, tag=payload.tag)
    db.add(note)
    db.commit()
    db.refresh(note)
    return serialize(note)


@router.patch("/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, payload: NoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = note_for_user(note_id, user, db)
    field_map = {"date": "due_date", "time": "due_time", "done": "done"}
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "time":
            value = TimeValue.fromisoformat(value) if value else None
        if field == "done" and value != note.done:
            note.done_at = datetime.utcnow() if value else None
        setattr(note, field_map.get(field, field), value.strip() if field in {"title", "content"} and isinstance(value, str) else value)
    db.commit()
    db.refresh(note)
    return serialize(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(note_for_user(note_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
