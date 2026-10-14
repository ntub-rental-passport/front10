# 資料模型與欄位索引

目前 ORM 共宣告 61 張資料表。

此索引由 `python scripts/generate-tech-docs.py` 靜態產生；不匯入應用程式、不連線資料庫、不讀取 `.env`。請修改來源後重新產生，避免手動修改本檔。

[返回技術文件入口](../README.md)

這是 ORM 宣告索引，不代表部署資料庫已完成遷移。SQL 建表、遷移與 schema 檢查需一併核對。`EncryptedText` 代表加密個資欄位；`relationship` 是 ORM 關聯，不是實體欄位。

## users

ORM：`User`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `email` | `Column(String(254), nullable=False)` |
| `display_name` | `Column(String(100), nullable=True)` |
| `national_id` | `Column(EncryptedText(255), nullable=True)` |
| `avatar_url` | `Column(Text, nullable=True)` |
| `password_hash` | `Column(String(255), nullable=True)` |
| `password_changed_at` | `Column(Timestamp, nullable=True)` |
| `email_verified_at` | `Column(Timestamp, nullable=True)` |
| `status` | `Column(Enum('active', 'suspended', validate_strings=True, create_constraint=True), nullable=False, default='active')` |
| `last_login_at` | `Column(DateTime, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('email', name='uq_users_email'), Index('ix_users_status', 'status'))`

ORM 關聯：

- `roles`：`relationship('UserRole', back_populates='user', cascade='all, delete-orphan', lazy='selectin')`
- `rentals`：`relationship('Rental', back_populates='user', cascade='all, delete-orphan')`
- `notifications`：`relationship('Notification', back_populates='user', cascade='all, delete-orphan')`
- `trash_favorites`：`relationship('TrashFavorite', back_populates='user', cascade='all, delete-orphan')`
- `subsidy_applications`：`relationship('SubsidyApplication', back_populates='user', cascade='all, delete-orphan')`
- `identities`：`relationship('UserIdentity', back_populates='user', cascade='all, delete-orphan')`
- `edited_messages`：`relationship('MessageBoard', back_populates='last_editor')`
- `landlord_properties`：`relationship('LandlordProperty', back_populates='landlord')`
- `landlord_tenants`：`relationship('LandlordTenant', back_populates='landlord')`

## user_roles

ORM：`UserRole`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `user_id` | `Column(Integer, ForeignKey('users.id', name='fk_user_roles_user', ondelete='CASCADE'), primary_key=True, nullable=False)` |
| `role` | `Column(Enum('tenant', 'landlord', 'admin', validate_strings=True, create_constraint=True), primary_key=True, nullable=False)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('ix_user_roles_role', 'role'),)`

ORM 關聯：

- `user`：`relationship('User', back_populates='roles')`

## user_identities

ORM：`UserIdentity`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `provider` | `Column(Enum('google', validate_strings=True, create_constraint=True), nullable=False)` |
| `provider_subject` | `Column(String(255), nullable=False)` |
| `provider_email` | `Column(String(254), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('provider', 'provider_subject', name='uq_identity_provider_subject'),)`

ORM 關聯：

- `user`：`relationship('User', back_populates='identities')`

## pending_registrations

ORM：`PendingRegistration`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(CHAR(36), nullable=False, primary_key=True)` |
| `email` | `Column(String(254), nullable=False)` |
| `provider` | `Column(Enum('password', 'google', validate_strings=True, create_constraint=True), nullable=False)` |
| `provider_subject` | `Column(String(255), nullable=True)` |
| `display_name` | `Column(String(100), nullable=True)` |
| `avatar_url` | `Column(Text, nullable=True)` |
| `password_hash` | `Column(String(255), nullable=True)` |
| `role` | `Column(Enum('tenant', 'landlord', 'admin', validate_strings=True, create_constraint=True), nullable=False)` |
| `verification_code_hash` | `Column(CHAR(64), nullable=False)` |
| `expires_at` | `Column(Timestamp, nullable=False)` |
| `resend_available_at` | `Column(Timestamp, nullable=False)` |
| `attempt_count` | `Column(Integer().with_variant(TINYINT(unsigned=True), 'mysql'), nullable=False, default=0)` |
| `send_count` | `Column(Integer().with_variant(TINYINT(unsigned=True), 'mysql'), nullable=False, default=1)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('email', 'role', name='uq_pending_email_role'), UniqueConstraint('provider', 'provider_subject', 'role', name='uq_pending_provider_subject_role'), Index('idx_pending_expires_at', 'expires_at'))`

## password_reset_challenges

ORM：`PasswordResetChallenge`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(CHAR(36), primary_key=True)` |
| `email` | `Column(String(254), nullable=False, unique=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)` |
| `code_hash` | `Column(CHAR(64), nullable=False)` |
| `credential_hash` | `Column(CHAR(64), nullable=False)` |
| `expires_at` | `Column(Timestamp, nullable=False)` |
| `resend_available_at` | `Column(Timestamp, nullable=False)` |
| `window_started_at` | `Column(Timestamp, nullable=False, index=True)` |
| `attempt_count` | `Column(Integer, nullable=False, default=0)` |
| `send_count` | `Column(Integer, nullable=False, default=0)` |
| `request_ip` | `Column(String(45), nullable=False, index=True)` |
| `consumed` | `Column(Boolean, nullable=False, default=False)` |

## pending_admin_logins

ORM：`PendingAdminLogin`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(36), nullable=False, primary_key=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `email` | `Column(String(254), nullable=False)` |
| `verification_code_hash` | `Column(String(64), nullable=False)` |
| `expires_at` | `Column(DateTime, nullable=False)` |
| `attempt_count` | `Column(Integer, nullable=False, default=0)` |
| `request_ip` | `Column(String(45), nullable=True)` |
| `created_at` | `Column(DateTime, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('ix_pending_admin_logins_email', 'email'), Index('ix_pending_admin_logins_expires_at', 'expires_at'))`

