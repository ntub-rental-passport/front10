from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
import datetime
from database import Base

# 1. 使用者模型
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(254), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    email_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # 關聯設定
    rentals = relationship("Rental", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    trash_favorites = relationship("TrashFavorite", back_populates="user", cascade="all, delete-orphan")
    subsidy_applications = relationship("SubsidyApplication", back_populates="user", cascade="all, delete-orphan")
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    identities = relationship("UserIdentity", back_populates="user", cascade="all, delete-orphan")
    password_credential = relationship(
        "UserPasswordCredential",
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", name="uq_user_role"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum("tenant", "landlord"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="roles")


class UserIdentity(Base):
    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_identity_provider_subject"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(Enum("google"), nullable=False)
    provider_subject = Column(String(255), nullable=False)
    provider_email = Column(String(254), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="identities")


class UserPasswordCredential(Base):
    __tablename__ = "user_password_credentials"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    password_hash = Column(String(255), nullable=False)
    password_changed_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="password_credential")


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"
    __table_args__ = (
        UniqueConstraint("email", name="uq_pending_email"),
        UniqueConstraint("provider", "provider_subject", name="uq_pending_provider_subject"),
    )

    id = Column(String(36), primary_key=True)
    email = Column(String(254), nullable=False, index=True)
    provider = Column(Enum("password", "google"), nullable=False)
    provider_subject = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(Enum("tenant", "landlord"), nullable=False)
    invite_code = Column(String(100), nullable=True)
    verification_code_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    resend_available_at = Column(DateTime, nullable=False)
    attempt_count = Column(Integer, nullable=False, default=0)
    send_count = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

# 2. 租屋案件模型
class Rental(Base):
    __tablename__ = "rentals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    address = Column(Text, nullable=False)
    landlord_name = Column(String(50), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    rent_amount = Column(Integer, nullable=False)
    deposit_amount = Column(Integer, nullable=False)
    payment_day = Column(Integer, nullable=False, default=10)
    total_periods = Column(Integer, nullable=False, default=12)
    contract_tag = Column(String(30), nullable=True)
    other_info = Column(Text, nullable=True)
    rental_status = Column(String(20), nullable=False, default="active")

    # 關聯設定
    user = relationship("User", back_populates="rentals")
    bills = relationship("Bill", back_populates="rental", cascade="all, delete-orphan")
    contract_analysis = relationship("ContractAnalysis", uselist=False, back_populates="rental", cascade="all, delete-orphan")
    inspection_records = relationship("InspectionRecord", back_populates="rental", cascade="all, delete-orphan")
    message_boards = relationship("MessageBoard", back_populates="rental", cascade="all, delete-orphan")
    subsidy_applications = relationship("SubsidyApplication", back_populates="rental", cascade="all, delete-orphan")
    utility_outages = relationship("UtilityOutage", back_populates="rental", cascade="all, delete-orphan")

# 3. 帳單明細模型
class Bill(Base):
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False)
    period_number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    rent_fee = Column(Integer, nullable=False)
    electricity_fee = Column(Integer, nullable=False, default=0)
    water_fee = Column(Integer, nullable=False, default=0)
    bill_status = Column(Enum("unpaid", "paid", "overdue"), nullable=False, default="unpaid")
    paid_at = Column(DateTime, nullable=True)

    rental = relationship("Rental", back_populates="bills")

# 4. 合約 AI 風險分析模型
class ContractAnalysis(Base):
    __tablename__ = "contract_analyses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), unique=True, nullable=False)
    contract_file_url = Column(String(512), nullable=False)
    ocr_raw_text = Column(Text(length=4294967295), nullable=False) # LONGTEXT
    risk_report = Column(Text, nullable=False)
    negotiation_script = Column(Text(length=4294967295), nullable=True)

    rental = relationship("Rental", back_populates="contract_analysis")

# 5. 屋況點交存證模型
class InspectionRecord(Base):
    __tablename__ = "inspection_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum("check_in", "check_out"), nullable=False)
    photo_url = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)
    captured_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="inspection_records")

# 6. 租屋留言/記事板模型
class MessageBoard(Base):
    __tablename__ = "message_boards"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    last_editor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="message_boards")

# 7. 系統通知模型
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(Enum("payment", "trash", "inspection", "contract_end", "utility_outage"), nullable=False)
    content = Column(Text, nullable=False)
    remind_at = Column(DateTime, nullable=False)
    is_sent = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="notifications")

# 8. 垃圾車收藏點模型
class TrashFavorite(Base):
    __tablename__ = "trash_favorites"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    station_id = Column(String(50), nullable=False)
    station_name = Column(String(255), nullable=False)

    user = relationship("User", back_populates="trash_favorites")

# 9. 租屋補助申請手動追蹤模型
class SubsidyApplication(Base):
    __tablename__ = "subsidy_applications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False)
    application_status = Column(String(50), nullable=False)
    remark = Column(Text, nullable=True)

    user = relationship("User", back_populates="subsidy_applications")
    rental = relationship("Rental", back_populates="subsidy_applications")

# 10. 停水停電快取模型
class UtilityOutage(Base):
    __tablename__ = "utility_outages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum("water", "electricity"), nullable=False)
    is_outage = Column(Boolean, nullable=False, default=False)
    status_message = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="utility_outages")
