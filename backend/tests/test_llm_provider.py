import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from ai import llm_provider
from ai.llm_provider import _call_ollama
from common import upstream_state


class OllamaConfigurationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        upstream_state.reset()
        self.addCleanup(upstream_state.reset)

    def test_provider_order_defaults_to_nvidia(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(llm_provider.provider_order(), ["nvidia"])

    def test_provider_order_falls_back_to_nvidia_for_invalid_values(self):
        for value in ("", "unknown", " , unknown "):
            with self.subTest(value=value), patch.dict(os.environ, {"LLM_PROVIDER_ORDER": value}, clear=True):
                self.assertEqual(llm_provider.provider_order(), ["nvidia"])

    def test_provider_order_allows_explicit_local_ollama_opt_in(self):
        with patch.dict(os.environ, {"LLM_PROVIDER_ORDER": "nvidia,ollama"}, clear=True):
            self.assertEqual(llm_provider.provider_order(), ["nvidia", "ollama"])

    def test_base_uses_ollama_url_ignoring_retired_setting(self):
        with patch.dict(os.environ, {
            "OLLAMA_URL": "http://ollama:11434",
            "LLM_TUNNEL_URL": "https://retired.example",
        }, clear=True):
            self.assertEqual(llm_provider.ollama_base(), "http://ollama:11434")

    def test_base_defaults_to_local_development(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(llm_provider.ollama_base(), "http://127.0.0.1:11434")

    async def test_request_sends_no_auth_headers(self):
        retired_credentials = {
            "LLM_TUNNEL_API_KEY": "unused",
            "CF_ACCESS_CLIENT_ID": "unused",
            "CF_ACCESS_CLIENT_SECRET": "unused",
        }
        response = httpx.Response(200, json={"response": "ok"}, request=httpx.Request("POST", "http://ollama:11434/api/generate"))
        client = AsyncMock()
        client.post.return_value = response
        with patch.dict(os.environ, {"OLLAMA_URL": "http://ollama:11434", **retired_credentials}, clear=True), \
             patch("ai.llm_provider.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            self.assertEqual(await _call_ollama("test", read_timeout=30, force_json=False, purpose="analyze"), "ok")
        self.assertEqual(client.post.call_args.args, ("http://ollama:11434/api/generate",))
        self.assertNotIn("headers", client.post.call_args.kwargs)

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
