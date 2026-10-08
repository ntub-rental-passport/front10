"""Add calculation details to existing bills on SQLite or MySQL; preserve amounts."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import inspect, text
from db.database import engine


def upgrade(target_engine):
    if 'utility_details' not in {c['name'] for c in inspect(target_engine).get_columns('bills')}:
        with target_engine.begin() as connection:
            connection.execute(text('ALTER TABLE bills ADD COLUMN utility_details JSON NULL'))


if __name__ == '__main__':
    upgrade(engine)
    print('bills.utility_details ready; existing records preserved.')
