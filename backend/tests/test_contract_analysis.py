import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from routers.contract import AnalyzeRequest, _validate_risks, analyze_contract


class ContractAnalysisTests(unittest.IsolatedAsyncioTestCase):
    def test_model_severity_is_only_a_priority_hint(self):
        items = _validate_risks([{"title": "candidate", "severity": "high", "pageIndex": 0}], "rag")
        self.assertIsNone(items[0]["severity"])
        self.assertIsNone(items[0]["pageIndex"])
        self.assertEqual(items[0]["status"], "recognition_pending")
        self.assertTrue(items[0]["priority"])

    async def call_analysis(self, response):
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(return_value=response)):
            return await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))

    async def test_valid_empty_results_are_completed(self):
        self.assertEqual(await self.call_analysis('{"rag_risks": [], "ai_risks": []}'), {"rag_risks": [], "ai_risks": []})

    async def test_malformed_response_is_not_a_clean_contract(self):
        for response in ['{}', '{"rag_risks": [], "ai_risks": null}', '{"rag_risks": [{}], "ai_risks": []}']:
            with self.assertRaises(HTTPException) as error:
                await self.call_analysis(response)
            self.assertEqual(error.exception.status_code, 503)
