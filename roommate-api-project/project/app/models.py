import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Boolean, Numeric, Enum
)
from sqlalchemy.orm import relationship

from app.db import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    google_sub = Column(String(255), unique=True, nullable=False, index=True)  # Google 帳號唯一 id
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255))
    avatar_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    notes = relationship("Note", back_populates="owner")
    memberships = relationship("HouseholdMember", back_populates="user")


class Note(Base):
    """個人記事，只有本人可存取"""
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text)
    tags = Column(String(255))  # 逗號分隔，簡化版；要更彈性可拆成獨立 Tag 表
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="notes")


class Household(Base):
    """室友協作空間"""
    __tablename__ = "households"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    invite_code = Column(String(20), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("HouseholdMember", back_populates="household")
    tasks = relationship("Task", back_populates="household")
    expenses = relationship("Expense", back_populates="household")


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    household_id = Column(String(36), ForeignKey("households.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(Enum("admin", "member", name="member_role"), default="member")
    joined_at = Column(DateTime, default=datetime.utcnow)

    household = relationship("Household", back_populates="members")
    user = relationship("User", back_populates="memberships")


class Task(Base):
    """家事分工任務"""
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    household_id = Column(String(36), ForeignKey("households.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    assignee_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(Enum("todo", "in_progress", "done", name="task_status"), default="todo")
    created_at = Column(DateTime, default=datetime.utcnow)

    household = relationship("Household", back_populates="tasks")


class Expense(Base):
    """分帳紀錄"""
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    household_id = Column(String(36), ForeignKey("households.id"), nullable=False, index=True)
    paid_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255))
    split_between = Column(Text)  # 簡化：存 JSON 字串 ["user_id1","user_id2"]
    is_settled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    household = relationship("Household", back_populates="expenses")
