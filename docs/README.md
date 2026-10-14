# RentMate 技術文件入口

盤點基準：2026-10-08 的本機程式碼。文件說明實作與操作方式，並不代表正式環境已部署、資料庫已遷移或外部服務已驗證。

## 閱讀順序

| 目的 | 文件 |
| --- | --- |
| 第一次啟動專案 | [根目錄 README](../README.md)、[本機開發](technical/development.md) |
| 理解系統與資料流 | [架構與模組](technical/architecture.md) |
| 設定環境、服務與金鑰 | [環境設定](technical/configuration.md)、[設定名稱索引](reference/environment-inventory.md) |
| 串接與修改 API | [API 使用方式](technical/api.md)、[路由索引](reference/api-inventory.md) |
| 理解資料庫、加密與遷移 | [資料庫維護](technical/database.md)、[ORM 欄位索引](reference/data-models.md) |
| 修改登入與授權 | [驗證與安全](technical/security.md)、[多身分帳號](multi-role-auth.md) |
| 修改 OCR 與 AI | [AI 與外部整合](technical/integrations.md) |
| 驗證修改 | [測試與品質檢查](technical/testing.md) |
| 部署、備份與排錯 | [部署與維運](technical/operations.md)、[部署入口](../DEPLOYMENT.md) |
| 確認實作限制與待辦 | [實作狀態與文件維護](technical/status.md) |

## 功能文件

| 功能 | 延伸文件 |
| --- | --- |
| 後台 | [功能總覽](後台管理系統-功能總覽.md) |
| 房東工作區與邀請 | [房東功能與租客邀請](landlord-audit-and-tenant-invitation.md)（頂部更新與下方歷史盤點須分開閱讀） |
| 點交 | [儲存與影像比對](inspection-persistence.md) |
| 筆記與共居 | [筆記整合](notes-integration.md) |
| 租補 | [可行性與範圍](rentmate-subsidy-feasibility.md) |
| 合約 | [欄位順序](contract-field-order.md)、[風險政策](contract-risk-policy.md)、[風險解釋](contract-risk-explanations.md) |
| 垃圾清運 | [臺北](garbage-doc/taipei-garbage.md)、[新北](garbage-doc/new-taipei-garbage.md)、[管理功能](garbage-doc/garbage-admin-management.md)、[系統報告](garbage-doc/garbage-system-report.md) |
| 資料庫 v3 | [升級說明](database-v3-upgrade.md) |
| LLM | [本機排錯](local-llm-troubleshooting.md) |

## 目錄與文件效力

- `technical/`：依目前程式碼整理的跨模組說明與操作手冊。
- `reference/`：由來源靜態產生的 API、ORM、環境變數索引。
- `superpowers/specs/`：歷史需求與設計，不是功能已完成的證明。
- `superpowers/plans/`：歷史實作計畫，不是目前部署步驟。
- `garbage-doc/`：清運資料專用文件與報告產物。
- 根目錄的功能文件：特定模組的設計、整合或維護紀錄；先確認各文件日期及實作狀態。

若文件互相矛盾，先核對目前 router、service、ORM 與 migration；涉及實際部署時再核對部署設定及資料庫。不要直接按歷史計畫操作正式資料。

## 更新索引

在專案根目錄執行：

```powershell
python scripts/generate-tech-docs.py
```

產生器只寫入三份 `reference/` 文件，不讀取真實 `.env`、不匯入 FastAPI、不寄信、不執行資料庫遷移。它是靜態索引；API 的完整請求與回應 schema 仍以執行中的 OpenAPI 為準。
