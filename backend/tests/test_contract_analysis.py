import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from routers.contract import AnalyzeRequest, LlmUnavailable, _validate_risks, analyze_contract


class ContractAnalysisTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.empty_retries = 2
        self.enterContext(patch("routers.contract.CONTRACT_EMPTY_RETRIES", self.empty_retries))
        self.enterContext(patch("routers.contract.CONTRACT_EMPTY_RETRY_FAST_SECONDS", 15))
        self.clock = self.enterContext(patch("routers.contract.time"))
        self.clock.monotonic.return_value = 0

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

    async def test_blank_contract_does_not_claim_ai_completed(self):
        with patch("routers.contract.generate", AsyncMock()) as generate:
            with self.assertRaises(HTTPException) as error:
                await analyze_contract(AnalyzeRequest(ocr_text=" \n "))
            self.assertEqual(error.exception.status_code, 422)
            generate.assert_not_awaited()

    async def test_analysis_calls_model_and_requests_traditional_chinese(self):
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(return_value='{"rag_risks": [], "ai_risks": [{"title": "修繕建議"}]}')) as generate:
            await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            generate.assert_awaited_once()
            self.assertIn("必須使用繁體中文", generate.call_args.args[0])
            self.assertIn("clause、focusText 保留契約原文", generate.call_args.args[0])

    async def test_fast_empty_then_non_empty_returns_findings(self):
        responses = ['{"rag_risks": [], "ai_risks": []}', '{"rag_risks": [], "ai_risks": [{"title": "修繕建議"}]}']
        self.clock.monotonic.side_effect = [0, 2, 2, 52]
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=responses)) as generate:
            with self.assertLogs("routers.contract", level="INFO") as logs:
                result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(result["rag_risks"], [])
            self.assertEqual(result["ai_risks"][0]["title"], "修繕建議")
            self.assertEqual(generate.await_count, 2)
            self.assertEqual(generate.await_args_list[0], generate.await_args_list[1])
            self.assertTrue(any("模型 2.0 秒就回空結果，重試第 1 次" in log for log in logs.output))

    async def test_fast_empty_results_stop_after_retry_limit(self):
        responses = ['{"rag_risks": [], "ai_risks": []}'] * (1 + self.empty_retries)
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=responses)) as generate:
            result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(result, {"rag_risks": [], "ai_risks": []})
            self.assertEqual(generate.await_count, 1 + self.empty_retries)

    async def test_slow_empty_result_is_accepted_without_retry(self):
        self.clock.monotonic.side_effect = [0, 15]
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=['{"rag_risks": [], "ai_risks": []}'])) as generate:
            result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(result, {"rag_risks": [], "ai_risks": []})
            generate.assert_awaited_once()

    async def test_fast_empty_then_unavailable_returns_empty(self):
        responses = ['{"rag_risks": [], "ai_risks": []}', LlmUnavailable()]
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=responses)) as generate:
            result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(result, {"rag_risks": [], "ai_risks": []})
            self.assertEqual(generate.await_count, 2)

    async def test_fast_empty_then_malformed_returns_empty(self):
        for response in ['no JSON', '{invalid}', '{}', '{"rag_risks": [], "ai_risks": null}', '{"rag_risks": [{}], "ai_risks": []}']:
            with self.subTest(response=response):
                responses = ['{"rag_risks": [], "ai_risks": []}', response]
                with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=responses)) as generate:
                    result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
                    self.assertEqual(result, {"rag_risks": [], "ai_risks": []})
                    self.assertEqual(generate.await_count, 2)

    async def test_zero_retries_accepts_fast_empty_result(self):
        with patch("routers.contract.CONTRACT_EMPTY_RETRIES", 0), patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=['{"rag_risks": [], "ai_risks": []}'])) as generate:
            result = await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(result, {"rag_risks": [], "ai_risks": []})
            generate.assert_awaited_once()

    async def test_first_attempt_unavailable_still_returns_503(self):
        with patch("routers.contract.retrieve", AsyncMock(return_value=[])), patch("routers.contract.generate", AsyncMock(side_effect=LlmUnavailable())) as generate:
            with self.assertRaises(HTTPException) as error:
                await analyze_contract(AnalyzeRequest(ocr_text="租賃契約測試"))
            self.assertEqual(error.exception.status_code, 503)
            generate.assert_awaited_once()

    async def test_malformed_response_is_not_a_clean_contract(self):
        for response in ['no JSON', '{invalid}', '{}', '{"rag_risks": [], "ai_risks": null}', '{"rag_risks": [{}], "ai_risks": []}']:
            with self.assertRaises(HTTPException) as error:
                await self.call_analysis(response)
            self.assertEqual(error.exception.status_code, 503)