ORM 關聯：

- `user`：`relationship('User')`

## rentals

ORM：`Rental`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `review_date` | `Column(Date, nullable=True)` |
| `review_days` | `Column(Integer, nullable=True, default=3)` |
| `has_landlord_review_signature` | `Column(Boolean, nullable=False, default=False)` |
| `has_tenant_review_signature` | `Column(Boolean, nullable=False, default=False)` |
| `address` | `Column(Text, nullable=False)` |
| `land_number` | `Column(String(100), nullable=True)` |
| `building_number` | `Column(String(100), nullable=True)` |
| `building_area` | `Column(DECIMAL(8, 2), nullable=True)` |
| `tax_id` | `Column(String(100), nullable=True)` |
| `has_annex_building` | `Column(Boolean, nullable=False, default=False)` |
| `annex_building_purpose` | `Column(String(255), nullable=True)` |
| `annex_building_area` | `Column(DECIMAL(8, 2), nullable=True)` |
| `rental_scope` | `Column(Enum('entire', 'partial', validate_strings=True, create_constraint=True), nullable=False, default='entire')` |
| `rental_room` | `Column(String(255), nullable=True)` |
| `rental_area` | `Column(DECIMAL(8, 2), nullable=True)` |
| `has_parking` | `Column(Boolean, nullable=False, default=False)` |
| `car_parking_count` | `Column(Integer, nullable=True)` |
| `car_parking_type` | `Column(String(20), nullable=True)` |
| `car_parking_floor` | `Column(String(30), nullable=True)` |
| `car_parking_number` | `Column(String(50), nullable=True)` |
| `motorcycle_parking_count` | `Column(Integer, nullable=True)` |
| `motorcycle_parking_floor` | `Column(String(30), nullable=True)` |
| `motorcycle_parking_number` | `Column(String(100), nullable=True)` |
| `parking_usage_time` | `Column(String(30), nullable=True)` |
| `has_equipment` | `Column(Boolean, nullable=False, default=False)` |
| `equipment_list` | `Column(Text, nullable=True)` |
| `start_date` | `Column(Date, nullable=False)` |
| `end_date` | `Column(Date, nullable=False)` |
| `handover_date` | `Column(Date, nullable=True)` |
| `rent_amount` | `Column(Integer, nullable=False)` |
| `payment_interval_months` | `Column(Integer, nullable=False, default=1)` |
| `payment_day` | `Column(Integer, nullable=False)` |
| `payment_method` | `Column(String(50), nullable=True, default='轉帳')` |
| `bank_account` | `Column(EncryptedText(512), nullable=True)` |
| `total_periods` | `Column(Integer, nullable=False)` |
| `deposit_months` | `Column(Integer, nullable=False, default=2)` |
| `deposit_amount` | `Column(Integer, nullable=False)` |
| `management_fee_rule` | `Column(String(255), nullable=True)` |
| `water_fee_rule` | `Column(String(255), nullable=True)` |
| `electricity_fee_type` | `Column(String(100), nullable=True)` |
| `electricity_fee_rate` | `Column(String(100), nullable=True)` |
| `gas_fee_rule` | `Column(String(255), nullable=True)` |
| `network_fee_rule` | `Column(String(255), nullable=True)` |
| `other_fees_rule` | `Column(Text, nullable=True)` |
| `abandoned_items_rule` | `Column(Text, nullable=True)` |
| `jurisdiction_court` | `Column(String(100), nullable=True, default='臺灣臺北地方法院')` |
| `landlord_name` | `Column(EncryptedText(255), nullable=True)` |
| `landlord_national_id` | `Column(EncryptedText(255), nullable=True)` |
| `landlord_registered_address` | `Column(EncryptedText(512), nullable=True)` |
| `landlord_contact_address` | `Column(EncryptedText(512), nullable=True)` |
| `landlord_phone` | `Column(EncryptedText(255), nullable=True)` |
| `tenant_name` | `Column(EncryptedText(255), nullable=True)` |
| `tenant_national_id` | `Column(EncryptedText(255), nullable=True)` |
| `tenant_registered_address` | `Column(EncryptedText(512), nullable=True)` |
| `tenant_contact_address` | `Column(EncryptedText(512), nullable=True)` |
| `tenant_phone` | `Column(EncryptedText(255), nullable=True)` |
| `agent_name` | `Column(EncryptedText(255), nullable=True)` |
| `agent_national_id` | `Column(EncryptedText(255), nullable=True)` |
| `authorization_document` | `Column(String(255), nullable=True)` |
| `sublease_consent` | `Column(String(255), nullable=True)` |
| `contract_tag` | `Column(String(30), nullable=True)` |
| `rental_status` | `Column(String(20), nullable=False, default='active')` |
| `confirmed_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(CheckConstraint('payment_day BETWEEN 1 AND 31'), Index('idx_rentals_user_status', 'user_id', 'rental_status'))`

ORM 關聯：

- `user`：`relationship('User', back_populates='rentals')`
- `bills`：`relationship('Bill', back_populates='rental', cascade='all, delete-orphan')`
- `inspection_records`：`relationship('InspectionRecord', back_populates='rental', cascade='all, delete-orphan')`
- `message_boards`：`relationship('MessageBoard', back_populates='rental', cascade='all, delete-orphan')`
- `subsidy_applications`：`relationship('SubsidyApplication', back_populates='rental', cascade='all, delete-orphan')`

## bills

