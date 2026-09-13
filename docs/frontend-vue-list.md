# 前端 Vue 程式清單

本清單依照目前專案 `src/pages` 與 `src/components` 目錄中的 `.vue` 檔案整理，格式比照「編號、檔案名稱、功能名稱」。

## 一、前端頁面清單

| 編號 | 檔案名稱 | 功能名稱 |
| --- | --- | --- |
| 1 | `home.vue` | 首頁與平台介紹頁面 |
| 2 | `auth/login.vue` | 使用者登入頁面 |
| 3 | `auth/register.vue` | 使用者註冊頁面 |
| 4 | `auth/verify-code.vue` | 信箱驗證碼輸入頁面 |
| 5 | `auth/verify-email.vue` | 信箱驗證頁面（備用版本） |
| 6 | `auth/welcome.vue` | 新使用者歡迎與初始設定頁面 |
| 7 | `admin-dashboard.vue` | 管理後台總覽頁面 |
| 8 | `dashboard.vue` | 租屋總覽頁面 |
| 9 | `contract/index.vue` | 契約上傳與 OCR 辨識頁面 |
| 10 | `contract/ContractEditor.vue` | 契約欄位編輯與校正頁面 |
| 11 | `contract/analysis.vue` | 契約風險診斷分析頁面 |
| 12 | `contract/ContractAnalysisCombined.vue` | 契約風險完整報告頁面 |
| 13 | `subsidy/index.vue` | 租金補貼總覽頁面 |
| 14 | `subsidy/calculator.vue` | 租金補貼資格試算頁面 |
| 15 | `subsidy/apply.vue` | 租金補貼申請頁面 |
| 16 | `subsidy/progress.vue` | 租補申請進度追蹤頁面 |
| 17 | `subsidy/upload.vue` | 租補補件上傳頁面 |
| 18 | `garbage.vue` | 垃圾清運查詢頁面 |
| 19 | `handover/index.vue` | 點交清單與存證首頁 |
| 20 | `handover/baseline.vue` | 入住前點交頁面 |
| 21 | `handover/checkout.vue` | 退租前點交與比對頁面 |
| 22 | `outage.vue` | 停水停電資訊與通知設定頁面 |
| 23 | `notes/index.vue` | 記事板總覽頁面 |
| 24 | `notes/personal.vue` | 個人記事板頁面 |
| 25 | `notes/roommates.vue` | 室友協作記事板頁面 |
| 26 | `account.vue` | 我的帳戶與個人設定頁面 |

## 二、共用元件清單

| 編號 | 檔案名稱 | 功能名稱 |
| --- | --- | --- |
| 1 | `auth-layout.vue` | 驗證相關頁面版型元件 |
| 2 | `admin-layout.vue` | 後台頁面版型元件 |
| 3 | `auth-shell.vue` | 登入註冊共用容器元件 |
| 4 | `layout.vue` | 使用者端主版型與側邊欄元件 |
| 5 | `section-tabs.vue` | 模組分頁切換導覽元件 |
| 6 | `dashboard/PaymentDialog.vue` | 帳單付款對話框元件 |
| 7 | `dashboard/ConfirmDialog.vue` | 通用確認對話框元件 |
| 8 | `subsidy/Step1.vue` | 租補流程步驟一元件 |
| 9 | `subsidy/MenuCard.vue` | 租補功能選單卡片元件 |
| 10 | `subsidy/ApplicationForm.vue` | 租補申請表單元件 |
| 11 | `subsidy/Step2.vue` | 租補流程步驟二元件 |
| 12 | `subsidy/StepIndicator.vue` | 租補步驟指示器元件 |
| 13 | `handover/SmartCaptureCamera.vue` | AI 輔助拍照辨識元件 |

## 備註

- `auth/verify-code.vue` 目前有實際掛在路由中。
- `auth/verify-email.vue` 目前仍保留在專案中，但路由實際指向的是 `auth/verify-code.vue`。
- 如果要用於論文或專題報告，可直接將本文件內容複製到 Word 後再套用表格樣式。
