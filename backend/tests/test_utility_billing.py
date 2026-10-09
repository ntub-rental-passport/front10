import unittest
from pydantic import ValidationError
from sqlalchemy import create_engine, text, inspect
from db.utility_billing import UtilityEntry
from migrations.add_bill_utility_details import upgrade


class UtilityBillingTests(unittest.TestCase):
    def test_calculations(self):
        examples = [
            ({'method': 'amount', 'amount': '520.5'}, 521),
            ({'method': 'shared', 'total': 900, 'share': 1, 'shares': 2}, 450),
            ({'method': 'shared', 'total': 900, 'share': 15, 'shares': 45}, 300),
            ({'method': 'master', 'previous': 100, 'current': 220, 'total': 1500,
              'main_usage': 300, 'sub_usage': 240, 'share': 1, 'shares': 2}, 750),
            ({'method': 'pending'}, None), ({'method': 'included'}, 0), ({'method': 'no_bill'}, 0),
        ]
        for entry, expected in examples:
            with self.subTest(entry=entry):
                self.assertEqual(UtilityEntry(**entry).calculate(), expected)

    def test_bad_inputs(self):
        for entry in [
            {'method': 'meter', 'previous': 10, 'current': 10, 'rate': 5},
            {'method': 'amount', 'amount': -1}, {'method': 'amount', 'amount': 'NaN'},
            {'method': 'amount', 'amount': 'Infinity'}, {'method': 'amount'},
            {'method': 'pending', 'amount': 100},
            {'method': 'shared', 'total': 900, 'share': 1, 'shares': 0},
            {'method': 'shared', 'total': 900, 'share': 3, 'shares': 2},
            {'method': 'meter', 'previous': 0, 'current': 100_000_000, 'rate': 100_000},
            {'method': 'master', 'previous': 0, 'current': 120, 'total': 1500,
             'main_usage': 300, 'sub_usage': 301, 'share': 1, 'shares': 2},
        ]:
            with self.subTest(entry=entry), self.assertRaises(ValidationError):
                UtilityEntry(**entry)

    def test_migration_preserves_existing_bills_and_is_repeatable(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE bills (id INTEGER PRIMARY KEY, electricity_amount INTEGER)'))
            conn.execute(text('INSERT INTO bills VALUES (1, 520)'))
        upgrade(engine)
        upgrade(engine)
        self.assertIn('utility_details', {c['name'] for c in inspect(engine).get_columns('bills')})
        with engine.connect() as conn:
            self.assertEqual(tuple(conn.execute(text('SELECT electricity_amount, utility_details FROM bills')).one()), (520, None))