ORM：`Bill`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)` |
| `period_index` | `Column(Integer, nullable=False)` |
| `period_start` | `Column(Date, nullable=False)` |
| `period_end` | `Column(Date, nullable=False)` |
| `due_date` | `Column(Date, nullable=False)` |
| `rent_amount` | `Column(Integer, nullable=False)` |
| `electricity_amount` | `Column(Integer, nullable=True)` |
| `water_amount` | `Column(Integer, nullable=True)` |
| `paid_at` | `Column(Timestamp, nullable=True)` |
| `payment_method` | `Column(Enum('bank-transfer', 'cash', 'line-pay', 'other', validate_strings=True, create_constraint=True), nullable=True)` |
| `payment_note` | `Column(Text, nullable=True)` |
| `payment_proof_url` | `Column(String(512), nullable=True)` |

表級限制：`(UniqueConstraint('rental_id', 'period_index', name='uq_bills_rental_period'), Index('idx_bills_due_unpaid', 'due_date', 'paid_at'))`

ORM 關聯：

- `rental`：`relationship('Rental', back_populates='bills')`

## inspection_items

ORM：`InspectionItem`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, primary_key=True, nullable=False, autoincrement=True)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=True)` |
| `room_name` | `Column(String(100), nullable=False)` |
| `item_name` | `Column(String(100), nullable=False)` |
| `category` | `Column(String(20), nullable=False, default='furniture')` |
| `baseline_record_id` | `Column(Integer, ForeignKey('inspection_records.id', ondelete='SET NULL'), nullable=True, unique=True)` |
| `checkout_record_id` | `Column(Integer, ForeignKey('inspection_records.id', ondelete='SET NULL'), nullable=True, unique=True)` |
| `comparison_result` | `Column(JSON, nullable=True)` |
| `version` | `Column(Integer, nullable=False, default=0)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_inspection_items_rental', 'rental_id'), Index('idx_inspection_items_lease', 'lease_id'))`

ORM 關聯：

- `baseline`：`relationship('InspectionRecord', foreign_keys=[baseline_record_id])`
- `checkout`：`relationship('InspectionRecord', foreign_keys=[checkout_record_id])`

## inspection_records

ORM：`InspectionRecord`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=True)` |
| `type` | `Column(Enum('check_in', 'check_out', validate_strings=True, create_constraint=True), nullable=False)` |
| `photo_url` | `Column(String(512), nullable=False)` |
| `capture_source` | `Column(Enum('camera', 'file', validate_strings=True, create_constraint=True), nullable=False, default='file')` |
| `capture_quality` | `Column(JSON, nullable=True)` |
| `item_name` | `Column(String(100), nullable=True)` |
| `room_name` | `Column(String(100), nullable=True)` |
| `vlm_result` | `Column(JSON, nullable=True)` |
| `user_note` | `Column(Text, nullable=True)` |
| `captured_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_inspection_rental_type', 'rental_id', 'type'), Index('idx_inspection_records_lease', 'lease_id'))`

ORM 關聯：

- `rental`：`relationship('Rental', back_populates='inspection_records')`

## message_boards

ORM：`MessageBoard`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)` |
| `content` | `Column(Text, nullable=False)` |
| `last_editor_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

ORM 關聯：

- `rental`：`relationship('Rental', back_populates='message_boards')`
- `last_editor`：`relationship('User', back_populates='edited_messages')`

## landlord_properties

ORM：`LandlordProperty`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `name` | `Column(String(100), nullable=False)` |
| `address` | `Column(Text, nullable=True)` |
| `city` | `Column(String(50), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('landlord_id', 'name', name='uq_landlord_property_name'), Index('idx_landlord_properties_landlord', 'landlord_id'))`

ORM 關聯：

- `landlord`：`relationship('User', back_populates='landlord_properties')`
- `rooms`：`relationship('LandlordRoom', back_populates='property', cascade='all, delete-orphan')`

## landlord_rooms

ORM：`LandlordRoom`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `property_id` | `Column(Integer, ForeignKey('landlord_properties.id', ondelete='CASCADE'), nullable=False)` |
| `number` | `Column(String(50), nullable=False)` |
| `status` | `Column(Enum('vacant', 'occupied', 'turnover', 'maintenance', validate_strings=True, create_constraint=True), nullable=False, default='vacant')` |
| `floor` | `Column(Integer, nullable=True)` |
| `area` | `Column(DECIMAL(8, 2), nullable=True)` |
| `expected_rent` | `Column(Integer, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('property_id', 'number', name='uq_landlord_room_number'), Index('idx_landlord_rooms_property', 'property_id'))`

ORM 關聯：

- `property`：`relationship('LandlordProperty', back_populates='rooms')`
- `leases`：`relationship('LandlordLease', back_populates='room')`

## landlord_tenants

ORM：`LandlordTenant`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `name` | `Column(String(100), nullable=False)` |
| `email` | `Column(String(254), nullable=True)` |
| `birth_date` | `Column(Date, nullable=True)` |
| `emergency_name` | `Column(String(100), nullable=True)` |
| `notes` | `Column(Text, nullable=True)` |
| `line_user_id` | `Column(String(255), nullable=True)` |
| `line_status` | `Column(Enum('unbound', 'invited', 'bound', 'expired', validate_strings=True, create_constraint=True), nullable=False, default='unbound')` |
| `line_invited_at` | `Column(Timestamp, nullable=True)` |
| `line_bound_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |
| `deleted_at` | `Column(Timestamp, nullable=True)` |

表級限制：`(Index('idx_landlord_tenants_landlord', 'landlord_id'),)`

ORM 關聯：

- `landlord`：`relationship('User', back_populates='landlord_tenants')`
- `leases`：`relationship('LandlordLease', back_populates='tenant')`
- `activities`：`relationship('LandlordTenantActivity', back_populates='tenant', cascade='all, delete-orphan')`

## landlord_leases

ORM：`LandlordLease`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `tenant_id` | `Column(Integer, ForeignKey('landlord_tenants.id', ondelete='RESTRICT'), nullable=False)` |
| `property_id` | `Column(Integer, ForeignKey('landlord_properties.id', ondelete='RESTRICT'), nullable=False)` |
| `room_id` | `Column(Integer, ForeignKey('landlord_rooms.id', ondelete='RESTRICT'), nullable=False)` |
| `start_date` | `Column(Date, nullable=False)` |
| `end_date` | `Column(Date, nullable=False)` |
| `monthly_rent` | `Column(Integer, nullable=False)` |
| `deposit_amount` | `Column(Integer, nullable=False)` |
| `payment_day` | `Column(Integer().with_variant(TINYINT(unsigned=True), 'mysql'), nullable=False)` |
| `payment_frequency` | `Column(String(30), nullable=False, default='monthly')` |
| `contract_id` | `Column(String(100), nullable=True)` |
| `status` | `Column(Enum('pending', 'active', 'ended', 'terminated', validate_strings=True, create_constraint=True), nullable=False, default='active')` |
| `moved_out_at` | `Column(Date, nullable=True)` |
| `tenant_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `tenant_bound_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_leases_tenant', 'tenant_id'), Index('idx_landlord_leases_room_period', 'room_id', 'start_date', 'end_date', 'status'))`

