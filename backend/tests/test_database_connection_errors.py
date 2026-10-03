import unittest
from unittest.mock import MagicMock, patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from db.database import get_db


class DatabaseConnectionErrorsTests(unittest.TestCase):
    def request_with_error(self, code):
        app = FastAPI()
        session = MagicMock()
        session.execute.side_effect = OperationalError(
            'SELECT private_data', {}, Exception(code, 'internal connection detail'),
        )
        @app.get('/probe')
        def probe(db=Depends(get_db)):
            db.execute('SELECT private_data')

        with patch('db.database.SessionLocal', return_value=session):
            response = TestClient(app, raise_server_exceptions=False).get('/probe')
        session.close.assert_called_once()
        return response

    def test_connection_errors_return_503_without_database_details(self):
        for code in (2002, 2003, 2006, 2013, 2055):
            with self.subTest(code=code):
                response = self.request_with_error(code)
                self.assertEqual(response.status_code, 503)
                self.assertIn('資料庫暫時無法連線', response.json()['detail'])
                self.assertNotIn('private_data', response.text)
                self.assertNotIn('internal connection detail', response.text)

    def test_schema_errors_are_not_reported_as_connection_failure(self):
        self.assertEqual(self.request_with_error(1054).status_code, 500)
