"""Add handover items without modifying existing rentals or inspection records.

Run from the repository root: python backend/migrations/create_inspection_items.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import engine
from models import InspectionItem


def upgrade(target_engine):
    InspectionItem.__table__.create(target_engine, checkfirst=True)


if __name__ == '__main__':
    if engine is None:
        raise SystemExit('DATABASE_URL is not configured')
    upgrade(engine)
    print('inspection_items is ready; existing data was preserved.')