ORM 關聯：

- `tenant`：`relationship('LandlordTenant', back_populates='leases')`
- `files`：`relationship('LandlordLeaseFile', back_populates='lease', cascade='all, delete-orphan', order_by='LandlordLeaseFile.id')`
- `property`：`relationship('LandlordProperty')`
- `room`：`relationship('LandlordRoom', back_populates='leases')`
- `move_out`：`relationship('LandlordMoveOut', back_populates='lease', uselist=False)`

## landlord_move_outs

ORM：`LandlordMoveOut`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='RESTRICT'), nullable=False, unique=True)` |
| `move_out_date` | `Column(Date, nullable=False)` |
| `reason` | `Column(Text, nullable=True)` |
| `final_rent` | `Column(Integer, nullable=False, default=0)` |
| `utility_fee` | `Column(Integer, nullable=False, default=0)` |
| `deposit_refund` | `Column(Integer, nullable=False, default=0)` |
| `deposit_deduction` | `Column(Integer, nullable=False, default=0)` |
| `deduction_reason` | `Column(Text, nullable=True)` |
| `inspection_status` | `Column(String(30), nullable=False, default='pending')` |
| `notes` | `Column(Text, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

ORM 關聯：

- `lease`：`relationship('LandlordLease', back_populates='move_out')`

## landlord_tenant_activities

ORM：`LandlordTenantActivity`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `tenant_id` | `Column(Integer, ForeignKey('landlord_tenants.id', ondelete='CASCADE'), nullable=False)` |
| `kind` | `Column(String(50), nullable=False)` |
| `detail` | `Column(Text, nullable=False)` |
| `occurred_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_tenant_activities_tenant', 'tenant_id', 'occurred_at'),)`

ORM 關聯：

- `tenant`：`relationship('LandlordTenant', back_populates='activities')`

## landlord_lease_files

ORM：`LandlordLeaseFile`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=False)` |
| `stored_name` | `Column(String(64), nullable=False)` |
| `original_name` | `Column(String(255), nullable=False)` |
| `content_type` | `Column(String(100), nullable=False)` |
| `size_bytes` | `Column(Integer, nullable=False)` |
| `uploaded_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `uploaded_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_lease_files_lease', 'lease_id'),)`

ORM 關聯：

- `lease`：`relationship('LandlordLease', back_populates='files')`

## landlord_charges

ORM：`LandlordCharge`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='RESTRICT'), nullable=False)` |
| `kind` | `Column(Enum('rent', 'water', 'electricity', 'other', validate_strings=True, create_constraint=True), nullable=False, default='rent')` |
| `title` | `Column(String(100), nullable=False)` |
| `period_start` | `Column(Date, nullable=False)` |
| `period_end` | `Column(Date, nullable=False)` |
| `due_date` | `Column(Date, nullable=False)` |
| `amount` | `Column(Integer, nullable=False)` |
| `voided_at` | `Column(Timestamp, nullable=True)` |
| `void_reason` | `Column(Text, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('lease_id', 'kind', 'period_start', name='uq_landlord_charge_period'), Index('idx_landlord_charges_landlord_due', 'landlord_id', 'due_date'))`

ORM 關聯：

- `lease`：`relationship('LandlordLease')`
- `payments`：`relationship('LandlordChargePayment', back_populates='charge', cascade='all, delete-orphan', order_by='LandlordChargePayment.id')`
- `events`：`relationship('LandlordChargeEvent', back_populates='charge', cascade='all, delete-orphan', order_by='LandlordChargeEvent.id')`

## landlord_charge_payments

ORM：`LandlordChargePayment`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `charge_id` | `Column(Integer, ForeignKey('landlord_charges.id', ondelete='CASCADE'), nullable=False)` |
| `amount` | `Column(Integer, nullable=False)` |
| `paid_on` | `Column(Date, nullable=False)` |
| `method` | `Column(String(30), nullable=False, default='other')` |
| `note` | `Column(Text, nullable=True)` |
| `recorded_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_charge_payments_charge', 'charge_id'),)`

ORM 關聯：

- `charge`：`relationship('LandlordCharge', back_populates='payments')`

## landlord_charge_events

ORM：`LandlordChargeEvent`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `charge_id` | `Column(Integer, ForeignKey('landlord_charges.id', ondelete='CASCADE'), nullable=False)` |
| `kind` | `Column(String(30), nullable=False)` |
| `detail` | `Column(Text, nullable=False)` |
| `actor_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_charge_events_charge', 'charge_id'),)`

ORM 關聯：

- `charge`：`relationship('LandlordCharge', back_populates='events')`

## landlord_expenses

ORM：`LandlordExpense`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `title` | `Column(String(100), nullable=False)` |
| `category` | `Column(String(30), nullable=False)` |
| `amount` | `Column(Integer, nullable=False)` |
| `spent_on` | `Column(Date, nullable=False)` |
| `property_id` | `Column(Integer, ForeignKey('landlord_properties.id', ondelete='SET NULL'), nullable=True)` |
| `repair_ticket_id` | `Column(Integer, ForeignKey('repair_tickets.id', ondelete='SET NULL'), nullable=True)` |
| `note` | `Column(Text, nullable=True)` |
| `recorded_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_expenses_landlord_date', 'landlord_id', 'spent_on'),)`

