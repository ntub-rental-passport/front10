"""Notes collaboration tables, integrated with the existing users table."""
import datetime
import uuid

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, String, Text, Integer, UniqueConstraint
from database import Base


def new_id():
    return str(uuid.uuid4())


class Household(Base):
    __tablename__ = "note_households"
    id = Column(String(36), primary_key=True, default=new_id)
    name = Column(String(100), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(64), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class HouseholdMember(Base):
    __tablename__ = "note_household_members"
    __table_args__ = (UniqueConstraint("household_id", "user_id", name="uq_note_household_user"),)
    id = Column(String(36), primary_key=True, default=new_id)
    household_id = Column(String(36), ForeignKey("note_households.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(100), nullable=False)
    role = Column(String(100), nullable=False, default="室友")
    accent = Column(String(10), nullable=False, default="indigo")


class HouseholdTask(Base):
    __tablename__ = "note_household_tasks"
    id = Column(String(36), primary_key=True, default=new_id)
    household_id = Column(String(36), ForeignKey("note_households.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False, default="")
    note_date = Column(Date, nullable=False)
    note_time = Column(String(5), nullable=True)
    tag = Column(String(30), nullable=False)
    is_done = Column(Boolean, nullable=False, default=False)
    assignee_id = Column(String(36), ForeignKey("note_household_members.id"), nullable=True)
    creator_id = Column(String(36), ForeignKey("note_household_members.id"), nullable=True)
