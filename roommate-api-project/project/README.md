# 個人記事 & 室友協作區 API

## 技術棧
- FastAPI (Python)
- MySQL 8（結構化資料）+ ChromaDB（向量知識庫，供未來 RAG 使用）
- Google OIDC / OAuth 2.0 Authorization Code Flow
- 本系統自簽 JWT（Access Token + Refresh Token）
- Docker Compose 容器化 + GitHub Actions CI/CD

## 快速開始

```bash
cp .env.example .env
# 編輯 .env，填入 Google Console 申請到的 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
# 以及 JWT_SECRET_KEY（用 openssl rand -hex 32 產生一組即可）

docker compose up --build
```

啟動後：
- API：http://localhost:8000
- API 文件（Swagger）：http://localhost:8000/docs
- ChromaDB：http://localhost:8001

## Google OAuth 設定
1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立 OAuth 2.0 用戶端 ID
2. 應用程式類型選「網頁應用程式」
3. 已授權的重新導向 URI 填：`http://localhost:8000/api/auth/google/callback`
4. 把產生的 Client ID / Client Secret 填進 `.env`

## 登入流程
1. 前端導頁到 `GET /api/auth/google/login` -> 302 導到 Google 登入頁
2. 使用者登入同意後，Google 導回並帶 `?code=...&state=...`
3. 前端呼叫 `GET /api/auth/google/callback?code=...&state=...`
4. 後端驗證完成後回傳 `{ access_token, refresh_token }`
5. 之後打 API 都帶 `Authorization: Bearer <access_token>`
6. access_token 過期時，用 `POST /api/auth/refresh` 換新的一組

## API 一覽

### 個人記事（僅本人可存取）
| Method | Path | 說明 |
|---|---|---|
| POST | /api/notes | 建立記事 |
| GET | /api/notes | 列表（可用 ?tag= 篩選） |
| GET | /api/notes/{id} | 取得單筆 |
| PUT | /api/notes/{id} | 更新 |
| DELETE | /api/notes/{id} | 刪除 |

### 室友協作區
| Method | Path | 說明 |
|---|---|---|
| POST | /api/households | 建立協作空間（自己成為 admin） |
| POST | /api/households/join/{invite_code} | 用邀請碼加入 |
| GET | /api/households/{id}/tasks | 任務列表 |
| POST | /api/households/{id}/tasks | 新增任務 |
| PATCH | /api/households/{id}/tasks/{task_id}?status=done | 更新任務狀態 |

> Expense（分帳）model 已建好，之後照 Task 的模式加一支 `app/api/expenses.py` 即可。

## 尚待補充
- Alembic migration（目前開發階段用 `Base.metadata.create_all` 直接建表）
- Expense 分帳的 API 路由與計算邏輯
- RAG 相關的 `/api/rag` 路由（`app/core/vectorstore.py` 已預留 ChromaDB 連線）
- pytest 測試（CI 中已留 TODO）
- GitHub Actions 需要在 repo secrets 補上 DOCKERHUB_USERNAME / DOCKERHUB_TOKEN / DEPLOY_HOST 等