## lease_invitations

ORM：`LeaseInvitation`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='CASCADE'), nullable=False)` |
| `invited_email` | `Column(String(254), nullable=True)` |
| `token_hash` | `Column(CHAR(64), nullable=False)` |
| `code_hash` | `Column(CHAR(64), nullable=False)` |
| `status` | `Column(Enum('pending', 'accepted', 'revoked', validate_strings=True, create_constraint=True), nullable=False, default='pending')` |
| `expires_at` | `Column(Timestamp, nullable=False)` |
| `accepted_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `accepted_at` | `Column(Timestamp, nullable=True)` |
| `revoked_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('token_hash', name='uq_lease_invitations_token'), UniqueConstraint('code_hash', name='uq_lease_invitations_code'), Index('idx_lease_invitations_lease', 'lease_id', 'status'))`

ORM 關聯：

- `lease`：`relationship('LandlordLease')`

## landlord_settings

ORM：`LandlordSettings`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, primary_key=True)` |
| `phone` | `Column(EncryptedText(255), nullable=True)` |
| `workspace_name` | `Column(String(100), nullable=True)` |
| `email_notifications` | `Column(Boolean, nullable=False, default=True)` |
| `rent_reminders` | `Column(Boolean, nullable=False, default=True)` |
| `contract_reminders` | `Column(Boolean, nullable=False, default=True)` |
| `repair_notifications` | `Column(Boolean, nullable=False, default=True)` |
| `reminder_days` | `Column(Integer, nullable=False, default=30)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

## landlord_audit_events

ORM：`LandlordAuditEvent`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `landlord_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `actor_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `category` | `Column(String(30), nullable=False)` |
| `title` | `Column(String(200), nullable=False)` |
| `detail` | `Column(Text, nullable=True)` |
| `result` | `Column(Enum('success', 'warning', validate_strings=True, create_constraint=True), nullable=False, default='success')` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_landlord_audit_events_landlord', 'landlord_id', 'created_at'),)`

## landlord_team_members

ORM：`LandlordTeamMember`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `owner_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `email` | `Column(String(254), nullable=False)` |
| `role` | `Column(Enum('manager', 'accounting', 'viewer', validate_strings=True, create_constraint=True), nullable=False, default='viewer')` |
| `status` | `Column(Enum('pending', 'active', 'revoked', validate_strings=True, create_constraint=True), nullable=False, default='pending')` |
| `member_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `token_hash` | `Column(CHAR(64), nullable=True)` |
| `expires_at` | `Column(Timestamp, nullable=True)` |
| `invited_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `accepted_at` | `Column(Timestamp, nullable=True)` |
| `revoked_at` | `Column(Timestamp, nullable=True)` |

表級限制：`(UniqueConstraint('owner_id', 'email', name='uq_landlord_team_member_email'), UniqueConstraint('token_hash', name='uq_landlord_team_member_token'), Index('idx_landlord_team_members_member', 'member_user_id', 'status'))`

## repair_tickets

ORM：`RepairTicket`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `tenant_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=True)` |
| `lease_id` | `Column(Integer, ForeignKey('landlord_leases.id', ondelete='SET NULL'), nullable=True)` |
| `location` | `Column(String(100), nullable=True)` |
| `equipment` | `Column(String(100), nullable=True)` |
| `description` | `Column(Text, nullable=False)` |
| `phone` | `Column(EncryptedText(255), nullable=True)` |
| `urgency` | `Column(Enum('emergency', 'soon', 'normal', validate_strings=True, create_constraint=True), nullable=False, default='normal')` |
| `available_time` | `Column(Text, nullable=True)` |
| `access_permission` | `Column(Enum('present', 'absent', 'contact-first', validate_strings=True, create_constraint=True), nullable=False, default='contact-first')` |
| `contact_before_arrival` | `Column(Boolean, nullable=False, default=False)` |
| `status` | `Column(Enum('pending', 'processing', 'inspection', 'completed', 'canceled', validate_strings=True, create_constraint=True), nullable=False, default='pending')` |
| `landlord_read_at` | `Column(Timestamp, nullable=True)` |
| `responsibility` | `Column(Enum('pending', 'landlord', 'tenant', 'shared', validate_strings=True, create_constraint=True), nullable=False, default='pending')` |
| `responsibility_note` | `Column(Text, nullable=True)` |
| `responsibility_agreement` | `Column(String(20), nullable=True)` |
| `responsibility_question` | `Column(Text, nullable=True)` |
| `supplement_requested` | `Column(Boolean, nullable=False, default=False)` |
| `supplement_request_note` | `Column(Text, nullable=True)` |
| `vendor_name` | `Column(String(100), nullable=True)` |
| `vendor_phone` | `Column(String(30), nullable=True)` |
| `scheduled_at` | `Column(Timestamp, nullable=True)` |
| `tenant_schedule_reply` | `Column(String(20), nullable=True)` |
| `reschedule_request` | `Column(JSON, nullable=True)` |
| `estimated_cost` | `Column(Integer, nullable=True)` |
| `actual_cost` | `Column(Integer, nullable=True)` |
| `payer` | `Column(String(50), nullable=True)` |
| `completion_note` | `Column(Text, nullable=True)` |
| `inspection_result` | `Column(String(20), nullable=True)` |
| `unresolved_note` | `Column(Text, nullable=True)` |
| `unresolved_safety_concern` | `Column(Boolean, nullable=False, default=False)` |
| `revisit_available_time` | `Column(Text, nullable=True)` |
| `completed_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_repair_tickets_rental_status', 'rental_id', 'status'), Index('idx_repair_tickets_lease_status', 'lease_id', 'status'), Index('idx_repair_tickets_lease_unread', 'lease_id', 'landlord_read_at'))`

