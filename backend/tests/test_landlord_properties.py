import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import LandlordProperty, User
from routers.landlord_properties import (
    PropertyPayload,
    RoomBatchPayload,
    _owned_property,
    create_property,
    create_rooms,
    delete_property,
    list_properties,
)
from routers.landlord_tenants import tenant_options


class LandlordPropertyRulesTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.landlord_a = User(email="owner-a@example.com", email_verified_at=None)
        self.landlord_b = User(email="owner-b@example.com", email_verified_at=None)
        self.db.add_all([self.landlord_a, self.landlord_b])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_property_and_rooms_are_persisted_and_shared_with_tenant_options(self):
        property_item = create_property(
            PropertyPayload(name="松庭公寓", city="臺北市", address="南京東路 123 號"),
            self.db,
            self.landlord_a,
        )
        result = create_rooms(
            property_item["id"],
            RoomBatchPayload(numbers=["101", "102"], floor=1, area=8.5, expected_rent=12000),
            self.db,
            self.landlord_a,
        )

        self.assertEqual(len(result["rooms"]), 2)
        self.assertEqual(result["rooms"][0]["rent"], 12000)
        listed = list_properties(self.db, self.landlord_a)
        self.assertEqual(listed["items"][0]["name"], "松庭公寓")
        options = tenant_options(self.db, self.landlord_a)
        self.assertEqual(options["properties"][0]["rooms"][0]["number"], "101")

    def test_duplicate_property_and_room_are_rejected(self):
        property_item = create_property(
            PropertyPayload(name="同名棟別"), self.db, self.landlord_a
        )
        with self.assertRaises(HTTPException) as property_error:
            create_property(PropertyPayload(name="同名棟別"), self.db, self.landlord_a)
        self.assertEqual(property_error.exception.status_code, 409)

        create_rooms(
            property_item["id"], RoomBatchPayload(numbers=["A1"]), self.db, self.landlord_a
        )
        with self.assertRaises(HTTPException) as room_error:
            create_rooms(
                property_item["id"], RoomBatchPayload(numbers=["A1"]), self.db, self.landlord_a
            )
        self.assertEqual(room_error.exception.status_code, 409)

    def test_property_access_is_scoped_to_landlord(self):
        property_item = LandlordProperty(landlord_id=self.landlord_a.id, name="A 棟")
        self.db.add(property_item)
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            _owned_property(self.db, self.landlord_b.id, property_item.id)
        self.assertEqual(caught.exception.status_code, 404)

    def test_empty_property_can_be_deleted(self):
        property_item = create_property(
            PropertyPayload(name="待刪除棟別"), self.db, self.landlord_a
        )

        result = delete_property(property_item["id"], self.db, self.landlord_a)

        self.assertEqual(result["deleted_id"], property_item["id"])
        self.assertIsNone(
            self.db.query(LandlordProperty)
            .filter(LandlordProperty.id == property_item["id"])
            .first()
        )

    def test_property_with_rooms_cannot_be_deleted(self):
        property_item = create_property(
            PropertyPayload(name="已有房間棟別"), self.db, self.landlord_a
        )
        create_rooms(
            property_item["id"], RoomBatchPayload(numbers=["101"]), self.db, self.landlord_a
        )

        with self.assertRaises(HTTPException) as caught:
            delete_property(property_item["id"], self.db, self.landlord_a)

        self.assertEqual(caught.exception.status_code, 409)
        self.assertIsNotNone(
            self.db.query(LandlordProperty)
            .filter(LandlordProperty.id == property_item["id"])
            .first()
        )


if __name__ == "__main__":
    unittest.main()
