"""Local-only browser test app. Captures email in memory; never accesses team data.

Run from the repository root: python scripts/password-preview.py
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ.update(DATABASE_URL='', JWT_SECRET='browser-password-test-secret-only-0123456789',
                  AUTH_TOKEN_SECRET='browser-password-test-token-secret', VERIFICATION_CODE_SECRET='v' * 40)
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from db import database
from db.database import Base, get_db
from db.models import User, UserRole
from routers import auth, password, platform_settings_api

database.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
Base.metadata.create_all(database.engine)
Session = sessionmaker(bind=database.engine)
database.SessionLocal = Session
with Session() as db:
    db.add(User(email='password-browser@example.com', display_name='Browser test',
                password_hash=auth.password_hasher.hash('Original-pass-1'),
                password_changed_at=datetime.utcnow() - timedelta(days=1), email_verified_at=datetime.utcnow(),
                roles=[UserRole(role='tenant'), UserRole(role='landlord')]))
    db.commit()
mailbox = {}
password._smtp_config = lambda: {}
password.send_password_reset_code = lambda email, code: mailbox.update({email: code})
app = FastAPI()
app.include_router(auth.router)
app.include_router(password.router)
app.include_router(platform_settings_api.router)
def session():
    with Session() as db:
        yield db
app.dependency_overrides[get_db] = session
@app.get('/api/test/password-code')
def captured_code():
    return {'code': mailbox.get('password-browser@example.com')}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8012)