ORM 關聯：

- `events`：`relationship('RepairTicketEvent', back_populates='ticket', cascade='all, delete-orphan', order_by='RepairTicketEvent.id')`
- `photos`：`relationship('RepairTicketPhoto', back_populates='ticket', cascade='all, delete-orphan', order_by='RepairTicketPhoto.id')`

## repair_ticket_events

ORM：`RepairTicketEvent`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `ticket_id` | `Column(Integer, ForeignKey('repair_tickets.id', ondelete='CASCADE'), nullable=False)` |
| `actor_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `actor_role` | `Column(Enum('tenant', 'landlord', 'system', validate_strings=True, create_constraint=True), nullable=False, default='system')` |
| `kind` | `Column(String(30), nullable=False, default='note')` |
| `title` | `Column(String(200), nullable=False)` |
| `detail` | `Column(Text, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_repair_events_ticket', 'ticket_id'),)`

ORM 關聯：

- `ticket`：`relationship('RepairTicket', back_populates='events')`

## repair_ticket_photos

ORM：`RepairTicketPhoto`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `ticket_id` | `Column(Integer, ForeignKey('repair_tickets.id', ondelete='CASCADE'), nullable=False)` |
| `event_id` | `Column(Integer, ForeignKey('repair_ticket_events.id', ondelete='SET NULL'), nullable=True)` |
| `stage` | `Column(Enum('report', 'supplement', 'completion', 'unresolved', 'receipt', validate_strings=True, create_constraint=True), nullable=False, default='report')` |
| `uploaded_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |
| `photo_url` | `Column(String(512), nullable=False)` |
| `photo_name` | `Column(String(255), nullable=True)` |
| `uploaded_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_repair_photos_ticket', 'ticket_id'),)`

ORM 關聯：

- `ticket`：`relationship('RepairTicket', back_populates='photos')`

## personal_notes

ORM：`Note`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `title` | `Column(String(200), nullable=False)` |
| `content` | `Column(Text, nullable=True)` |
| `tag` | `Column(Enum('租務', '提醒', '維護', '採買', validate_strings=True, create_constraint=True), nullable=False, default='租務')` |
| `due_date` | `Column(Date, nullable=True)` |
| `due_time` | `Column(Time, nullable=True)` |
| `done` | `Column(Boolean, nullable=False, default=False)` |
| `done_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_personal_notes_user_due', 'user_id', 'due_date', 'done'),)`

ORM 關聯：

- `user`：`relationship('User')`

## households

ORM：`Household`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `name` | `Column(String(100), nullable=False)` |
| `invite_code` | `Column(String(20), nullable=False, unique=True)` |
| `created_by` | `Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

## household_members

ORM：`HouseholdMember`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `household_id` | `Column(Integer, ForeignKey('households.id', ondelete='CASCADE'), nullable=False)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `display_name` | `Column(String(100), nullable=False)` |
| `role` | `Column(String(50), nullable=True)` |
| `accent` | `Column(Enum('indigo', 'emerald', 'amber', 'rose', validate_strings=True, create_constraint=True), nullable=False, default='indigo')` |
| `joined_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(UniqueConstraint('household_id', 'user_id', name='uq_household_member'),)`

## roommate_tasks

ORM：`HouseholdTask`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `household_id` | `Column(Integer, ForeignKey('households.id', ondelete='CASCADE'), nullable=False)` |
| `creator_member_id` | `Column(Integer, ForeignKey('household_members.id', ondelete='SET NULL'), nullable=True)` |
| `assignee_member_id` | `Column(Integer, ForeignKey('household_members.id', ondelete='SET NULL'), nullable=True)` |
| `title` | `Column(String(200), nullable=False)` |
| `content` | `Column(Text, nullable=True)` |
| `tag` | `Column(Enum('公共區域', '清潔', '帳務', '採買', validate_strings=True, create_constraint=True), nullable=False, default='公共區域')` |
| `due_date` | `Column(Date, nullable=True)` |
| `due_time` | `Column(Time, nullable=True)` |
| `done` | `Column(Boolean, nullable=False, default=False)` |
| `done_at` | `Column(Timestamp, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_roommate_tasks_household_done', 'household_id', 'done', 'due_date'),)`

## notifications

ORM：`Notification`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `category` | `Column(Enum('payment', 'trash', 'inspection', 'contract_end', 'utility_outage', 'repair', 'subsidy', validate_strings=True, create_constraint=True), nullable=False)` |
| `content` | `Column(Text, nullable=False)` |
| `remind_at` | `Column(Timestamp, nullable=False)` |
| `is_sent` | `Column(Boolean, nullable=False, default=False)` |

表級限制：`(Index('idx_notifications_pending', 'is_sent', 'remind_at'),)`

ORM 關聯：

- `user`：`relationship('User', back_populates='notifications')`

## trash_favorites

ORM：`TrashFavorite`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `station_id` | `Column(String(50), nullable=False)` |
| `station_name` | `Column(String(255), nullable=False)` |

表級限制：`(UniqueConstraint('user_id', 'station_id', name='uq_trash_favorites_user_station'),)`

ORM 關聯：

- `user`：`relationship('User', back_populates='trash_favorites')`

## subsidy_applications

ORM：`SubsidyApplication`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `rental_id` | `Column(Integer, ForeignKey('rentals.id', ondelete='CASCADE'), nullable=False)` |
| `application_type` | `Column(Enum('housing', 'rent_subsidy', 'recovery', validate_strings=True, create_constraint=True), nullable=False, default='rent_subsidy')` |
| `application_status` | `Column(String(50), nullable=False, default='draft')` |
| `submitted_at` | `Column(Timestamp, nullable=True)` |
| `decided_at` | `Column(Timestamp, nullable=True)` |
| `rejection_reason` | `Column(Text, nullable=True)` |
| `remark` | `Column(Text, nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |

ORM 關聯：

- `user`：`relationship('User', back_populates='subsidy_applications')`
- `rental`：`relationship('Rental', back_populates='subsidy_applications')`

## subsidy_documents

ORM：`SubsidyDocument`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(Integer, nullable=False, primary_key=True, autoincrement=True)` |
| `application_id` | `Column(Integer, ForeignKey('subsidy_applications.id', ondelete='CASCADE'), nullable=False)` |
| `doc_type` | `Column(String(50), nullable=False)` |
| `file_url` | `Column(String(512), nullable=False)` |
| `original_filename` | `Column(String(255), nullable=True)` |
| `uploaded_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_subsidy_docs_application', 'application_id'),)`

## admin_settings

ORM：`AdminSetting`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `setting_key` | `Column(String(100), nullable=False, primary_key=True)` |
| `value` | `Column(JSON, nullable=False)` |
| `updated_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)` |
| `updated_by` | `Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)` |

## admin_audit_logs

ORM：`AdminAuditLog`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(BigInteger().with_variant(Integer, 'sqlite'), nullable=False, primary_key=True, autoincrement=True)` |
| `actor_user_id` | `Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)` |
| `action` | `Column(String(100), nullable=False)` |
| `target_type` | `Column(String(50), nullable=True)` |
| `target_id` | `Column(String(100), nullable=True)` |
| `detail` | `Column(JSON, nullable=True)` |
| `ip` | `Column(String(45), nullable=True)` |
| `created_at` | `Column(Timestamp, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('idx_audit_actor_time', 'actor_user_id', 'created_at'), Index('idx_audit_target', 'target_type', 'target_id'))`

## admin_sessions

ORM：`AdminSession`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(36), nullable=False, primary_key=True)` |
| `user_id` | `Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)` |
| `created_at` | `Column(DateTime, nullable=False, default=datetime.datetime.utcnow)` |
| `last_active_at` | `Column(DateTime, nullable=False, default=datetime.datetime.utcnow)` |

