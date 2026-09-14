"""Create missing Notes tables without altering existing tables or records.

Run from the project root: python backend/migrations/create_notes_tables.py
Uses the same DATABASE_URL as the main backend (SQLite or MySQL).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import Base, engine
from models import Note
from notes_models import Household, HouseholdMember, HouseholdTask


if __name__ == "__main__":
    if engine is None:
        raise SystemExit("DATABASE_URL is not configured")
    tables = [model.__table__ for model in (Note, Household, HouseholdMember, HouseholdTask)]
    Base.metadata.create_all(engine, tables=tables, checkfirst=True)
    print("Notes tables ready: " + ", ".join(table.name for table in tables))
