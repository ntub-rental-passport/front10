"""ORM mappings for database.sql (multi-role accounts)."""
import datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Time, Enum, Float, Integer, BigInteger, String, Text, DECIMAL, JSON, ForeignKey, UniqueConstraint, CheckConstraint, Index, CHAR
from sqlalchemy.dialects.mysql import DATETIME, DOUBLE, LONGTEXT, TINYINT
from sqlalchemy.orm import deferred, relationship
from sqlalchemy.ext.hybrid import hybrid_method
from db.database import Base
from db.encrypted_fields import EncryptedText

Timestamp = DateTime().with_variant(DATETIME(fsp=6), "mysql")


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (UniqueConstraint('email', name='uq_users_email'), Index('ix_users_status', 'status'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    email = Column(String(254), nullable=False)
    display_name = Column(String(100), nullable=True)
    national_id = Column(EncryptedText(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=True)
    password_changed_at = Column(Timestamp, nullable=True)
    email_verified_at = Column(Timestamp, nullable=True)
    status = Column(Enum('active','suspended', validate_strings=True, create_constraint=True), nullable=False, default='active')
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan", lazy="selectin")

    @hybrid_method
    def has_role(self, role):
        return any(item.role == role for item in self.roles)

    @has_role.expression
    def has_role(cls, role):
        return cls.roles.any(UserRole.role == role)

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

class UserRole(Base):
    __tablename__ = 'user_roles'
    __table_args__ = (Index('ix_user_roles_role', 'role'),)
    user_id = Column(Integer, ForeignKey('users.id', name='fk_user_roles_user', ondelete='CASCADE'), primary_key=True, nullable=False)
    role = Column(Enum('tenant','landlord','admin', validate_strings=True, create_constraint=True), primary_key=True, nullable=False)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    user = relationship("User", back_populates="roles")


class UserIdentity(Base):
    __tablename__ = 'user_identities'
    __table_args__ = (UniqueConstraint('provider', 'provider_subject', name='uq_identity_provider_subject'),)
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

class PasswordResetChallenge(Base):
    __tablename__ = 'password_reset_challenges'
    id = Column(CHAR(36), primary_key=True)
    email = Column(String(254), nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    code_hash = Column(CHAR(64), nullable=False)
    credential_hash = Column(CHAR(64), nullable=False)
    expires_at = Column(Timestamp, nullable=False)
    resend_available_at = Column(Timestamp, nullable=False)
    window_started_at = Column(Timestamp, nullable=False, index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    send_count = Column(Integer, nullable=False, default=0)
    request_ip = Column(String(45), nullable=False, index=True)
    consumed = Column(Boolean, nullable=False, default=False)


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
    tax_id = Column(String(100), nullable=True)
    has_annex_building = Column(Boolean, nullable=False, default=False)
    annex_building_purpose = Column(String(255), nullable=True)
    annex_building_area = Column(DECIMAL(8,2), nullable=True)
    rental_scope = Column(Enum('entire','partial', validate_strings=True, create_constraint=True), nullable=False, default='entire')
    rental_room = Column(String(255), nullable=True)
    rental_area = Column(DECIMAL(8,2), nullable=True)
    has_parking = Column(Boolean, nullable=False, default=False)
    car_parking_count = Column(Integer, nullable=True)
    car_parking_type = Column(String(20), nullable=True)
    car_parking_floor = Column(String(30), nullable=True)
    car_parking_number = Column(String(50), nullable=True)
    motorcycle_parking_count = Column(Integer, nullable=True)
    motorcycle_parking_floor = Column(String(30), nullable=True)
    motorcycle_parking_number = Column(String(100), nullable=True)
    parking_usage_time = Column(String(30), nullable=True)
    has_equipment = Column(Boolean, nullable=False, default=False)
    equipment_list = Column(Text, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    handover_date = Column(Date, nullable=True)
    rent_amount = Column(Integer, nullable=False)
    payment_interval_months = Column(Integer, nullable=False, default=1)
    payment_day = Column(Integer, nullable=False)
    payment_method = Column(String(50), nullable=True, default='轉帳')
    bank_account = Column(EncryptedText(512), nullable=True)
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
    tenant_name = Column(EncryptedText(255), nullable=True)
    tenant_national_id = Column(EncryptedText(255), nullable=True)
    tenant_registered_address = Column(EncryptedText(512), nullable=True)
    tenant_contact_address = Column(EncryptedText(512), nullable=True)
    tenant_phone = Column(EncryptedText(255), nullable=True)
    agent_name = Column(EncryptedText(255), nullable=True)
    agent_national_id = Column(EncryptedText(255), nullable=True)
    authorization_document = Column(String(255), nullable=True)
    sublease_consent = Column(String(255), nullable=True)
    contract_tag = Column(String(30), nullable=True)
    rental_status = Column(String(20), nullable=False, default='active')
    confirmed_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="rentals")

    bills = relationship(
        "Bill", back_populates="rental", cascade="all, delete-orphan"
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
    utility_details = Column(JSON, nullable=True)
    paid_at = Column(Timestamp, nullable=True)
    payment_method = Column(Enum('bank-transfer','cash','line-pay','other', validate_strings=True, create_constraint=True), nullable=True)
    payment_note = Column(Text, nullable=True)
    payment_proof_url = Column(String(512), nullable=True)

    rental = relationship("Rental", back_populates="bills")

class InspectionItem(Base):
    __tablename__ = 'inspection_items'
    __table_args__ = (Index('idx_inspection_items_rental', 'rental_id'), Index('idx_inspection_items_lease', 'lease_id'),)
    id = Column(Integer, primary_key=True, nullable=False, autoincrement=True)
    # 屬於租客自己存的合約（rental_id）或房東平台上的租約（lease_id），兩者恰好一個
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=True)
    room_name = Column(String(100), nullable=False)
    item_name = Column(String(100), nullable=False)
    category = Column(String(20), nullable=False, default='furniture')
    baseline_record_id = Column(Integer, ForeignKey('inspection_records.id', ondelete='SET NULL'), nullable=True, unique=True)
    checkout_record_id = Column(Integer, ForeignKey('inspection_records.id', ondelete='SET NULL'), nullable=True, unique=True)
    comparison_result = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False, default=0)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    baseline = relationship('InspectionRecord', foreign_keys=[baseline_record_id])
    checkout = relationship('InspectionRecord', foreign_keys=[checkout_record_id])


class InspectionRecord(Base):
    __tablename__ = 'inspection_records'
    __table_args__ = (Index('idx_inspection_rental_type', 'rental_id', 'type'), Index('idx_inspection_records_lease', 'lease_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=True)
    type = Column(Enum('check_in','check_out', validate_strings=True, create_constraint=True), nullable=False)
    photo_url = Column(String(512), nullable=False)
    capture_source = Column(Enum('camera', 'file', validate_strings=True, create_constraint=True),
                            nullable=False, default='file')
    capture_quality = Column(JSON, nullable=True)
    item_name = Column(String(100), nullable=True)
    room_name = Column(String(100), nullable=True)
    vlm_result = Column(JSON, nullable=True)
    user_note = Column(Text, nullable=True)
    captured_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    rental = relationship("Rental", back_populates="inspection_records")

class InspectionPhotoDetail(Base):
    __tablename__ = 'inspection_photo_details'
    record_id = Column(Integer, ForeignKey('inspection_records.id', ondelete='CASCADE'), primary_key=True)
    item_id = Column(Integer, ForeignKey('inspection_items.id', ondelete='CASCADE'), nullable=False, index=True)
    angle = Column(String(20), nullable=False, default='other')
    provenance = Column(JSON, nullable=False, default=dict)
    superseded_by = Column(Integer, nullable=True)
    removed_at = Column(Timestamp, nullable=True)


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
    # 加密個資「用到才載入」：載入租客列時不解密，只有真的讀這幾個欄位才解。
    # 這樣某一筆用舊金鑰存的資料解不開時，只影響那一格，不會讓整份清單、帳務或
    # 排程提醒全部失敗（2026-10-05 共用資料庫裡有兩筆別台金鑰寫入的資料）。
    phone = deferred(Column(EncryptedText(255), nullable=False), group='pii')
    email = Column(String(254), nullable=True)
    national_id = deferred(Column(EncryptedText(255), nullable=True), group='pii')
    birth_date = Column(Date, nullable=True)
    contact_address = deferred(Column(EncryptedText(512), nullable=True), group='pii')
    emergency_name = Column(String(100), nullable=True)
    emergency_phone = deferred(Column(EncryptedText(255), nullable=True), group='pii')
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
    # 租客接受邀請後綁定的帳號。租客端的授權依這個 user id，不再只比對 email。
    tenant_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    tenant_bound_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    tenant = relationship("LandlordTenant", back_populates="leases")

    files = relationship("LandlordLeaseFile", back_populates="lease", cascade="all, delete-orphan",
                         order_by="LandlordLeaseFile.id")

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

class LandlordLeaseFile(Base):
    """合約附件：檔案存在伺服器磁碟（LEASE_FILE_DIR），這裡只記伺服器產生的檔名。"""
    __tablename__ = 'landlord_lease_files'
    __table_args__ = (Index('idx_landlord_lease_files_lease', 'lease_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=False)
    stored_name = Column(String(64), nullable=False)
    original_name = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    uploaded_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    lease = relationship("LandlordLease", back_populates="files")

class LandlordCharge(Base):
    """應收帳款：每一期、每一種費用一筆。金額在建立當下固定，之後改租金不會回頭改舊帳。"""
    __tablename__ = 'landlord_charges'
    __table_args__ = (
        UniqueConstraint('lease_id', 'kind', 'period_start', name='uq_landlord_charge_period'),
        Index('idx_landlord_charges_landlord_due', 'landlord_id', 'due_date'),
    )
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='RESTRICT'), nullable=False)
    kind = Column(Enum('rent','water','electricity','other', validate_strings=True, create_constraint=True), nullable=False, default='rent')
    title = Column(String(100), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    amount = Column(Integer, nullable=False)
    utility_details = Column(JSON, nullable=True)
    voided_at = Column(Timestamp, nullable=True)
    void_reason = Column(Text, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    lease = relationship("LandlordLease")
    payments = relationship("LandlordChargePayment", back_populates="charge", cascade="all, delete-orphan",
                            order_by="LandlordChargePayment.id")
    events = relationship("LandlordChargeEvent", back_populates="charge", cascade="all, delete-orphan",
                          order_by="LandlordChargeEvent.id")

class LandlordChargePayment(Base):
    """實收紀錄：只新增；記錯了用一筆負數沖銷，不改不刪，帳才對得起來。"""
    __tablename__ = 'landlord_charge_payments'
    __table_args__ = (Index('idx_landlord_charge_payments_charge', 'charge_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    charge_id = Column(Integer, ForeignKey('landlord_charges.id', ondelete='CASCADE'), nullable=False)
    amount = Column(Integer, nullable=False)
    paid_on = Column(Date, nullable=False)
    method = Column(String(30), nullable=False, default='other')
    note = Column(Text, nullable=True)
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    charge = relationship("LandlordCharge", back_populates="payments")

class LandlordChargeEvent(Base):
    __tablename__ = 'landlord_charge_events'
    __table_args__ = (Index('idx_landlord_charge_events_charge', 'charge_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    charge_id = Column(Integer, ForeignKey('landlord_charges.id', ondelete='CASCADE'), nullable=False)
    kind = Column(String(30), nullable=False)
    detail = Column(Text, nullable=False)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    charge = relationship("LandlordCharge", back_populates="events")

class UtilityEvidence(Base):
    """電費佐證：房東附的電表照片、租客回報的讀數（可附照片）。

    兩邊都用平台時，電費以房東的紀錄為準；租客對讀數有意見就在這裡回報，
    房東決定採用（更正那筆電費）或維持原讀數並回覆。照片存在 UTILITY_PHOTO_DIR，
    這裡只記伺服器產生的檔名。
    """
    __tablename__ = 'utility_evidence'
    __table_args__ = (Index('idx_utility_evidence_charge', 'charge_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    charge_id = Column(Integer, ForeignKey('landlord_charges.id', ondelete='CASCADE'), nullable=False)
    kind = Column(Enum('meter_photo','tenant_reading','payment_proof','charge_dispute', validate_strings=True, create_constraint=True), nullable=False)
    role = Column(Enum('landlord','tenant', validate_strings=True, create_constraint=True), nullable=False)
    submitted_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    reading = Column(DECIMAL(12,2), nullable=True)
    amount = Column(Integer, nullable=True)
    stored_name = Column(String(64), nullable=True)
    original_name = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    status = Column(Enum('open','accepted','kept', validate_strings=True, create_constraint=True), nullable=False, default='open')
    response = Column(Text, nullable=True)
    resolved_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    resolved_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class LeaseContractLink(Base):
    """租客自己存的合約（rentals，掃描紙本、雙方簽名的那份）對應到房東平台上的租約。

    兩份都保留、誰也不蓋掉誰：系統逐項比對條件，把差異同時攤給雙方。
    differences 是最近一次比對的結果；term_history 記錄房東在對應之後改過哪些條件。
    """
    __tablename__ = 'lease_contract_links'
    __table_args__ = (UniqueConstraint('lease_id', name='uq_lease_contract_links_lease'),
                      Index('idx_lease_contract_links_rental', 'rental_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=False)
    rental_id = Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)
    tenant_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    differences = Column(JSON, nullable=True)
    landlord_note = Column(Text, nullable=True)
    landlord_noted_at = Column(Timestamp, nullable=True)
    term_history = Column(JSON, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class LandlordExpense(Base):
    __tablename__ = 'landlord_expenses'
    __table_args__ = (Index('idx_landlord_expenses_landlord_date', 'landlord_id', 'spent_on'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(100), nullable=False)
    category = Column(String(30), nullable=False)
    amount = Column(Integer, nullable=False)
    spent_on = Column(Date, nullable=False)
    property_id = Column(Integer, ForeignKey('landlord_properties.id', ondelete='SET NULL'), nullable=True)
    repair_ticket_id = Column(Integer, ForeignKey('repair_tickets.id', ondelete='SET NULL'), nullable=True)
    note = Column(Text, nullable=True)
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class LeaseInvitation(Base):
    """房東邀請租客加入租約。token 與邀請碼只存雜湊；接受後在租約上記下租客帳號。"""
    __tablename__ = 'lease_invitations'
    __table_args__ = (
        UniqueConstraint('token_hash', name='uq_lease_invitations_token'),
        UniqueConstraint('code_hash', name='uq_lease_invitations_code'),
        Index('idx_lease_invitations_lease', 'lease_id', 'status'),
    )
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    lease_id = Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=False)
    invited_email = Column(String(254), nullable=True)
    token_hash = Column(CHAR(64), nullable=False)
    code_hash = Column(CHAR(64), nullable=False)
    status = Column(Enum('pending','accepted','revoked', validate_strings=True, create_constraint=True), nullable=False, default='pending')
    expires_at = Column(Timestamp, nullable=False)
    accepted_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    accepted_at = Column(Timestamp, nullable=True)
    revoked_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    lease = relationship("LandlordLease")

class LandlordSettings(Base):
    __tablename__ = 'landlord_settings'
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, primary_key=True)
    phone = Column(EncryptedText(255), nullable=True)
    workspace_name = Column(String(100), nullable=True)
    email_notifications = Column(Boolean, nullable=False, default=True)
    rent_reminders = Column(Boolean, nullable=False, default=True)
    contract_reminders = Column(Boolean, nullable=False, default=True)
    repair_notifications = Column(Boolean, nullable=False, default=True)
    reminder_days = Column(Integer, nullable=False, default=30)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class LandlordAuditEvent(Base):
    """房東工作區的操作紀錄：由伺服器在動作成功後寫入，前端不能自己記。"""
    __tablename__ = 'landlord_audit_events'
    __table_args__ = (Index('idx_landlord_audit_events_landlord', 'landlord_id', 'created_at'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    landlord_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    category = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    detail = Column(Text, nullable=True)
    result = Column(Enum('success','warning', validate_strings=True, create_constraint=True), nullable=False, default='success')
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

class LandlordTeamMember(Base):
    """房東工作區的團隊成員。成員用自己的房東帳號登入，切換到擁有者的工作區操作。"""
    __tablename__ = 'landlord_team_members'
    __table_args__ = (
        UniqueConstraint('owner_id', 'email', name='uq_landlord_team_member_email'),
        UniqueConstraint('token_hash', name='uq_landlord_team_member_token'),
        Index('idx_landlord_team_members_member', 'member_user_id', 'status'),
    )
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    email = Column(String(254), nullable=False)
    role = Column(Enum('manager','accounting','viewer', validate_strings=True, create_constraint=True), nullable=False, default='viewer')
    status = Column(Enum('pending','active','revoked', validate_strings=True, create_constraint=True), nullable=False, default='pending')
    member_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    token_hash = Column(CHAR(64), nullable=True)
    expires_at = Column(Timestamp, nullable=True)
    invited_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    accepted_at = Column(Timestamp, nullable=True)
    revoked_at = Column(Timestamp, nullable=True)

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
    phone = Column(EncryptedText(255), nullable=True)
    urgency = Column(Enum('emergency','soon','normal', validate_strings=True, create_constraint=True), nullable=False, default='normal')
    available_time = Column(Text, nullable=True)
    access_permission = Column(Enum('present','absent','contact-first', validate_strings=True, create_constraint=True), nullable=False, default='contact-first')
    contact_before_arrival = Column(Boolean, nullable=False, default=False)
    status = Column(Enum('pending','processing','inspection','completed','canceled', validate_strings=True, create_constraint=True), nullable=False, default='pending')
    landlord_read_at = Column(Timestamp, nullable=True)
    responsibility = Column(Enum('pending','landlord','tenant','shared', validate_strings=True, create_constraint=True), nullable=False, default='pending')
    responsibility_note = Column(Text, nullable=True)
    responsibility_agreement = Column(String(20), nullable=True)
    responsibility_question = Column(Text, nullable=True)
    supplement_requested = Column(Boolean, nullable=False, default=False)
    supplement_request_note = Column(Text, nullable=True)
    vendor_name = Column(String(100), nullable=True)
    vendor_phone = Column(String(30), nullable=True)
    scheduled_at = Column(Timestamp, nullable=True)
    tenant_schedule_reply = Column(String(20), nullable=True)
    reschedule_request = Column(JSON, nullable=True)
    estimated_cost = Column(Integer, nullable=True)
    actual_cost = Column(Integer, nullable=True)
    payer = Column(String(50), nullable=True)
    completion_note = Column(Text, nullable=True)
    inspection_result = Column(String(20), nullable=True)
    unresolved_note = Column(Text, nullable=True)
    unresolved_safety_concern = Column(Boolean, nullable=False, default=False)
    revisit_available_time = Column(Text, nullable=True)
    completed_at = Column(Timestamp, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)
    updated_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    events = relationship("RepairTicketEvent", back_populates="ticket", cascade="all, delete-orphan",
                          order_by="RepairTicketEvent.id")
    photos = relationship("RepairTicketPhoto", back_populates="ticket", cascade="all, delete-orphan",
                          order_by="RepairTicketPhoto.id")

class RepairTicketEvent(Base):
    """報修時間軸。只新增、不修改、不刪除 —— 這就是存證。"""
    __tablename__ = 'repair_ticket_events'
    __table_args__ = (Index('idx_repair_events_ticket', 'ticket_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey('repair_tickets.id', ondelete='CASCADE'), nullable=False)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    actor_role = Column(Enum('tenant','landlord','system', validate_strings=True, create_constraint=True), nullable=False, default='system')
    kind = Column(String(30), nullable=False, default='note')
    title = Column(String(200), nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    ticket = relationship("RepairTicket", back_populates="events")

class RepairTicketPhoto(Base):
    __tablename__ = 'repair_ticket_photos'
    __table_args__ = (Index('idx_repair_photos_ticket', 'ticket_id'),)
    id = Column(Integer, nullable=False, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey('repair_tickets.id', ondelete='CASCADE'), nullable=False)
    event_id = Column(Integer, ForeignKey('repair_ticket_events.id', ondelete='SET NULL'), nullable=True)
    stage = Column(Enum('report','supplement','completion','unresolved','receipt', validate_strings=True, create_constraint=True), nullable=False, default='report')
    uploaded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    photo_url = Column(String(512), nullable=False)
    photo_name = Column(String(255), nullable=True)
    uploaded_at = Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)

    ticket = relationship("RepairTicket", back_populates="photos")

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

class AdminSession(Base):
    """管理員登入的伺服器端紀錄，用來判斷閒置。

    登入憑證本身是無狀態的：只看憑證的話，拿到它的人可以一路用到期限（8 小時）。
    管理員閒置太久（platform_settings.ADMIN_IDLE_MINUTES）要重新登入，
    這件事只能在伺服器這邊判斷 —— 前端的計時器關掉分頁、改時鐘就繞過了。

    `last_active_at` 只在前端回報「使用者真的有在操作」時更新
    （POST /api/auth/admin/activity），一般 API 請求不更新：後台有些頁面會在
    背景輪詢，把它們算成操作的話，人走開了 session 也永遠不會閒置。
    """

    __tablename__ = 'admin_sessions'
    __table_args__ = (Index('ix_admin_sessions_user_id', 'user_id'),)
    id = Column(String(36), nullable=False, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    last_active_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)


# ---------------------------------------------------------------------------
# 後台自己的資料（2026-10-01 從 SQLite 搬進來）
#
# 原本每個模組各存一個 SQLite 小檔，資料不在 ER 圖與備份裡。欄位型別沿用當初
# SQLite 的樣子（時間一律存 ISO 字串、布林存 0/1），搬遷時才不用再轉一次格式。
# 建表的 SQL 在 migrations/20261001_admin_tables_to_mysql.sql。
# ---------------------------------------------------------------------------

class SiteSetting(Base):
    """系統設定：網站名稱、維護模式、各種門檻（admin/site_settings.py）。"""
    __tablename__ = 'site_settings'
    key = Column(String(64), nullable=False, primary_key=True)
    value = Column(Text, nullable=False)


class FeatureOutage(Base):
    """功能停用：暫時對所有使用者關掉某個功能（admin/site_settings.py）。"""
    __tablename__ = 'feature_outages'
    feature_key = Column(String(64), nullable=False, primary_key=True)
    internal_reason = Column(Text, nullable=False)
    public_note = Column(Text, nullable=False)
    closed_at = Column(String(40), nullable=False)
    eta_at = Column(String(40), nullable=True)


class PlatformSetting(Base):
    """安全設定：密碼最短長度、登入有效時間（admin/platform_settings.py）。"""
    __tablename__ = 'platform_settings'
    key = Column(String(64), nullable=False, primary_key=True)
    value = Column(Integer, nullable=False)


class Announcement(Base):
    """後台發的公告（admin/content_service.py）。"""
    __tablename__ = 'announcements'
    id = Column(String(40), nullable=False, primary_key=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    level = Column(String(20), nullable=False)
    audience = Column(String(20), nullable=False)
    published = Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)
    start_at = Column(String(40), nullable=False)
    end_at = Column(String(40), nullable=True)
    updated_at = Column(String(40), nullable=False)


class Banner(Base):
    """首頁輪播（admin/content_service.py）。"""
    __tablename__ = 'banners'
    id = Column(String(40), nullable=False, primary_key=True)
    title = Column(String(255), nullable=False)
    image_url = Column(String(512), nullable=False)
    link_url = Column(String(512), nullable=False)
    audience = Column(String(20), nullable=False, server_default='all')
    sort_order = Column(Integer, nullable=False)
    published = Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)
    start_at = Column(String(40), nullable=False)
    end_at = Column(String(40), nullable=True)
    updated_at = Column(String(40), nullable=False)


class NotificationTemplate(Base):
    """通知模板（admin/content_service.py）。"""
    __tablename__ = 'notification_templates'
    id = Column(String(40), nullable=False, primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(40), nullable=False)
    channels = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    action_url = Column(String(512), nullable=True)
    action_label = Column(String(100), nullable=True)
    enabled = Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)
    updated_at = Column(String(40), nullable=False)


class ContentMeta(Base):
    """內容的雜項狀態，例如示範內容寫過沒有（admin/content_service.py）。"""
    __tablename__ = 'content_meta'
    key = Column(String(64), nullable=False, primary_key=True)
    value = Column(Text, nullable=False)


class AuditEvent(Base):
    """後台稽核紀錄（admin/audit_service.py）。

    跟更早的 admin_audit_logs 不同：那張表沒有程式在用，欄位也對不上現在記的內容。
    """
    __tablename__ = 'audit_events'
    __table_args__ = (Index('idx_audit_events_at', 'at'), Index('idx_audit_events_subject', 'subject'),)
    # SQLite 只有 INTEGER PRIMARY KEY 會自動編號，BIGINT 不會（測試跑在 SQLite）
    id = Column(BigInteger().with_variant(Integer, 'sqlite'), nullable=False, primary_key=True, autoincrement=True)
    at = Column(DECIMAL(20, 6).with_variant(DOUBLE, 'mysql'), nullable=False)
    actor = Column(String(254), nullable=False)
    action = Column(String(100), nullable=False)
    target = Column(String(255), nullable=False)
    detail = Column(Text, nullable=False)
    subject = Column(String(100), nullable=True)
    ip = Column(String(64), nullable=True)


class AdminNotification(Base):
    """管理員通知中心：系統告警與內部備註（admin/admin_notifications.py）。"""
    __tablename__ = 'admin_notifications'
    __table_args__ = (Index('idx_admin_notifications_created', 'created_at'),)
    id = Column(String(40), nullable=False, primary_key=True)
    source = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    action_url = Column(String(512), nullable=True)
    action_label = Column(String(100), nullable=True)
    sender_name = Column(String(100), nullable=True)
    sender_email = Column(String(254), nullable=True)
    created_at = Column(String(40), nullable=False)


class AdminNotificationRead(Base):
    """每位管理員各自的已讀（admin/admin_notifications.py）。"""
    __tablename__ = 'admin_notification_reads'
    notification_id = Column(String(40), nullable=False, primary_key=True)
    admin_id = Column(Integer, nullable=False, primary_key=True)
    read_at = Column(String(40), nullable=False)


class AiDailyUsage(Base):
    """AI 用量：目前只記 OCR 服務用掉的 Google Vision 頁數（admin/ai_usage.py）。"""
    __tablename__ = 'daily_usage'
    date = Column(String(10), nullable=False, primary_key=True)
    provider = Column(String(20), nullable=False, primary_key=True)
    units = Column(Integer, nullable=False)
    calls = Column(Integer, nullable=False)


class AiUsageMeta(Base):
    """額度告警發過沒有，每個門檻每月只通知一次（admin/ai_usage.py）。"""
    __tablename__ = 'usage_meta'
    key = Column(String(100), nullable=False, primary_key=True)
    value = Column(Text, nullable=False)


class AdminRepairNote(Base):
    """後台對報修工單的內部註記與旗標（admin/repair_notes.py）。"""
    __tablename__ = 'repair_notes'
    ticket_id = Column(String(40), nullable=False, primary_key=True)
    value = Column(Text, nullable=False)


# ---------------------------------------------------------------------------
# 通知與監控（2026-10-02 從 SQLite 搬進來，第二批）
#
# 時間欄位有兩種型別，是刻意的：收件匣存 ISO 字串（前端直接吃），排程、監控、
# 垃圾車存 Unix 秒數的浮點數（它們都在算時間差）。搬的時候沒改，改型別就得同時
# 改四個模組的比較與排序邏輯。
#
# Unix 秒數用 Float().with_variant(DOUBLE)：測試跑在 SQLite、正式站跑在 MySQL，
# 只寫 DOUBLE 的話 SQLite 那邊建不起來。
# ---------------------------------------------------------------------------

Seconds = Float().with_variant(DOUBLE, 'mysql')


class InboxMessage(Base):
    """站內通知收件匣：後台寄出的每一封，一個收件人一列（notifications/inbox_service.py）。

    表名是 inbox_messages 而不是 messages：資料庫裡已經有 notifications（租客端
    通知）與 message_boards（室友留言板），再來一張 messages 沒人分得出誰是誰。

    不對 user_id 設外鍵：帳號刪掉時這些寄送紀錄要留著 —— 「有沒有寄給他」是
    稽核問題，不該因為帳號消失就跟著消失。
    """
    __tablename__ = 'inbox_messages'
    __table_args__ = (
        Index('inbox_messages_user', 'user_id', 'created_at'),
        Index('inbox_messages_batch', 'batch_id'),
    )
    id = Column(String(64), nullable=False, primary_key=True)
    batch_id = Column(String(64), nullable=False)
    user_id = Column(Integer, nullable=False)
    user_email = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(32), nullable=False)
    channels = Column(String(255), nullable=False)
    inapp_state = Column(String(32), nullable=True)
    email_state = Column(String(32), nullable=True)
    push_state = Column(String(32), nullable=True)
    recipient_label = Column(String(255), nullable=False)
    source_label = Column(String(255), nullable=False)
    source_type = Column(String(32), nullable=False)
    action_url = Column(String(512), nullable=True)
    action_label = Column(String(255), nullable=True)
    created_by = Column(String(255), nullable=False)
    created_at = Column(String(40), nullable=False)
    read_at = Column(String(40), nullable=True)


class AnnouncementRead(Base):
    """公告已讀。公告不是一人一列寄出的，誰讀過要另外記（inbox_service.py）。"""
    __tablename__ = 'announcement_reads'
    user_id = Column(Integer, nullable=False, primary_key=True)
    announcement_id = Column(String(64), nullable=False, primary_key=True)
    read_at = Column(String(40), nullable=False)


class AnnouncementDismissal(Base):
    """公告關掉不再顯示（inbox_service.py）。"""
    __tablename__ = 'announcement_dismissals'
    user_id = Column(Integer, nullable=False, primary_key=True)
    dismiss_key = Column(String(128), nullable=False, primary_key=True)
    dismissed_at = Column(String(40), nullable=False)


class ScheduledNotification(Base):
    """排程通知：時間到了由後端背景迴圈寄出（notifications/scheduled_notification_service.py）。"""
    __tablename__ = 'scheduled_notifications'
    __table_args__ = (Index('scheduled_notifications_due', 'status', 'due'),)
    id = Column(String(64), nullable=False, primary_key=True)
    created_by = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(32), nullable=False)
    channels = Column(String(255), nullable=False)
    recipient = Column(Text, nullable=False)
    recipient_label = Column(String(255), nullable=False)
    source_label = Column(String(255), nullable=False)
    due = Column(Seconds, nullable=False)
    created_at = Column(Seconds, nullable=False)
    status = Column(String(32), nullable=False)
    sent_at = Column(Seconds, nullable=True)
    result = Column(Text, nullable=True)


class MonitorState(Base):
    """各服務目前的狀態，一個服務一列，只存現況（admin/monitoring_service.py）。"""
    __tablename__ = 'monitor_state'
    service = Column(String(64), nullable=False, primary_key=True)
    status = Column(String(16), nullable=False)
    since = Column(Seconds, nullable=False)
    detail = Column(String(255), nullable=True)
    checked_at = Column(Seconds, nullable=False)


class MonitorEvent(Base):
    """監控事件：只記狀態轉換，不記每一次「正常」（admin/monitoring_service.py）。"""
    __tablename__ = 'monitor_events'
    __table_args__ = (Index('monitor_events_at', 'at'),)
    id = Column(BigInteger().with_variant(Integer, 'sqlite'), nullable=False, primary_key=True, autoincrement=True)
    at = Column(Seconds, nullable=False)
    service = Column(String(64), nullable=False)
    kind = Column(String(32), nullable=False)
    detail = Column(String(255), nullable=True)
    duration = Column(Seconds, nullable=True)


class MonitorMeta(Base):
    """監控的雜項數值：心跳時間、OCR 回報的憑證狀態（admin/monitoring_service.py）。

    `key` 是 MySQL 保留字，SQL 裡一定要用反引號括起來。
    """
    __tablename__ = 'monitor_meta'
    key = Column(String(64), nullable=False, primary_key=True)
    value = Column(Seconds, nullable=False)


class GarbageReminder(Base):
    """垃圾車提醒：使用者自己設的，到時間寄信或推播（notifications/garbage_service.py）。"""
    __tablename__ = 'garbage_reminders'
    __table_args__ = (Index('garbage_reminders_due', 'active', 'due'),)
    id = Column(String(64), nullable=False, primary_key=True)
    user_id = Column(Integer, nullable=False)
    payload = Column(Text, nullable=False)
    due = Column(Seconds, nullable=False)
    active = Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False, default=1)
    email_status = Column(String(32), nullable=False)
    push_status = Column(String(32), nullable=False)
