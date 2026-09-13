"""
ChromaDB 連線基礎模組。
目前先提供 client 與 collection 存取，之後要做 RAG 語意檢索時
（例如法規條文/使用手冊），可以在這裡加上 embedding function 與
query 邏輯，再由一個新的 /api/rag 路由呼叫。
"""
import chromadb

from app.core.config import settings

_client: chromadb.HttpClient | None = None


def get_chroma_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
    return _client


def get_or_create_collection(name: str):
    client = get_chroma_client()
    return client.get_or_create_collection(name=name)
