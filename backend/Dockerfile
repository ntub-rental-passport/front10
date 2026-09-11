# RentMate FastAPI 後端
FROM python:3.12-slim

WORKDIR /app

# 先複製依賴清單再安裝，讓 Docker layer cache 在程式碼變動時不用重裝套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# 容器內對所有介面監聽；對外仍只透過 nginx 反向代理進來（compose 不映射此 port）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
