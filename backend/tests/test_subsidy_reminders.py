import json
from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.admin_store import AdminStoreTestCase
from routers import subsidy_reminders as api
from notifications import scheduled_notification_service as service


class SubsidyReminderTests(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        app = FastAPI()
        app.include_router(api.router)
        self.user = SimpleNamespace(id=12, email='tenant@example.com')
        app.dependency_overrides[api.get_current_tenant] = lambda: self.user
        self.client = TestClient(app)
        self.today = datetime.now(service.TZ).date()

    def create(self, **over):
        return self.client.post('/api/subsidy/reminders', json={
            'applicationDate': self.today.isoformat(), 'days': 14, **over,
        })

    def test_date_persisted_and_delivered_only_to_self(self):
        result = self.create()
        self.assertEqual(result.status_code, 201, result.text)
        item = result.json()
        self.assertIn(self.today.isoformat(), item['sourceLabel'])
        self.assertEqual(item['channels'], ['inapp'])
        self.assertEqual(datetime.fromisoformat(item['scheduledAt']).hour, 9)
        with service.connect() as db:
            row = db.execute('SELECT recipient FROM scheduled_notifications WHERE id=?', (item['id'],)).fetchone()
            self.assertEqual(json.loads(row['recipient']), {'kind': 'users', 'emails': [self.user.email]})
        self.assertEqual(len(self.client.get('/api/subsidy/reminders').json()), 1)
        self.assertEqual(self.create().status_code, 409)
        delivered = []
        def deliver(emails, row, states):
            delivered.extend(emails)
            return len(emails)
        self.assertEqual(service.dispatch_due(
            now=datetime.fromisoformat(item['scheduledAt']) + timedelta(seconds=1),
            deliver_inapp=deliver,
        ), 1)
        self.assertEqual(delivered, ['tenant@example.com'])
        self.assertEqual(self.client.get('/api/subsidy/reminders').json()[0]['status'], 'sent')

    def test_other_user_cannot_read_or_cancel(self):
        item = self.create().json()
        self.user = SimpleNamespace(id=99, email='other@example.com')
        self.assertEqual(self.client.get('/api/subsidy/reminders').json(), [])
        self.assertEqual(self.client.delete('/api/subsidy/reminders/' + item['id']).status_code, 404)
        self.user = SimpleNamespace(id=12, email='tenant@example.com')
        self.assertEqual(self.client.delete('/api/subsidy/reminders/' + item['id']).json()['status'], 'cancelled')
        self.assertEqual(self.create().status_code, 201)

    def test_rejects_future_or_expired_dates_and_extra_sensitive_fields(self):
        self.assertEqual(self.create(applicationDate=(self.today + timedelta(days=1)).isoformat()).status_code, 400)
        self.assertEqual(self.create(applicationDate=(self.today - timedelta(days=40)).isoformat()).status_code, 400)
        self.assertEqual(self.create(days=0).status_code, 422)
        self.assertEqual(self.create(healthCardNumber='not-accepted').status_code, 422)
        self.assertEqual(self.create(recipient={'emails': ['other@example.com']}).status_code, 422)

    def test_requires_authentication(self):
        app = FastAPI()
        app.include_router(api.router)
        response = TestClient(app).get('/api/subsidy/reminders')
        self.assertIn(response.status_code, (401, 403))
