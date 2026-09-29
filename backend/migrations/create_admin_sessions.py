"""Add administrator sessions without changing existing tables or account data.

Run from the repository root: python backend/migrations/create_admin_sessions.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.database import engine
from db.models import AdminSession


def upgrade(target_engine):
    AdminSession.__table__.create(target_engine, checkfirst=True)


if __name__ == '__main__':
    if engine is None:
        raise SystemExit('DATABASE_URL is not configured')
    upgrade(engine)
    print('admin_sessions is ready; existing tables and account data were preserved.')
