import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from ai.llm_provider import _call_ollama


class OllamaConfigurationTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_model_and_optional_thinking_control(self):
        for thinking, expected in [("false", False), ("true", True), ("", None)]:
            response = httpx.Response(200, json={"response": '{"ok":true}'}, request=httpx.Request("POST", "http://localhost/api/generate"))
            client = AsyncMock()
            client.post.return_value = response
            with patch.dict(os.environ, {"OLLAMA_MODEL": "installed-model", "OLLAMA_THINK": thinking}), patch("ai.llm_provider.httpx.AsyncClient") as factory:
                factory.return_value.__aenter__.return_value = client
                result = await _call_ollama("test", read_timeout=30, force_json=True, purpose="analyze")
            self.assertEqual(result, '{"ok":true}')
            payload = client.post.call_args.kwargs["json"]
            self.assertEqual(payload["model"], "installed-model")
            if expected is None:
                self.assertNotIn("think", payload)
            else:
                self.assertIs(payload["think"], expected)

    async def test_missing_model_diagnostic_preserves_failure(self):
        response = httpx.Response(404, json={"error": "model not found"}, request=httpx.Request("POST", "http://localhost/api/generate"))
        client = AsyncMock()
        client.post.return_value = response
        with patch.dict(os.environ, {"OLLAMA_MODEL": "missing-model"}), patch("ai.llm_provider.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            with self.assertLogs("ai.llm_provider", level="ERROR") as logs:
                with self.assertRaises(httpx.HTTPStatusError):
                    await _call_ollama("test", read_timeout=30, force_json=True, purpose="analyze")
        self.assertIn("missing-model", logs.output[0])
        self.assertIn("ollama list", logs.output[0])
        self.assertEqual(client.post.await_count, 1)
