"""ORM mappings for database.sql (schema v3, source ca00945)."""
import datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Time, Enum, Integer, BigInteger, String, Text, DECIMAL, JSON, ForeignKey, UniqueConstraint, CheckConstraint, Index, CHAR
from sqlalchemy.dialects.mysql import DATETIME, LONGTEXT, TINYINT
from sqlalchemy.orm import relationship
from database import Base
from encrypted_fields import EncryptedText

Timestamp = DateTime().with_variant(DATETIME(fsp=6), "mysql")


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (UniqueConstraint('email', 'role', name='uq_users_email_role'), Index('ix_users_status', 'status'), Index('ix_users_role', 'role'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    email = Column(String(254), nullable=False)
    display_name = Column(String(100), nullable=True)
    national_id = Column(EncryptedText(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    role = Column(Enum('tenant','landlord','admin', validate_strings=True, create_constraint=True), nullable=False)
    password_hash = Column(String(255), nullable=True)
    password_changed_at = Column(Timestamp, nullable=True)
    email_verified_at = Column(Timestamp, nullable=True)
    status = Column(Enum('active','suspended', validate_strings=True, create_constraint=True), nullable=False, default='active')
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    rentals = relationship(
        "Rental", back_populates="user", cascade="all, delete-orphan"
    )

    notifications = relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan"
    )

    trash_favorites = relationship(
        "TrashFavorite", back_populates="user", cascade="all, delete-orphan"
    )

    subsidy_applications = relationship(
        "SubsidyApplication", back_populates="user", cascade="all, delete-orphan"
    )

    identities = relationship("UserIdentity", back_populates="user", cascade="all, delete-orphan")

    edited_messages = relationship("MessageBoard", back_populates="last_editor")

    landlord_properties = relationship("LandlordProperty", back_populates="landlord")

    landlord_tenants = relationship("LandlordTenant", back_populates="landlord")

class UserIdentity(Base):
    __tablename__ = 'user_identities'
    __table_args__ = (UniqueConstraint('provider', 'provider_subject', 'user_id', name='uq_identity_provider_subject_user'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    provider = Column(Enum('google', validate_strings=True, create_constraint=True), nullable=False)
    provider_subject = Column(String(255), nullable=False)
    provider_email = Column(String(254), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="identities")

class PendingRegistration(Base):
    __tablename__ = 'pending_registrations'
    __table_args__ = (UniqueConstraint('email', 'role', name='uq_pending_email_role'), UniqueConstraint('provider', 'provider_subject', 'role', name='uq_pending_provider_subject_role'),Index('idx_pending_expires_at', 'expires_at'),)
    id = Column(CHAR(36), nullable=False, primary_key=True)
    email = Column(String(254), nullable=False)
    provider = Column(Enum('password','google', validate_strings=True, create_constraint=True), nullable=False)
    provider_subject = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(Enum('tenant','landlord','admin', validate_strings=True, create_constraint=True), nullable=False)
    verification_code_hash = Column(CHAR(64), nullable=False)
    expires_at = Column(Timestamp, nullable=False)
    resend_available_at = Column(Timestamp, nullable=False)
    attempt_count = Column(Integer().with_variant(TINYINT(unsigned=True), "mysql"), nullable=False, default=0)
    send_count = Column(Integer().with_variant(TINYINT(unsigned=True), "mysql"), nullable=False, default=1)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class PendingAdminLogin(Base):
    __tablename__ = 'pending_admin_logins'
    __table_args__ = (Index('ix_pending_admin_logins_email', 'email'), Index('ix_pending_admin_logins_expires_at', 'expires_at'),)
    id = Column(String(36), nullable=False, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    email = Column(String(254), nullable=False)
    verification_code_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempt_count = Column(Integer, nullable=False, default=0)
    request_ip = Column(String(45), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    user = relationship("User")

class Rental(Base):
    __tablename__ = 'rentals'
    __table_args__ = (CheckConstraint('payment_day BETWEEN 1 AND 31'),Index('idx_rentals_user_status', 'user_id', 'rental_status'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    review_date = Column(Date, nullable=True)
    review_days = Column(Integer, nullable=True, default=3)
    has_landlord_review_signature = Column(Boolean, nullable=False, default=False)
    has_tenant_review_signature = Column(Boolean, nullable=False, default=False)
    address = Column(Text, nullable=False)
    land_number = Column(String(100), nullable=True)
    building_number = Column(String(100), nullable=True)
    building_area = Column(DECIMAL(8,2), nullable=True)
    has_annex_building = Column(Boolean, nullable=False, default=False)
    annex_building_desc = Column(String(255), nullable=True)
    rental_scope = Column(Enum('entire','partial', validate_strings=True, create_constraint=True), nullable=False, default='entire')
    rental_scope_details = Column(String(255), nullable=True)
    has_parking = Column(Boolean, nullable=False, default=False)
    parking_details = Column(String(255), nullable=True)
    has_equipment = Column(Boolean, nullable=False, default=False)
    equipment_list = Column(Text, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    handover_date = Column(Date, nullable=True)
    rent_amount = Column(Integer, nullable=False)
    payment_interval_months = Column(Integer, nullable=False, default=1)
    payment_day = Column(Integer, nullable=False)
    payment_method = Column(String(50), nullable=True, default='轉帳')
    total_periods = Column(Integer, nullable=False)
    deposit_months = Column(Integer, nullable=False, default=2)
    deposit_amount = Column(Integer, nullable=False)
    management_fee_rule = Column(String(255), nullable=True)
    water_fee_rule = Column(String(255), nullable=True)
    electricity_fee_type = Column(String(100), nullable=True)
    electricity_fee_rate = Column(String(100), nullable=True)
    gas_fee_rule = Column(String(255), nullable=True)
    network_fee_rule = Column(String(255), nullable=True)
    other_fees_rule = Column(Text, nullable=True)
    abandoned_items_rule = Column(Text, nullable=True)
    jurisdiction_court = Column(String(100), nullable=True, default='臺灣臺北地方法院')
    landlord_name = Column(EncryptedText(255), nullable=True)
    landlord_national_id = Column(EncryptedText(255), nullable=True)
    landlord_registered_address = Column(EncryptedText(512), nullable=True)
    landlord_contact_address = Column(EncryptedText(512), nullable=True)
    landlord_phone = Column(EncryptedText(255), nullable=True)
    tenant_name = Column(String(100), nullable=True)
    tenant_national_id = Column(EncryptedText(255), nullable=True)
    tenant_registered_address = Column(EncryptedText(512), nullable=True)
    tenant_contact_address = Column(EncryptedText(512), nullable=True)
    tenant_phone = Column(EncryptedText(255), nullable=True)
    contract_tag = Column(String(30), nullable=True)
    other_info = Column(Text, nullable=True)
    rental_status = Column(String(20), nullable=False, default='active')
    confirmed_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="rentals")

    bills = relationship(
        "Bill", back_populates="rental", cascade="all, delete-orphan"
    )

    contract_analysis = relationship(
        "ContractAnalysis",
        uselist=False,
        back_populates="rental",
        cascade="all, delete-orphan",
    )

    inspection_records = relationship(
        "InspectionRecord",
        back_populates="rental",
        cascade="all, delete-orphan",
    )

    message_boards = relationship(
        "MessageBoard", back_populates="rental", cascade="all, delete-orphan"
    )

    subsidy_applications = relationship(
        "SubsidyApplication",
        back_populates="rental",
        cascade="all, delete-orphan",
    )

class Bill(Base):
    __tablename__ = 'bills'
    __table_args__ = (UniqueConstraint('rental_id', 'period_index', name='uq_bills_rental_period'),Index('idx_bills_due_unpaid', 'due_date', 'paid_at'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)
    period_index = Column(Integer, nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    rent_amount = Column(Integer, nullable=False)
    electricity_amount = Column(Integer, nullable=True)
    water_amount = Column(Integer, nullable=True)
    paid_at = Column(Timestamp, nullable=True)
    payment_method = Column(Enum('bank-transfer','cash','line-pay','other', validate_strings=True, create_constraint=True), nullable=True)
    payment_note = Column(Text, nullable=True)
    payment_proof_url = Column(String(512), nullable=True)

    rental = relationship("Rental", back_populates="bills")

class ContractAnalysis(Base):
    __tablename__ = 'contract_analyses'
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False, unique=True)
    contract_file_url = Column(String(512), nullable=False)
    ocr_raw_text = Column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    risk_report = Column(Text, nullable=False)
    negotiation_script = Column(Text().with_variant(LONGTEXT(), "mysql"), nullable=True)

    rental = relationship("Rental", back_populates="contract_analysis")

class InspectionRecord(Base):
    __tablename__ = 'inspection_records'
    __table_args__ = (Index('idx_inspection_rental_type', 'rental_id', 'type'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)
    type = Column(Enum('check_in','check_out', validate_strings=True, create_constraint=True), nullable=False)
    photo_url = Column(String(512), nullable=False)
    item_name = Column(String(100), nullable=True)
    room_name = Column(String(100), nullable=True)
    vlm_result = Column(JSON, nullable=True)
    user_note = Column(Text, nullable=True)
    captured_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="inspection_records")

class MessageBoard(Base):
    __tablename__ = 'message_boards'
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)
    content = Column(Text, nullable=False)
    last_editor_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="message_boards")

    last_editor = relationship("User", back_populates="edited_messages")

class LandlordProperty(Base):
    __tablename__ = 'landlord_properties'
    __table_args__ = (UniqueConstraint('landlord_id', 'name', name='uq_landlord_property_name'),Index('idx_landlord_properties_landlord', 'landlord_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    city = Column(String(50), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    landlord = relationship("User", back_populates="landlord_properties")

    rooms = relationship("LandlordRoom", back_populates="property", cascade="all, delete-orphan")

class LandlordRoom(Base):
    __tablename__ = 'landlord_rooms'
    __table_args__ = (UniqueConstraint('property_id', 'number', name='uq_landlord_room_number'),Index('idx_landlord_rooms_property', 'property_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('landlord_properties.id', ondelete='CASCADE'), nullable=False)
    number = Column(String(50), nullable=False)
    status = Column(Enum('vacant','occupied','turnover','maintenance', validate_strings=True, create_constraint=True), nullable=False, default='vacant')
    floor = Column(Integer, nullable=True)
    area = Column(DECIMAL(8,2), nullable=True)
    expected_rent = Column(Integer, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    property = relationship("LandlordProperty", back_populates="rooms")

    leases = relationship("LandlordLease", back_populates="room")

class LandlordTenant(Base):
    __tablename__ = 'landlord_tenants'
    __table_args__ = (Index('idx_landlord_tenants_landlord', 'landlord_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(100), nullable=False)
    phone = Column(EncryptedText(255), nullable=False)
    email = Column(String(254), nullable=True)
    national_id = Column(EncryptedText(255), nullable=True)
    birth_date = Column(Date, nullable=True)
    contact_address = Column(EncryptedText(512), nullable=True)
    emergency_name = Column(String(100), nullable=True)
    emergency_phone = Column(EncryptedText(255), nullable=True)
    notes = Column(Text, nullable=True)
    line_user_id = Column(String(255), nullable=True)
    line_status = Column(Enum('unbound','invited','bound','expired', validate_strings=True, create_constraint=True), nullable=False, default='unbound')
    line_invited_at = Column(Timestamp, nullable=True)
    line_bound_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    deleted_at = Column(Timestamp, nullable=True)

    landlord = relationship("User", back_populates="landlord_tenants")

    leases = relationship("LandlordLease", back_populates="tenant")

    activities = relationship("LandlordTenantActivity", back_populates="tenant", cascade="all, delete-orphan")

class LandlordLease(Base):
    __tablename__ = 'landlord_leases'
    __table_args__ = (Index('idx_landlord_leases_tenant', 'tenant_id'), Index('idx_landlord_leases_room_period', 'room_id', 'start_date', 'end_date', 'status'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('landlord_tenants.id', ondelete='RESTRICT'), nullable=False)
    property_id = Column(Integer, ForeignKey('landlord_properties.id', ondelete='RESTRICT'), nullable=False)
    room_id = Column(Integer, ForeignKey('landlord_rooms.id', ondelete='RESTRICT'), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    monthly_rent = Column(Integer, nullable=False)
    deposit_amount = Column(Integer, nullable=False)
    payment_day = Column(Integer().with_variant(TINYINT(unsigned=True), "mysql"), nullable=False)
    payment_frequency = Column(String(30), nullable=False, default='monthly')
    contract_id = Column(String(100), nullable=True)
    status = Column(Enum('pending','active','ended','terminated', validate_strings=True, create_constraint=True), nullable=False, default='active')
    moved_out_at = Column(Date, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    tenant = relationship("LandlordTenant", back_populates="leases")

    property = relationship("LandlordProperty")

    room = relationship("LandlordRoom", back_populates="leases")

    move_out = relationship("LandlordMoveOut", back_populates="lease", uselist=False)

class LandlordMoveOut(Base):
    __tablename__ = 'landlord_move_outs'
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='RESTRICT'), nullable=False, unique=True)
    move_out_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    final_rent = Column(Integer, nullable=False, default=0)
    utility_fee = Column(Integer, nullable=False, default=0)
    deposit_refund = Column(Integer, nullable=False, default=0)
    deposit_deduction = Column(Integer, nullable=False, default=0)
    deduction_reason = Column(Text, nullable=True)
    inspection_status = Column(String(30), nullable=False, default='pending')
    notes = Column(Text, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    lease = relationship("LandlordLease", back_populates="move_out")

class LandlordTenantActivity(Base):
    __tablename__ = 'landlord_tenant_activities'
    __table_args__ = (Index('idx_landlord_tenant_activities_tenant', 'tenant_id', 'occurred_at'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('landlord_tenants.id', ondelete='CASCADE'), nullable=False)
    kind = Column(String(50), nullable=False)
    detail = Column(Text, nullable=False)
    occurred_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    tenant = relationship("LandlordTenant", back_populates="activities")

class RepairTicket(Base):
    __tablename__ = 'repair_tickets'
    __table_args__ = (Index('idx_repair_tickets_rental_status', 'rental_id', 'status'), Index('idx_repair_tickets_lease_status', 'lease_id', 'status'), Index('idx_repair_tickets_lease_unread', 'lease_id', 'landlord_read_at'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    tenant_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='SET NULL'), nullable=True)
    location = Column(String(100), nullable=True)
    equipment = Column(String(100), nullable=True)
    description = Column(Text, nullable=False)
    urgency = Column(Enum('low','medium','high','urgent', validate_strings=True, create_constraint=True), nullable=False, default='medium')
    available_time = Column(Text, nullable=True)
    access_permission = Column(Enum('present','absent','contact-first', validate_strings=True, create_constraint=True), nullable=False, default='contact-first')
    status = Column(Enum('new','acknowledged','scheduled','in_progress','completed','cancelled', validate_strings=True, create_constraint=True), nullable=False, default='new')
    landlord_read_at = Column(Timestamp, nullable=True)
    responsibility = Column(Enum('landlord','tenant','shared','undetermined', validate_strings=True, create_constraint=True), nullable=False, default='undetermined')
    responsibility_note = Column(Text, nullable=True)
    vendor_name = Column(String(100), nullable=True)
    vendor_phone = Column(String(30), nullable=True)
    scheduled_at = Column(Timestamp, nullable=True)
    completed_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class RepairTicketPhoto(Base):
    __tablename__ = 'repair_ticket_photos'
    __table_args__ = (Index('idx_repair_photos_ticket', 'ticket_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey('repair_tickets.id', ondelete='CASCADE'), nullable=False)
    photo_url = Column(String(512), nullable=False)
    photo_name = Column(String(255), nullable=True)
    uploaded_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class Note(Base):
    __tablename__ = 'personal_notes'
    __table_args__ = (Index('idx_personal_notes_user_due', 'user_id', 'due_date', 'done'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)
    tag = Column(Enum('租務','提醒','維護','採買', validate_strings=True, create_constraint=True), nullable=False, default='租務')
    due_date = Column(Date, nullable=True)
    due_time = Column(Time, nullable=True)
    done = Column(Boolean, nullable=False, default=False)
    done_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User")

class Household(Base):
    __tablename__ = 'households'
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    invite_code = Column(String(20), nullable=False, unique=True)
    created_by = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class HouseholdMember(Base):
    __tablename__ = 'household_members'
    __table_args__ = (UniqueConstraint('household_id', 'user_id', name='uq_household_member'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    household_id = Column(Integer, ForeignKey('households.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    display_name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=True)
    accent = Column(Enum('indigo','emerald','amber','rose', validate_strings=True, create_constraint=True), nullable=False, default='indigo')
    joined_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class HouseholdTask(Base):
    __tablename__ = 'roommate_tasks'
    __table_args__ = (Index('idx_roommate_tasks_household_done', 'household_id', 'done', 'due_date'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    household_id = Column(Integer, ForeignKey('households.id', ondelete='CASCADE'), nullable=False)
    creator_member_id = Column(Integer, ForeignKey('household_members.id', ondelete='SET NULL'), nullable=True)
    assignee_member_id = Column(Integer, ForeignKey('household_members.id', ondelete='SET NULL'), nullable=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)
    tag = Column(Enum('公共區域','清潔','帳務','採買', validate_strings=True, create_constraint=True), nullable=False, default='公共區域')
    due_date = Column(Date, nullable=True)
    due_time = Column(Time, nullable=True)
    done = Column(Boolean, nullable=False, default=False)
    done_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Notification(Base):
    __tablename__ = 'notifications'
    __table_args__ = (Index('idx_notifications_pending', 'is_sent', 'remind_at'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    category = Column(Enum('payment','trash','inspection','contract_end','utility_outage','repair','subsidy', validate_strings=True, create_constraint=True), nullable=False)
    content = Column(Text, nullable=False)
    remind_at = Column(Timestamp, nullable=False)
    is_sent = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="notifications")

class TrashFavorite(Base):
    __tablename__ = 'trash_favorites'
    __table_args__ = (UniqueConstraint('user_id', 'station_id', name='uq_trash_favorites_user_station'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    station_id = Column(String(50), nullable=False)
    station_name = Column(String(255), nullable=False)

    user = relationship("User", back_populates="trash_favorites")

class SubsidyApplication(Base):
    __tablename__ = 'subsidy_applications'
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)
    application_type = Column(Enum('housing','rent_subsidy','recovery', validate_strings=True, create_constraint=True), nullable=False, default='rent_subsidy')
    application_status = Column(String(50), nullable=False, default='draft')
    submitted_at = Column(Timestamp, nullable=True)
    decided_at = Column(Timestamp, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="subsidy_applications")

    rental = relationship("Rental", back_populates="subsidy_applications")

class SubsidyDocument(Base):
    __tablename__ = 'subsidy_documents'
    __table_args__ = (Index('idx_subsidy_docs_application', 'application_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    application_id = Column(Integer, ForeignKey('subsidy_applications.id', ondelete='CASCADE'), nullable=False)
    doc_type = Column(String(50), nullable=False)
    file_url = Column(String(512), nullable=False)
    original_filename = Column(String(255), nullable=True)
    uploaded_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class AdminSetting(Base):
    __tablename__ = 'admin_settings'
    setting_key = Column(String(100), nullable=False, primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    updated_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

class AdminAuditLog(Base):
    __tablename__ = 'admin_audit_logs'
    __table_args__ = (Index('idx_audit_actor_time', 'actor_user_id', 'created_at'), Index('idx_audit_target', 'target_type', 'target_id'),)
    id = Column(BigInteger().with_variant(Integer, "sqlite"), nullable=False, primary_key=True, autoincrement=True)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String(100), nullable=True)
    detail = Column(JSON, nullable=True)
    ip = Column(String(45), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
