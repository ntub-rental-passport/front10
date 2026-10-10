"""不下載模型、不依賴 torch 的內網 embedding 介面測試。"""

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app as service

try:
    from fastapi.testclient import TestClient
except ImportError as error:
    TestClient = None
    CLIENT_ERROR = str(error)
else:
    CLIENT_ERROR = ""


class FakeVectors(list):
    def mean(self, axis):
        assert axis == 0
        return [sum(row[i] for row in self) / len(self) for i in range(len(self[0]))]


class FakeModel:
    def __init__(self):
        self.windows = []

    def get_sentence_embedding_dimension(self):
        return 2

    def encode(self, windows, *, convert_to_numpy, show_progress_bar):
        assert convert_to_numpy is True
        assert show_progress_bar is False
        self.windows.append(windows)
        return FakeVectors([[len(text), ord(text[0])] for text in windows])


@unittest.skipIf(TestClient is None, f"FastAPI TestClient 缺少依賴：{CLIENT_ERROR}")
class AppTests(unittest.TestCase):
    def setUp(self):
        self.model = FakeModel()
        factory = Mock(return_value=self.model)
        self.addCleanup(patch.stopall)
        patch.object(service, "_model", None).start()
        patch.object(service, "_model_error", "").start()
        patch.dict(sys.modules, {"sentence_transformers": SimpleNamespace(SentenceTransformer=factory)}).start()
        try:
            self.client = TestClient(service.app)
        except (ImportError, TypeError) as error:
            self.skipTest(f"FastAPI TestClient 依賴缺少或版本不相容：{error}")
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        factory.assert_called_once_with(service.EMBED_MODEL, device="cpu")

    def test_health_ready(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "ok",
            "embeddingModel": service.EMBED_MODEL,
            "embeddingReady": True,
        })

    def test_load_failure_keeps_health_available(self):
        factory = Mock(side_effect=RuntimeError("cache unavailable"))
        with patch.dict(sys.modules, {"sentence_transformers": SimpleNamespace(SentenceTransformer=factory)}):
            with TestClient(service.app) as client:
                response = client.get("/health")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {
                    "status": "ok", "embeddingModel": None, "embeddingReady": False,
                })
                self.assertEqual(client.post("/embed", json={"input": "租約"}).status_code, 503)

    def test_embed_shape_and_model(self):
        response = self.client.post("/embed", json={"input": ["租約", "押金"], "input_type": "query"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "model": service.EMBED_MODEL,
            "dim": 2,
            "data": [
                {"index": 0, "embedding": [2.0, float(ord("租"))]},
                {"index": 1, "embedding": [2.0, float(ord("押"))]},
            ],
        })

    def test_string_input(self):
        response = self.client.post("/embed", json={"input": " 租約 "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], [{"index": 0, "embedding": [2.0, float(ord("租"))]}])
        self.assertEqual(self.model.windows, [["租約"]])

    def test_bad_input(self):
        for payload in ({}, {"input": ""}, {"input": []}, {"input": None}, {"input": 1},
                        {"input": True}, {"input": {"text": "租約"}}, {"input": ["租約", 1]}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/embed", json=payload).status_code, 400)
        self.assertEqual(self.model.windows, [])

    def test_batch_limit(self):
        self.assertEqual(self.client.post("/embed", json={"input": ["租約"] * 64}).status_code, 200)
        self.assertEqual(self.client.post("/embed", json={"input": ["租約"] * 65}).status_code, 400)

    def test_model_missing(self):
        service._model = None
        service._model_error = "cache unavailable"
        response = self.client.post("/embed", json={"input": "租約"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("cache unavailable", response.json()["detail"])
        self.assertEqual(self.client.post("/embed", json={"input": 1}).status_code, 400)

    def test_long_text_averages_all_windows(self):
        with patch.object(service, "WINDOW_CHARS", 3):
            response = self.client.post("/embed", json={"input": " aaabbbcc "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.model.windows, [["aaa", "bbb", "cc"]])
        self.assertEqual(response.json()["data"][0]["embedding"], [8 / 3, 98.0])

    def test_blank_list_item_returns_zero_vector(self):
        response = self.client.post("/embed", json={"input": ["", "  "]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["embedding"] for row in response.json()["data"]], [[0.0, 0.0], [0.0, 0.0]])
        self.assertEqual(self.model.windows, [])


if __name__ == "__main__":
    unittest.main()
