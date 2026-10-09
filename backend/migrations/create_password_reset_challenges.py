"""Run explicitly: python backend/migrations/create_password_reset_challenges.py.

Adds only the password recovery table; never rewrites account data.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.database import engine
from db.models import PasswordResetChallenge


def upgrade(target_engine):
    PasswordResetChallenge.__table__.create(target_engine, checkfirst=True)


if __name__ == '__main__':
    if engine is None:
        raise SystemExit('DATABASE_URL is not configured')
    upgrade(engine)
    print('password_reset_challenges is ready; existing account data was preserved.')
