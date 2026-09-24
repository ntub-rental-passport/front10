import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import User, Note, HouseholdTask
from routers import households, notes
from security import create_access_token


class NotesApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "notes-test-secret"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            for user_id in range(1, 5):
                db.add(User(role="tenant", id=user_id, email=f"user{user_id}@example.com", display_name=f"User {user_id}",
                            status="suspended" if user_id == 4 else "active"))
            db.flush()
            db.commit()
        app = FastAPI()
        app.include_router(notes.router)
        app.include_router(households.router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.client.close)
        self.payload = {"title": "清潔", "content": "客廳", "date": "2026-09-14", "time": "", "tag": "維護"}

    def request(self, method, path, user=1, **kwargs):
        return self.client.request(method, path, headers={"Authorization": f"Bearer {create_access_token(user, 'tenant')}"}, **kwargs)

    def group(self, user=1):
        response = self.request("POST", "/api/households", user, json={"name": "測試協作區"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_personal_crud_persists_and_is_account_scoped(self):
        response = self.request("POST", "/api/notes", json=self.payload)
        self.assertEqual(response.status_code, 201, response.text)
        note_id = response.json()["id"]
        self.assertEqual(len(self.request("GET", "/api/notes").json()), 1)
        self.assertEqual(self.request("GET", "/api/notes", 2).json(), [])
        self.assertEqual(self.request("PATCH", f"/api/notes/{note_id}", 2, json={"done": True}).status_code, 404)
        self.assertEqual(self.request("DELETE", f"/api/notes/{note_id}", 2).status_code, 404)
        response = self.request("PATCH", f"/api/notes/{note_id}", json={"done": True, "title": "完成清潔"})
        self.assertTrue(response.json()["done"])
        self.assertEqual(self.request("GET", "/api/notes").json()[0]["title"], "完成清潔")
        self.assertEqual(self.request("DELETE", f"/api/notes/{note_id}").status_code, 204)
        self.assertEqual(self.request("GET", "/api/notes").json(), [])

    def test_rejects_fake_email_header_wrong_role_and_suspended_accounts(self):
        self.assertEqual(self.client.get("/api/notes", headers={"X-User-Email": "user1@example.com"}).status_code, 401)
        response = self.client.get("/api/notes", headers={"Authorization": f"Bearer {create_access_token(1, 'landlord')}"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.request("GET", "/api/notes", 4).status_code, 403)
        self.assertEqual(self.request("GET", "/api/households", 4).status_code, 403)

    def test_invalid_note_fields_and_null_updates_are_rejected(self):
        for fields in [{"title": "   "}, {"time": "24:70"}, {"date": "2026-02-30"}]:
            self.assertEqual(self.request("POST", "/api/notes", json={**self.payload, **fields}).status_code, 422)
        note = self.request("POST", "/api/notes", json=self.payload).json()
        for field in ["title", "content", "tag", "done"]:
            self.assertEqual(self.request("PATCH", f"/api/notes/{note['id']}", json={field: None}).status_code, 422)

    def test_invite_join_is_idempotent_and_rotation_invalidates_old_link(self):
        group = self.group()
        self.assertLessEqual(len(group['inviteCode']), 20)
        self.assertTrue(group['id'].isdigit())
        path = f"/api/households/{group['id']}"
        self.assertEqual(self.request("GET", f"{path}/tasks", 2).status_code, 404)
        for _ in range(2):
            self.assertEqual(self.request("POST", f"/api/households/join/{group['inviteCode']}", 2).status_code, 200)
        self.assertEqual(len(self.request("GET", f"{path}/members").json()), 2)
        self.assertEqual(len(self.request("GET", "/api/households", 2).json()), 1)
        self.assertEqual(self.request("POST", f"{path}/invite", 2).status_code, 403)
        rotated = self.request("POST", f"{path}/invite").json()
        self.assertNotEqual(rotated["inviteCode"], group["inviteCode"])
        self.assertEqual(self.request("POST", f"/api/households/join/{group['inviteCode']}", 3).status_code, 404)

    def test_shared_task_crud_and_cross_group_assignment(self):
        group = self.group()
        path = f"/api/households/{group['id']}"
        self.request("POST", f"/api/households/join/{group['inviteCode']}", 2)
        other = self.group(3)
        foreign_member = self.request("GET", f"/api/households/{other['id']}/members", 3).json()[0]
        response = self.request("POST", f"{path}/tasks", json={**self.payload, "tag": "清潔", "assigneeId": foreign_member["id"]})
        self.assertEqual(response.status_code, 422)
        task = self.request("POST", f"{path}/tasks", json={**self.payload, "tag": "清潔", "assigneeId": ""}).json()
        self.assertEqual(self.request("GET", f"{path}/tasks", 2).json()[0]["id"], task["id"])
        self.assertEqual(self.request("PATCH", f"{path}/tasks/{task['id']}", 3, json={"done": True}).status_code, 404)
        self.assertEqual(self.request("PATCH", f"{path}/tasks/{task['id']}", 2, json={"assigneeId": foreign_member["id"]}).status_code, 422)
        updated = self.request("PATCH", f"{path}/tasks/{task['id']}", 2, json={"done": True, "title": "共同完成"})
        self.assertTrue(updated.json()["done"])
        self.assertEqual(self.request("DELETE", f"{path}/tasks/{task['id']}", 2).status_code, 204)

    def test_member_removal_revokes_access_and_unassigns_tasks(self):
        group = self.group()
        path = f"/api/households/{group['id']}"
        self.request("POST", f"/api/households/join/{group['inviteCode']}", 2)
        members = self.request("GET", f"{path}/members").json()
        member = next(m for m in members if m["name"] == "User 2")
        owner = next(m for m in members if m["name"] == "User 1")
        self.assertEqual(self.request("POST", f"{path}/members", 2, json={"name": "手動", "email": "user3@example.com"}).status_code, 403)
        manual = self.request("POST", f"{path}/members", json={"name": "手動", "email": "user3@example.com", "role": "清潔"})
        self.assertEqual(manual.status_code, 201, manual.text)
        self.assertTrue(manual.json()["linked"])
        self.assertEqual(self.request("DELETE", f"{path}/members/{owner['id']}").status_code, 409)
        self.request("POST", f"{path}/tasks", 2, json={**self.payload, "tag": "清潔", "assigneeId": member["id"]})
        self.assertEqual(self.request("DELETE", f"{path}/members/{member['id']}").status_code, 204)
        self.assertEqual(self.request("GET", f"{path}/tasks", 2).status_code, 404)
        task = self.request("GET", f"{path}/tasks").json()[0]
        self.assertEqual(task["assigneeId"], "")
        self.assertEqual(task["creatorId"], "")

    def test_time_nullable_date_and_completion_timestamp(self):
        response = self.request('POST', '/api/notes', json={**self.payload, 'date': '', 'time': '09:15'})
        self.assertEqual(response.status_code, 201, response.text)
        note = response.json()
        self.assertEqual(note['date'], '')
        self.assertEqual(note['time'], '09:15')
        path = '/api/notes/' + note['id']
        self.assertEqual(self.request('PATCH', path, json={'done': True}).status_code, 200)
        with self.Session() as db:
            record = db.get(Note, int(note['id']))
            self.assertIsNone(record.due_date)
            self.assertEqual(record.due_time.hour, 9)
            self.assertIsNotNone(record.done_at)
        self.assertEqual(self.request('PATCH', path, json={'done': False, 'time': '', 'date': None}).status_code, 200)
        with self.Session() as db:
            record = db.get(Note, int(note['id']))
            self.assertIsNone(record.done_at)
            self.assertIsNone(record.due_time)

    def test_tags_and_member_accounts_follow_new_schema(self):
        self.assertEqual(self.request('POST', '/api/notes', json={**self.payload, 'tag': '清潔'}).status_code, 422)
        group = self.group()
        path = '/api/households/' + group['id']
        self.assertEqual(self.request('POST', path + '/tasks', json=self.payload).status_code, 422)
        self.assertEqual(self.request('POST', path + '/members', json={'name': 'Test'}).status_code, 422)
        for email in ['missing@example.com', 'user4@example.com']:
            self.assertEqual(self.request('POST', path + '/members', json={'name': 'Test', 'email': email}).status_code, 422)
        data = {'name': 'Test', 'email': 'user2@example.com'}
        self.assertEqual(self.request('POST', path + '/members', json=data).status_code, 201)
        self.assertEqual(self.request('POST', path + '/members', json=data).status_code, 409)

    def test_shared_completion_and_null_assignee(self):
        group = self.group()
        path = '/api/households/' + group['id']
        member = self.request('GET', path + '/members').json()[0]
        response = self.request('POST', path + '/tasks', json={**self.payload, 'tag': '清潔', 'time': '18:30', 'assigneeId': member['id']})
        self.assertEqual(response.status_code, 201, response.text)
        task = response.json()
        updated = self.request('PATCH', path + '/tasks/' + task['id'], json={'done': True, 'assigneeId': None})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()['assigneeId'], '')
        with self.Session() as db:
            record = db.get(HouseholdTask, int(task['id']))
            self.assertIsNotNone(record.done_at)
            self.assertEqual(record.due_time.hour, 18)
