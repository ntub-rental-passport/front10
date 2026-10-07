import base64
from io import BytesIO
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from pypdf.errors import FileNotDecryptedError
from pypdf.generic import DecodedStreamObject, NameObject

from auth.security import get_current_user
from routers.contract_pdf import router, normalize_tenant_password


class ContractPdfTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_current_user] = lambda: object()
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        writer = PdfWriter()
        page = writer.add_blank_page(width=595, height=842)
        content = DecodedStreamObject()
        content.set_data(b"BT (A123456789 private contract) Tj ET")
        page[NameObject('/Contents')] = content
        output = BytesIO()
        writer.write(output)
        self.payload = {'tenant_id': 'A123456789', 'pdf_base64': base64.b64encode(output.getvalue()).decode()}

    def test_open_password_is_required_and_aes256_is_used(self):
        response = self.client.post('/api/contract/export-encrypted-pdf', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response.headers['cache-control'])
        self.assertNotIn(b'A123456789', response.content)
        self.assertNotIn('A123456789', response.headers['content-disposition'])
        reader = PdfReader(BytesIO(response.content))
        self.assertTrue(reader.is_encrypted)
        self.assertEqual(reader.trailer['/Encrypt']['/Length'], 256)
        with self.assertRaises(FileNotDecryptedError):
            len(reader.pages)
        self.assertEqual(reader.decrypt(''), 0)
        self.assertEqual(reader.decrypt('wrong-password'), 0)
        self.assertEqual(reader.decrypt('A123456789'), 1)  # user password, not owner
        self.assertEqual(len(reader.pages), 1)
        self.assertIn(b'private contract', reader.pages[0].get_contents().get_data())

    def test_invalid_identity_and_bad_file_fail_closed_without_echoing_inputs(self):
        for changes in [{'tenant_id': ''}, {'tenant_id': 'A123456788'}, {'pdf_base64': 'not pdf'}, {'pdf_base64': base64.b64encode(b'invalid').decode()}]:
            response = self.client.post('/api/contract/export-encrypted-pdf', json={**self.payload, **changes})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('A12345678', response.text)
            self.assertNotIn('application/pdf', response.headers['content-type'])

    def test_missing_auth_is_rejected(self):
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.post('/api/contract/export-encrypted-pdf', json=self.payload).status_code, 401)

    def test_request_limit_and_normalization(self):
        with patch('routers.contract_pdf.MAX_REQUEST_BYTES', 10):
            self.assertEqual(self.client.post('/api/contract/export-encrypted-pdf', json=self.payload).status_code, 413)
        self.assertEqual(normalize_tenant_password(' a123456789 '), 'A123456789')
