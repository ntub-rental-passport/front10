FROM python:3.11-slim

WORKDIR /app
ENV HF_HOME=/opt/huggingface

# 先固定 CPU wheel，避免 sentence-transformers 從 PyPI 帶進整套 CUDA。
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2026-10-07 起服務只在 internal 網段，模型必須在建置時下載完成。
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('shibing624/text2vec-base-chinese', device='cpu')"
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

# 固定快取位置並交給服務帳號，離線載入也不會碰到 root 家目錄的權限。
RUN useradd --create-home --uid 10001 rag && chown -R rag:rag /opt/huggingface
COPY app.py .
USER rag

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
