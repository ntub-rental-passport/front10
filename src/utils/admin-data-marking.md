# 後台的資料標記約定

**標的是「真實」，不是「展示」。**

真實資料區塊的根元素加 `data-real="true"`，其餘一律視為展示資料。

以**正式站的來源**決定標記：正式站只有真實資料的區塊就標 `data-real`，
即使本地開發會疊加展示資料也一樣。使用者目錄、總覽使用者統計、押金統計與
合併稽核都屬於這一類；註解須註明本地會疊加展示資料。

展示資料統一由 `isAdminDemoEnabled()`（`import.meta.env.DEV`）控制。
正式站的展示 collection 與展示用量為空，進入後台時清除舊版留下的
`rentmate-admin:*`；後端系統設定不受此開關影響。

```bash
grep -rn 'data-real' src/pages/admin/ src/components/admin/
```

## 為什麼標真實來源

後台的帳號、工單、押金、稽核與監控已接後端；訂閱與收款尚未串接金流，
正式站沒有展示資料可填補。標記仍採保守預設，關鍵在**漏標時的預設方向**：

| 漏標一個展示區塊 | 結果 |
|---|---|
| 用 `data-demo`（標展示） | 它被當成真的 —— **危險** |
| 用 `data-real`（標真實） | 它被當成假的 —— 保守但安全 |

這個約定是在實作中反轉的：原本規定標
`data-demo`，做完發現 9 個展示區塊只標到 2 個。

## 目前標了哪些

| 位置 | 內容 |
|---|---|
| `pages/admin/index.vue` | 系統健康條（`/api/admin/metrics`）、使用者總數／成長／組成／活躍／停用與最近登入（`/api/admin/users`）、押金 KPI／對帳圖（`/api/admin/deposits`）、最新稽核（`useAuditLog`）、AI 額度（`/api/admin/ai-usage`）；使用者統計、押金與稽核在本地疊加展示資料 |
| `pages/admin/monitoring.vue` | AI 額度用量（`/api/admin/ai-usage`，OCR 服務回報的 Vision 頁數） |
| `pages/admin/users.vue` | 四格真實帳號 KPI、註冊來源分布 |
| `pages/admin/user-detail.vue` | 押金對帳、點交存證：只有真實帳號才標（`/api/admin/users/{id}/records`），展示帳號是示範資料 |
| `pages/admin/maintenance-tickets.vue`、`components/admin/TicketDetailPanel.vue` | 真實報修工單（`/api/admin/repairs`） |

表格列的是目前已有標記的區塊，不代表所有後端來源都已補標。
新增或切換來源時問一句：正式站這個數字是從後端來的嗎？是就加 `data-real`。
收款與訂閱到期預覽沒有後端來源，正式站顯示空狀態；真實帳號方案維持角色對應的 Free。

## 畫面上不標

使用者要求畫面乾淨，所以不會出現「展示資料」字樣。標記只存在於程式碼裡，
供日後稽核。這表示**註解要寫清楚資料來源**，否則稽核的人只能自己追。
