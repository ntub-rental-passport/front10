# 測試與品質檢查

核對日期：2026-10-08。[返回入口](../README.md)

## 測試層級

| 層級 | 位置與執行方式 | 可驗證與限制 |
| --- | --- | --- |
| TypeScript 型別 | `npm run lint:types` | 型別與 Vue 檢查；不驗證瀏覽器或 API 可用 |
| 前端／OCR 邏輯 | `npm test` | Vitest 收錄 `src/**/*.test.ts`、`server/**/*.test.js`；Node 環境，不是完整 UI E2E |
| 前端建置 | `npm run build` | `vue-tsc -b` 與 Vite build；不啟動後端 |
| Python 單元／API | `backend/tests/test_*.py` | 多數以 unittest 與 TestClient、SQLite／替身驗證；不等同 MySQL 正式環境 |
| 專項腳本 | `scripts/verify-*` | OCR、合約欄位、PDF、地址與瀏覽器等；依腳本需要不同前置環境 |
| 實際整合 | 測試環境手動驗證 | 確認真實 DB、SMTP、OAuth、Vision、模型與代理配置 |

## 常用指令

前端／OCR：

```powershell
npm run lint:types
npm test
npm run build
npm run test:contract-gate
npm run test:vision-annotation
npm run test:vision-crops
npm run test:pdf-ocr
npm run test:address-resolver
```

只跑相關案例，例如：

```powershell
npm test -- src/services/passwordApi.test.ts server/auth-session.test.js
```

Python 請在隔離測試設定下執行；以下從根目錄設定 import 路徑：

```powershell
$env:PYTHONPATH = 'backend'
python -m unittest discover -s backend/tests -p test_password_recovery.py
python -m unittest discover -s backend/tests -p test_landlord_workspace.py
python -m unittest discover -s backend/tests
```

後端測試匯入 `auth/security.py` 前需有測試用 `JWT_SECRET`；各案例對其他金鑰、資料庫與外部服務的替換方式不同。不要在未看過 setup／mock 的情況下使用正式 `.env` 跑整套測試。

`backend/tests/conftest.py` 有 pytest 的全域寄信替換 fixture，但 **unittest discover 不會載入該 fixture**。若使用 pytest，需另外安裝 pytest（目前不在 `backend/requirements.txt`）；若使用 unittest，必須核對個別案例本身的寄信替換。這是兩種 runner 的實際差異，不能假設全部測試都自動禁止外部副作用。

## 變更應驗證的行為

- 授權修改：匿名、錯誤角色、其他帳號、其他工作區與過期 session。
- DB 修改：新環境建表、既有資料升級、schema 檢查及 MySQL 方言／限制。
- 上傳修改：大小與格式、所有權、檔案持久化、失敗後重試與版本衝突。
- AI 修改：provider 失敗／切換、不可用回應、法條引用及不產生假成功。
- 前端修改：空資料、503、重新整理、跨帳號及跨裝置讀取。

單元測試使用記憶體 SQLite 可驗證部分業務流程，但不能涵蓋 MySQL 欄位加密容量、collation、DDL 與連線行為。需要資料庫級驗證時使用專用 MySQL 測試資料庫。

## Lint 與文件檢查

`npm run lint` 執行 TypeScript、Oxlint 與 ESLint，後兩者含自動修正；`npm run format` 只處理指令指定的目錄。專案目前未配置 Markdownlint，文件不會自動被它檢查。

文件更新應重新產生 `reference/`，檢查相對連結、命令、資料表／路由名稱與 Markdown 表格。純文件變更不必執行可能修改原始碼的 `npm run lint`，也不代表需要呼叫真實付費服務。
