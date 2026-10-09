"""Add multi-photo provenance without replacing legacy inspection records."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.database import engine
from db.models import InspectionPhotoDetail


def upgrade(target_engine):
    InspectionPhotoDetail.__table__.create(target_engine, checkfirst=True)


if __name__ == '__main__':
    upgrade(engine)
    print('inspection_photo_details ready; existing records preserved.')
