from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db import get_db
from app.models import Note
from app.schemas import NoteCreate, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.post("", response_model=NoteOut)
def create_note(
    data: NoteCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    note = Note(user_id=user_id, **data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("", response_model=list[NoteOut])
def list_notes(
    tag: str | None = None,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    query = db.query(Note).filter(Note.user_id == user_id)
    if tag:
        query = query.filter(Note.tags.contains(tag))
    return query.order_by(Note.is_pinned.desc(), Note.updated_at.desc()).all()


def _get_owned_note(note_id: str, user_id: str, db: Session) -> Note:
    note = db.query(Note).filter(Note.id == note_id).first()
    if note is None:
        raise HTTPException(status_code=404, detail="記事不存在")
    if note.user_id != user_id:
        # 關鍵權限檢查：不是自己的記事一律視為不存在，不要洩漏「存在但沒權限」
        raise HTTPException(status_code=404, detail="記事不存在")
    return note


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    return _get_owned_note(note_id, user_id, db)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: str,
    data: NoteUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    note = _get_owned_note(note_id, user_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    note = _get_owned_note(note_id, user_id, db)
    db.delete(note)
    db.commit()
