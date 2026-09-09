import asyncio
import unittest

import httpx

from http_retry import is_transient, with_retry


def _status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.test/v1/chat/completions")
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


class TransientClassificationTest(unittest.TestCase):
    """判斷錯了會有兩種代價：該重試的不重試（使用者看到失敗），
    不該重試的一直重試（白燒免費額度，而且結果不會變）。"""

    def test_server_side_errors_are_transient(self):
        for code in (429, 500, 502, 503, 504):
            with self.subTest(code=code):
                self.assertTrue(is_transient(_status_error(code)))

    def test_config_errors_are_not_transient(self):
        # 400：送了模型不認得的參數。401/403：金鑰問題。404：模型代號錯。
        # 這些重試幾次結果都一樣。
        for code in (400, 401, 403, 404, 422):
            with self.subTest(code=code):
                self.assertFalse(is_transient(_status_error(code)))

    def test_connect_failures_are_transient(self):
        self.assertTrue(is_transient(httpx.ConnectError("refused")))
        self.assertTrue(is_transient(httpx.ConnectTimeout("timed out")))

    def test_read_timeout_is_not_retried(self):
        """讀取逾時代表模型真的在慢慢跑，重試只會把等待變兩倍。"""
        self.assertFalse(is_transient(httpx.ReadTimeout("too slow")))


class RetryBehaviourTest(unittest.TestCase):
    def setUp(self):
        # 測試不要真的等 1 秒、3 秒
        self.original_sleep = asyncio.sleep

    def _run(self, operation, patched_sleep=True):
        import http_retry

        async def instant(_seconds):
            return None

        if patched_sleep:
            http_retry.asyncio.sleep = instant
        try:
            return asyncio.run(with_retry(operation, label="測試"))
        finally:
            http_retry.asyncio.sleep = self.original_sleep

    def test_succeeds_without_retry(self):
        calls = []

        async def ok():
            calls.append(1)
            return "done"

        self.assertEqual(self._run(ok), "done")
        self.assertEqual(len(calls), 1)

    def test_recovers_after_transient_failure(self):
        """實測 NVIDIA 免費 API 三次中一次回 503，這一項就是為它寫的。"""
        calls = []

        async def flaky():
            calls.append(1)
            if len(calls) == 1:
                raise _status_error(503)
            return "done"

        self.assertEqual(self._run(flaky), "done")
        self.assertEqual(len(calls), 2)

    def test_gives_up_after_max_attempts(self):
        calls = []

        async def always_503():
            calls.append(1)
            raise _status_error(503)

        with self.assertRaises(httpx.HTTPStatusError):
            self._run(always_503)
        self.assertEqual(len(calls), 3)

    def test_permanent_error_is_not_retried(self):
        calls = []

        async def bad_request():
            calls.append(1)
            raise _status_error(400)

        with self.assertRaises(httpx.HTTPStatusError):
            self._run(bad_request)
        self.assertEqual(len(calls), 1, "設定錯誤重試只是白燒額度")


if __name__ == "__main__":
    unittest.main()
