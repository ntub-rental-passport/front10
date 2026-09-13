import unittest
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant, User
from routers.tenant_leases import list_tenant_leases


class TenantLeaseScopeTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.landlord = User(email="owner@example.com")
        self.current_user = User(email="tenant@example.com")
        self.other_user = User(email="other@example.com")
        self.db.add_all([self.landlord, self.current_user, self.other_user])
        self.db.flush()
        property_item = LandlordProperty(landlord_id=self.landlord.id, name="測試公寓", address="臺北市測試路 1 號")
        self.db.add(property_item)
        self.db.flush()
        room_a = LandlordRoom(property_id=property_item.id, number="101")
        room_b = LandlordRoom(property_id=property_item.id, number="102")
        tenant_a = LandlordTenant(landlord_id=self.landlord.id, name="目前租客", phone="0911111111", email=self.current_user.email)
        tenant_b = LandlordTenant(landlord_id=self.landlord.id, name="其他租客", phone="0922222222", email=self.other_user.email)
        self.db.add_all([room_a, room_b, tenant_a, tenant_b])
        self.db.flush()
        today = date.today()
        self.db.add_all([
            LandlordLease(tenant_id=tenant_a.id, property_id=property_item.id, room_id=room_a.id, start_date=today - timedelta(days=1), end_date=today + timedelta(days=30), monthly_rent=10000, deposit_amount=20000, payment_day=5, status="active"),
            LandlordLease(tenant_id=tenant_b.id, property_id=property_item.id, room_id=room_b.id, start_date=today - timedelta(days=1), end_date=today + timedelta(days=30), monthly_rent=11000, deposit_amount=22000, payment_day=5, status="active"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_only_authenticated_tenant_email_is_returned(self):
        result = list_tenant_leases(db=self.db, current_user=self.current_user)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["room"], "101")
        self.assertTrue(result["items"][0]["effective"])


if __name__ == "__main__":
    unittest.main()
