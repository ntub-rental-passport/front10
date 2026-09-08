import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from security import create_access_token, read_access_token


class AccessTokenTest(unittest.TestCase):
    def test_signed_token_round_trip(self):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            token = create_access_token(42, "landlord")
            payload = read_access_token(token)
        self.assertEqual(payload["sub"], 42)
        self.assertEqual(payload["role"], "landlord")

    def test_tampered_token_is_rejected(self):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            token = create_access_token(42, "landlord")
            with self.assertRaises(HTTPException):
                read_access_token(f"{token[:-1]}x")


if __name__ == "__main__":
    unittest.main()