表級限制：`(Index('ix_admin_sessions_user_id', 'user_id'),)`

## site_settings

ORM：`SiteSetting`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `key` | `Column(String(64), nullable=False, primary_key=True)` |
| `value` | `Column(Text, nullable=False)` |

## feature_outages

ORM：`FeatureOutage`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `feature_key` | `Column(String(64), nullable=False, primary_key=True)` |
| `internal_reason` | `Column(Text, nullable=False)` |
| `public_note` | `Column(Text, nullable=False)` |
| `closed_at` | `Column(String(40), nullable=False)` |
| `eta_at` | `Column(String(40), nullable=True)` |

## platform_settings

ORM：`PlatformSetting`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `key` | `Column(String(64), nullable=False, primary_key=True)` |
| `value` | `Column(Integer, nullable=False)` |

## announcements

ORM：`Announcement`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(40), nullable=False, primary_key=True)` |
| `title` | `Column(String(255), nullable=False)` |
| `body` | `Column(Text, nullable=False)` |
| `level` | `Column(String(20), nullable=False)` |
| `audience` | `Column(String(20), nullable=False)` |
| `published` | `Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)` |
| `start_at` | `Column(String(40), nullable=False)` |
| `end_at` | `Column(String(40), nullable=True)` |
| `updated_at` | `Column(String(40), nullable=False)` |

## banners

ORM：`Banner`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(40), nullable=False, primary_key=True)` |
| `title` | `Column(String(255), nullable=False)` |
| `image_url` | `Column(String(512), nullable=False)` |
| `link_url` | `Column(String(512), nullable=False)` |
| `audience` | `Column(String(20), nullable=False, server_default='all')` |
| `sort_order` | `Column(Integer, nullable=False)` |
| `published` | `Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)` |
| `start_at` | `Column(String(40), nullable=False)` |
| `end_at` | `Column(String(40), nullable=True)` |
| `updated_at` | `Column(String(40), nullable=False)` |

## notification_templates

ORM：`NotificationTemplate`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(40), nullable=False, primary_key=True)` |
| `name` | `Column(String(255), nullable=False)` |
| `category` | `Column(String(40), nullable=False)` |
| `channels` | `Column(String(255), nullable=False)` |
| `title` | `Column(String(255), nullable=False)` |
| `body` | `Column(Text, nullable=False)` |
| `action_url` | `Column(String(512), nullable=True)` |
| `action_label` | `Column(String(100), nullable=True)` |
| `enabled` | `Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False)` |
| `updated_at` | `Column(String(40), nullable=False)` |

## content_meta

ORM：`ContentMeta`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `key` | `Column(String(64), nullable=False, primary_key=True)` |
| `value` | `Column(Text, nullable=False)` |

## audit_events

ORM：`AuditEvent`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(BigInteger().with_variant(Integer, 'sqlite'), nullable=False, primary_key=True, autoincrement=True)` |
| `at` | `Column(DECIMAL(20, 6).with_variant(DOUBLE, 'mysql'), nullable=False)` |
| `actor` | `Column(String(254), nullable=False)` |
| `action` | `Column(String(100), nullable=False)` |
| `target` | `Column(String(255), nullable=False)` |
| `detail` | `Column(Text, nullable=False)` |
| `subject` | `Column(String(100), nullable=True)` |
| `ip` | `Column(String(64), nullable=True)` |

表級限制：`(Index('idx_audit_events_at', 'at'), Index('idx_audit_events_subject', 'subject'))`

## admin_notifications

