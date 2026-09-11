import unittest
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant, User
from routers.landlord_tenants import (
    LeaseUpdatePayload,
    TenantPayload,
    _assert_no_overlap,
    _is_effective,
    _lease_display,
    _owned_tenant,
    _resolve_room,
    update_tenant_lease,
)


class LandlordTenantRulesTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.landlord_a = User(email="a@example.com", email_verified_at=None)
        self.landlord_b = User(email="b@example.com", email_verified_at=None)
        self.db.add_all([self.landlord_a, self.landlord_b])
        self.db.flush()
        property_item = LandlordProperty(landlord_id=self.landlord_a.id, name="A 棟")
        self.db.add(property_item)
        self.db.flush()
        self.room = LandlordRoom(property_id=property_item.id, number="101")
        self.tenant = LandlordTenant(landlord_id=self.landlord_a.id, name="測試租客", phone="0912345678")
        self.db.add_all([self.room, self.tenant])
        self.db.flush()
        today = date.today()
        self.lease = LandlordLease(
            tenant_id=self.tenant.id,
            property_id=property_item.id,
            room_id=self.room.id,
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=20),
            monthly_rent=12000,
            deposit_amount=24000,
            payment_day=5,
            status="active",
        )
        self.db.add(self.lease)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_effective_and_expiring_rules(self):
        today = date.today()
        self.assertTrue(_is_effective(self.lease, today))
        self.assertEqual(_lease_display(self.lease, today), "expiring")
        self.lease.status = "terminated"
        self.assertFalse(_is_effective(self.lease, today))
        self.assertEqual(_lease_display(self.lease, today), "moved_out")

    def test_room_overlap_is_rejected(self):
        today = date.today()
        with self.assertRaises(HTTPException) as caught:
            _assert_no_overlap(self.db, self.room.id, today, today + timedelta(days=30))
        self.assertEqual(caught.exception.status_code, 409)

    def test_tenant_id_is_scoped_to_landlord(self):
        found = _owned_tenant(self.db, self.landlord_a.id, self.tenant.id)
        self.assertEqual(found.id, self.tenant.id)
        with self.assertRaises(HTTPException) as caught:
            _owned_tenant(self.db, self.landlord_b.id, self.tenant.id)
        self.assertEqual(caught.exception.status_code, 404)

    def tenant_payload(self, **overrides):
        data = {
            "name": "新租客",
            "phone": "0987654321",
            "property_id": self.room.property_id,
            "room_id": self.room.id,
            "lease_start": date.today() + timedelta(days=40),
            "lease_end": date.today() + timedelta(days=400),
            "monthly_rent": 12000,
            "deposit_amount": 24000,
            "payment_day": 5,
        }
        data.update(overrides)
        return TenantPayload(**data)

    def test_room_must_come_from_landlord_property_data(self):
        property_item, room = _resolve_room(self.db, self.landlord_a.id, self.tenant_payload())
        self.assertEqual(property_item.id, self.room.property_id)
        self.assertEqual(room.id, self.room.id)

        invalid = self.tenant_payload(
            property_id=None,
            room_id=None,
            property_name="不存在的棟別",
            room_number="999",
        )
        with self.assertRaises(HTTPException) as caught:
            _resolve_room(self.db, self.landlord_a.id, invalid)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertIsNone(
            self.db.query(LandlordProperty).filter(LandlordProperty.name == "不存在的棟別").first()
        )

    def test_room_selection_is_scoped_to_landlord(self):
        with self.assertRaises(HTTPException) as caught:
            _resolve_room(self.db, self.landlord_b.id, self.tenant_payload())
        self.assertEqual(caught.exception.status_code, 404)

    def test_contract_workspace_can_update_shared_lease_fields(self):
        today = date.today()
        result = update_tenant_lease(
            self.tenant.id,
            LeaseUpdatePayload(
                lease_start=today - timedelta(days=5),
                lease_end=today + timedelta(days=365),
                monthly_rent=13500,
                deposit_amount=27000,
                payment_day=10,
                payment_frequency="monthly",
                contract_id="CT-SYNC-001",
            ),
            self.db,
            self.landlord_a,
        )

        self.assertEqual(result["monthly_rent"], 13500)
        self.assertEqual(result["deposit_amount"], 27000)
        self.assertEqual(result["payment_day"], 10)
        self.assertEqual(result["contract_id"], "CT-SYNC-001")


if __name__ == "__main__":
    unittest.main()
