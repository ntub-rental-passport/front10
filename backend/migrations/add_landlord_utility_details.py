"""Persist landlord electricity calculations without changing existing charges."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import inspect, text
from db.database import engine


def upgrade(target_engine):
    if 'utility_details' not in {c['name'] for c in inspect(target_engine).get_columns('landlord_charges')}:
        with target_engine.begin() as connection:
            connection.execute(text('ALTER TABLE landlord_charges ADD COLUMN utility_details JSON NULL'))


if __name__ == '__main__':
    upgrade(engine)
    print('landlord_charges.utility_details ready.')