ORM：`AdminNotification`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(40), nullable=False, primary_key=True)` |
| `source` | `Column(String(20), nullable=False)` |
| `title` | `Column(String(255), nullable=False)` |
| `body` | `Column(Text, nullable=False)` |
| `action_url` | `Column(String(512), nullable=True)` |
| `action_label` | `Column(String(100), nullable=True)` |
| `sender_name` | `Column(String(100), nullable=True)` |
| `sender_email` | `Column(String(254), nullable=True)` |
| `created_at` | `Column(String(40), nullable=False)` |

表級限制：`(Index('idx_admin_notifications_created', 'created_at'),)`

## admin_notification_reads

ORM：`AdminNotificationRead`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `notification_id` | `Column(String(40), nullable=False, primary_key=True)` |
| `admin_id` | `Column(Integer, nullable=False, primary_key=True)` |
| `read_at` | `Column(String(40), nullable=False)` |

## daily_usage

ORM：`AiDailyUsage`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `date` | `Column(String(10), nullable=False, primary_key=True)` |
| `provider` | `Column(String(20), nullable=False, primary_key=True)` |
| `units` | `Column(Integer, nullable=False)` |
| `calls` | `Column(Integer, nullable=False)` |

## usage_meta

ORM：`AiUsageMeta`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `key` | `Column(String(100), nullable=False, primary_key=True)` |
| `value` | `Column(Text, nullable=False)` |

## repair_notes

ORM：`AdminRepairNote`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `ticket_id` | `Column(String(40), nullable=False, primary_key=True)` |
| `value` | `Column(Text, nullable=False)` |

## inbox_messages

ORM：`InboxMessage`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(64), nullable=False, primary_key=True)` |
| `batch_id` | `Column(String(64), nullable=False)` |
| `user_id` | `Column(Integer, nullable=False)` |
| `user_email` | `Column(String(255), nullable=False)` |
| `title` | `Column(String(255), nullable=False)` |
| `body` | `Column(Text, nullable=False)` |
| `category` | `Column(String(32), nullable=False)` |
| `channels` | `Column(String(255), nullable=False)` |
| `inapp_state` | `Column(String(32), nullable=True)` |
| `email_state` | `Column(String(32), nullable=True)` |
| `push_state` | `Column(String(32), nullable=True)` |
| `recipient_label` | `Column(String(255), nullable=False)` |
| `source_label` | `Column(String(255), nullable=False)` |
| `source_type` | `Column(String(32), nullable=False)` |
| `action_url` | `Column(String(512), nullable=True)` |
| `action_label` | `Column(String(255), nullable=True)` |
| `created_by` | `Column(String(255), nullable=False)` |
| `created_at` | `Column(String(40), nullable=False)` |
| `read_at` | `Column(String(40), nullable=True)` |

表級限制：`(Index('inbox_messages_user', 'user_id', 'created_at'), Index('inbox_messages_batch', 'batch_id'))`

## announcement_reads

ORM：`AnnouncementRead`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `user_id` | `Column(Integer, nullable=False, primary_key=True)` |
| `announcement_id` | `Column(String(64), nullable=False, primary_key=True)` |
| `read_at` | `Column(String(40), nullable=False)` |

## announcement_dismissals

ORM：`AnnouncementDismissal`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `user_id` | `Column(Integer, nullable=False, primary_key=True)` |
| `dismiss_key` | `Column(String(128), nullable=False, primary_key=True)` |
| `dismissed_at` | `Column(String(40), nullable=False)` |

## scheduled_notifications

ORM：`ScheduledNotification`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(64), nullable=False, primary_key=True)` |
| `created_by` | `Column(String(255), nullable=False)` |
| `title` | `Column(String(255), nullable=False)` |
| `body` | `Column(Text, nullable=False)` |
| `category` | `Column(String(32), nullable=False)` |
| `channels` | `Column(String(255), nullable=False)` |
| `recipient` | `Column(Text, nullable=False)` |
| `recipient_label` | `Column(String(255), nullable=False)` |
| `source_label` | `Column(String(255), nullable=False)` |
| `due` | `Column(Seconds, nullable=False)` |
| `created_at` | `Column(Seconds, nullable=False)` |
| `status` | `Column(String(32), nullable=False)` |
| `sent_at` | `Column(Seconds, nullable=True)` |
| `result` | `Column(Text, nullable=True)` |

表級限制：`(Index('scheduled_notifications_due', 'status', 'due'),)`

## monitor_state

ORM：`MonitorState`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `service` | `Column(String(64), nullable=False, primary_key=True)` |
| `status` | `Column(String(16), nullable=False)` |
| `since` | `Column(Seconds, nullable=False)` |
| `detail` | `Column(String(255), nullable=True)` |
| `checked_at` | `Column(Seconds, nullable=False)` |

## monitor_events

ORM：`MonitorEvent`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(BigInteger().with_variant(Integer, 'sqlite'), nullable=False, primary_key=True, autoincrement=True)` |
| `at` | `Column(Seconds, nullable=False)` |
| `service` | `Column(String(64), nullable=False)` |
| `kind` | `Column(String(32), nullable=False)` |
| `detail` | `Column(String(255), nullable=True)` |
| `duration` | `Column(Seconds, nullable=True)` |

表級限制：`(Index('monitor_events_at', 'at'),)`

## monitor_meta

ORM：`MonitorMeta`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `key` | `Column(String(64), nullable=False, primary_key=True)` |
| `value` | `Column(Seconds, nullable=False)` |

## garbage_reminders

ORM：`GarbageReminder`；來源：[backend/db/models.py](../../backend/db/models.py)

| 欄位 | 宣告（型別、外鍵與限制） |
| --- | --- |
| `id` | `Column(String(64), nullable=False, primary_key=True)` |
| `user_id` | `Column(Integer, nullable=False)` |
| `payload` | `Column(Text, nullable=False)` |
| `due` | `Column(Seconds, nullable=False)` |
| `active` | `Column(Integer().with_variant(TINYINT(1), 'mysql'), nullable=False, default=1)` |
| `email_status` | `Column(String(32), nullable=False)` |
| `push_status` | `Column(String(32), nullable=False)` |

表級限制：`(Index('garbage_reminders_due', 'active', 'due'),)`

