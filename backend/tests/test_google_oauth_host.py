import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import auth


class GoogleOAuthHostTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(auth.router)
        self.client = TestClient(app, base_url="http://127.0.0.1:5173")
        self.config = patch.object(auth, "_google_config", return_value=(
            "test-id", "test-secret", "http://localhost:8000/api/auth/google/callback",
            "http://localhost:5173",
        ))
        self.config.start()
        self.addCleanup(self.config.stop)
        self.addCleanup(self.client.close)

    def test_loopback_alias_redirects_before_setting_state_cookie(self):
        response = self.client.get(
            "/api/auth/google/start?role=landlord&redirect=%2Flandlord%2Fproperties",
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302)
        target = urlsplit(response.headers["location"])
        self.assertEqual(target.netloc, "localhost:8000")
        self.assertEqual(target.path, "/api/auth/google/start")
        self.assertEqual(parse_qs(target.query), {
            "role": ["landlord"], "redirect": ["/landlord/properties"],
        })
        self.assertNotIn("set-cookie", response.headers)

    def test_matching_host_sets_cookie_and_redirects_to_google(self):
        response = self.client.get(
            "http://localhost:8000/api/auth/google/start?role=tenant&redirect=%2Fapp",
            follow_redirects=False,
        )
        target = urlsplit(response.headers["location"])
        self.assertEqual(target.hostname, "accounts.google.com")
        self.assertIn(auth.STATE_COOKIE_NAME, response.headers["set-cookie"])
        self.assertEqual(parse_qs(target.query)["redirect_uri"], [
            "http://localhost:8000/api/auth/google/callback",
        ])
