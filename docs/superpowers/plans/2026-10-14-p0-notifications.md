# P0 通知補齊 Implementation Plan

> **本專案分工**：程式碼由 Codex 實作（`codex-delegate`），Claude 負責寫 spec、審查 diff、自己跑測試。
> 每個 Task 結束都要有可獨立驗證的成果。

**Goal:** 補上 `docs/notification-inventory.md` 列為 P0 的 6 則通知，並補上 3 處缺少的 `action_url`。
這些都是「單向通知」—— 一方做了動作、另一方完全收不到東西。

**Architecture:** 全部走既有的 `notify_user()`（`backend/notifications/user_notify.py:41`），
不新增管道、不改共用函式、不碰前端。通知一律在觸發它的那筆交易 `db.commit()` **之前**呼叫，
動作失敗通知就不會存在（這是 `user_notify` 既有的設計，見該檔開頭的說明）。

**Tech Stack:** FastAPI + SQLAlchemy、pytest（backend/tests）

## Global Constraints

- 分支 `codex/p0-notifications`，**不 push**。完成後由 Claude 審查 diff 並自己跑測試。
- **不要修改 `backend/notifications/user_notify.py`**。它的 `source_type` 寫死 `'landlord'`，
  對帳號安全通知語意不精確 —— 這件事已知，不在本輪處理，不要順手改共用函式。
- **不要做 P1／P2 的項目**（租客端租約到期提醒、退租通知、點交通知…），不要「順手」擴大範圍。
- 收件人一律要檢查：`User` 存在且 `status == "active"` 才送；取不到就**靜默跳過**，
  絕對不可以因為「租客沒綁定帳號」就讓房東的操作失敗（唯一的例外是既有的
  `remind_charge`，它本來就回 409，維持原狀）。
- 註解用繁體中文，寫「為什麼」而不是「做了什麼」，沿用各檔原本的風格與密度。
- 文案用繁體中文、對使用者說話；標題 100 字內、內文 2000 字內（`notify_user` 會截斷，但不要靠截斷）。
- `category` 只能是 `'系統'`、`'租約'`、`'補貼'`、`'帳務'`（`user_notify.py:35` 的 `CATEGORIES`）。

### 測試基準（2026-10-14 由 Claude 實測）

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest \
  tests/test_landlord_workspace.py tests/test_repairs.py \
  tests/test_password_recovery.py tests/test_admin_user_records.py -q
```

→ **101 passed、0 failed**。驗收標準：**不新增失敗**，且各 Task 的新測試通過。

⚠️ **既有測試可能會因為新增通知而失敗**：`tests/test_landlord_workspace.py:184`、`:193`
是用 `db.query(InboxMessage).filter_by(...).count() == 1` 斷言通知數量的。
新增通知會改變這些數字。遇到時要逐一判斷是「測試需要跟著更新」還是「通知送錯對象」，
**並在回報中列出每一個被你改動的既有測試與理由**。不可以為了讓測試通過而放寬斷言。

## 總覽

| Task | 內容 | 檔案 | 依賴 |
|---|---|---|---|
| 1 | 補 3 處缺少的 `action_url` | 3 個檔案各一行 | — |
| 2 | 帳款新增／收款／沖銷／作廢 → 租客 | `routers/landlord_finance.py` | — |
| 3 | 房東更新報修 → 租客 | `routers/repairs.py` | — |
| 4 | 密碼變更、帳號停用／啟用 → 當事人 | `routers/password.py`、`routers/admin.py` | — |

四個 Task 互相獨立，但請**依序**完成並各自 commit，方便我逐一審查。

---

## Task 1：補 3 處缺少的 action_url

**背景：** 這三則通知使用者看得到標題，點下去卻沒有任何下一步。
路徑取自 `src/router/index.ts`：租客端帳務在 `/app`（dashboard，`src/services/dashboardApi.ts:73`
的繳款回報就是從那裡呼叫的）、合約審閱在 `/app/contract-analysis`（`src/pages/contract/analysis.vue`）。

**Files:**
- Modify: `backend/routers/contract_reviews.py`（約 288 行的 `notify_user`）
- Modify: `backend/routers/landlord_finance.py`（約 605 行，`remind_charge`）
- Modify: `backend/notifications/landlord_reminders.py`（約 62 行，收租自動提醒）

- [ ] **Step 1：加參數**

| 位置 | 加上 |
|---|---|
| `contract_reviews.py` 的「合約審閱紀錄將於 14 天後刪除」 | `action_url='/app/contract-analysis', action_label='查看審閱'` |
| `landlord_finance.py` 的房東手動催繳 | `action_url="/app", action_label="查看帳務"` |
| `landlord_reminders.py` 的收租自動提醒 | `action_url="/app", action_label="查看帳務"` |

沿用各檔既有的引號風格（`contract_reviews.py` 用單引號，另外兩個用雙引號）。

- [ ] **Step 2：測試**

在 `backend/tests/test_landlord_workspace.py` 既有的催繳與收租提醒測試中，
補上 `action_url` 的斷言（找出斷言 `source_label='房東催繳'` 或 `'收租提醒'` 的測試）。
`contract_reviews` 的到期通知在 `tests/test_contract_reviews.py`，同樣補斷言。

- [ ] **Step 3：Commit**

```
fix(notify): 三則通知補上 action_url，讓使用者點得進對應頁面
```

---

## Task 2：帳款變動通知租客

**背景：** 租客回報繳款會通知房東（`routers/tenant_landlord_leases.py:220`），
但房東新增帳單、確認收款、沖銷、作廢，租客**全部收不到**。
目前租客唯一會知道有一筆錢的時機，是逾期之後被催繳。

**Files:**
- Modify: `backend/routers/landlord_finance.py`
- Modify: `backend/tests/test_landlord_workspace.py`（既有的房東帳務 harness 在這裡）

**Interfaces:**
- Produces：`routers.landlord_finance._notify_tenant(db, charge, *, title, body) -> None`

- [ ] **Step 1：先寫會失敗的測試**

在 `tests/test_landlord_workspace.py` 新增一組測試（沿用該檔既有的 `self.call` / `self.ok` 寫法）：

1. 租約已綁定租客（`lease.tenant_user_id = TENANT`）時，
   `POST /api/landlord/finance/charges` 後，`TENANT` 收到一則 `category='帳務'` 的通知，
   且 `action_url == '/app'`。
2. `POST /charges/{id}/payments` 後租客再收到一則，內文含剩餘未繳金額。
3. 收款全額付清時，內文要說「已收齊」而不是「尚餘 NT$0」。
4. `POST /charges/{id}/payments/{pid}/reverse` 後租客收到一則，內文含沖銷原因。
5. `POST /charges/{id}/void` 後租客收到一則，內文含作廢原因。
6. **租約沒有綁定租客**（`tenant_user_id` 為 None）時，上述四個端點全部正常回 2xx，
   且**完全不產生** `InboxMessage` —— 這條是迴歸測試，防止有人把靜默跳過寫成拋例外。

- [ ] **Step 2：確認測試失敗**，再實作。

- [ ] **Step 3：實作共用函式**

放在 `_email_enabled()`（約 443 行）附近：

```python
def _notify_tenant(db: Session, charge: LandlordCharge, *, title: str, body: str) -> None:
    """帳款變動時通知已綁定帳號的租客。

    沒綁定帳號或帳號已停用就靜默跳過：房東的入帳、作廢是帳務動作，
    不能因為租客還沒接受邀請就失敗（`remind_charge` 回 409 是另一回事 ——
    那個端點的目的本來就是「送出提醒」，送不出去必須讓房東知道）。
    """
    lease = charge.lease
    tenant_user = db.get(User, lease.tenant_user_id) if lease.tenant_user_id else None
    if not tenant_user or tenant_user.status != "active":
        return
    notify_user(
        db, tenant_user, title=title, body=body,
        category="帳務", source_label="帳款異動", created_by=f"landlord:{charge.landlord_id}",
        action_url="/app", action_label="查看帳務",
    )
```

`notify_user` 的 import 沿用該檔現有的寫法（檔案頂端已經 import 過，照用即可）。

- [ ] **Step 4：接上四個端點**（都放在該端點既有的 `db.commit()` **之前**）

| 端點 | 標題 | 內文 |
|---|---|---|
| `create_charge`（約 500 行） | `f"新增{KIND_LABELS[payload.kind]}：{payload.title.strip()} {_money(payload.amount)}"` | `f"{lease.property.name} {lease.room.number} 的{payload.title.strip()} {_money(payload.amount)}，請在 {payload.due_date.isoformat()} 前繳款。"` |
| `record_payment`（約 525 行） | `f"房東已確認收款 {_money(payload.amount)}"` | 含房號、帳款名稱、入帳金額；**餘額 0 時寫「這筆帳款已收齊」，否則寫「尚餘 {_money(餘額)} 未繳」**（餘額 = `balance - payload.amount`，`balance` 是函式裡既有的變數） |
| `reverse_payment`（約 550 行） | `f"房東沖銷了一筆收款 {_money(original.amount)}"` | 含帳款名稱、沖銷金額、`payload.reason.strip()`，並說明這筆金額回到未繳 |
| `void_charge`（約 571 行） | `f"帳款已作廢：{charge.title}"` | 含房號、金額、`payload.reason.strip()`，並說明不需要再繳 |

**`create_charge` 只處理手動建立的水電與其他費用** —— 租金是 `ensure_rent_charges()`（約 288 行）
自動產生的，**不要**在那裡加通知：每月自動產生的租金已經有收租提醒（到期前 3 天／當天／逾期），
再加一則只會變成洗頻。

- [ ] **Step 5：驗證**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_landlord_workspace.py -q
```

- [ ] **Step 6：Commit**

```
feat(notify): 房東新增帳單、收款、沖銷、作廢時通知租客
```

---

## Task 3：房東更新報修時通知租客

**背景：** 租客報修會通知房東（`routers/repairs.py:661`），但房東受理、完工、取消、
要求補件、上傳照片，**租客一則都收不到**（`update_ticket`，約 717 行）。
報修的去程有通知、回程沒有。

**Files:**
- Modify: `backend/routers/repairs.py`
- Modify: `backend/tests/test_repairs.py`

- [ ] **Step 1：先寫會失敗的測試**

1. 房東把狀態改成 `processing` → 租客收到「已受理」通知，`action_url == '/app/repairs'`。
2. 房東把狀態改成 `inspection` → 租客收到「請驗收」通知。
3. 房東把狀態改成 `canceled` → 租客收到「已取消」通知。
4. 房東要求補件（`supplementRequested` 為真）→ 租客收到補件通知，內文含補件說明。
5. 房東上傳維修照片（`payload.photos` 有值）但狀態沒變 → 租客收到照片通知。
6. **房東只改了廠商電話之類的欄位 → 不送通知**（防洗頻）。
7. **租客自己更新自己的工單 → 不送通知給自己**。
8. 一次請求最多只送一則（同時改狀態又上傳照片時，只送狀態那一則）。

- [ ] **Step 2：確認測試失敗**，再實作。

- [ ] **Step 3：實作**

在 `_notify_landlord_of_new_ticket()`（約 648 行）下方新增對應的函式，判斷規則：

- **只有 `role == "landlord"` 才送**（租客改自己的工單不通知自己）
- 收件人是 `ticket.tenant_user_id` 對應的 `User`，`status == "active"` 才送
- 優先序取**一則**：狀態變更 > 補件要求 > 新增照片；都不符合就不送
- 狀態變更要比對「真的變了」：在 `_apply_updates()` 之前先存下 `ticket.status`

| 觸發 | 標題 |
|---|---|
| → `processing` | `房東已受理你的報修` |
| → `inspection` | `維修已完成，請確認驗收` |
| → `canceled` | `房東取消了這筆報修` |
| 要求補件 | `房東請你補充報修資料`（內文帶 `supplementRequestNote`，截到 120 字） |
| 新增照片 | `房東上傳了維修照片` |

內文一律帶上設備或位置（`ticket.equipment or ticket.location or '設備'`）讓人認得出是哪一筆。
`category='系統'`、`source_label='報修通知'`（沿用新報修那則的分類）、
`action_url='/app/repairs'`、`action_label='查看報修'`、`created_by=f"landlord:{user.id}"`。

呼叫位置：`update_ticket` 的 `try` 區塊內、`db.commit()` 之前。

→ `pending` 不送（房東把狀態改回 pending 不是對租客有意義的進展）。

- [ ] **Step 4：驗證**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_repairs.py tests/test_landlord_workspace.py -q
```

- [ ] **Step 5：Commit**

```
feat(notify): 房東更新報修狀態、要求補件、上傳照片時通知租客
```

---

## Task 4：帳號安全通知

**背景：** 密碼變更、密碼重設完成、後台停用／啟用帳號，當事人**一則通知都沒有**。
被盜用時，這是唯一的察覺機會。

**Files:**
- Modify: `backend/routers/password.py`（`complete_reset` 約 145 行、`change_password` 約 173 行）
- Modify: `backend/routers/admin.py`（`update_user_status` 約 322 行）
- Modify: `backend/tests/test_password_recovery.py`、`backend/tests/test_admin_user_records.py`
  （如果後者的 harness 不方便測帳號狀態，改用 `tests/` 裡實際涵蓋 `update_user_status` 的那個檔案；
  請先 grep 確認，不要新建一套重複的 harness）

- [ ] **Step 1：先寫會失敗的測試**

1. `POST /api/auth/password/change` 成功後，該使用者有一則 `category='系統'` 的通知。
2. `POST /api/auth/password/reset/complete` 成功後同上（文案要能分辨是「重設」不是「變更」）。
3. 密碼**驗證失敗**時（目前密碼不對、驗證碼錯）**不產生**任何通知。
4. `PATCH /api/admin/users/{id}/status` 停用 → 當事人有一則通知。
5. 同一端點啟用 → 當事人有另一則通知，文案不同。

- [ ] **Step 2：確認測試失敗**，再實作。

- [ ] **Step 3：實作**

密碼兩處：在 `_replace_password(...)` 之後、`db.commit()` 之前呼叫 `notify_user`：

- `category='系統'`、`source_label='帳號安全'`、`created_by='system'`
- `action_url='/app/account'`、`action_label='帳戶設定'`
- `email=True` —— 這是安全性通知，使用者可能根本進不來看站內訊息。
  （實際會不會寄仍取決於 `LANDLORD_EMAIL_ENABLED` 與 SMTP 設定，見 `user_notify.py:33`；
  開發機預設關閉，所以測試不會真的寄信。）
- 內文要明確寫「如果不是你本人操作，請立刻重設密碼」

後台停用／啟用（`admin.py`）：

- `category='系統'`、`source_label='帳號狀態'`、`created_by=f"admin:{admin.id}"`、`email=True`
- **停用不要給 `action_url`** —— 被停用的人登不進來，給連結只會讓人撞牆
- 啟用給 `action_url='/app'`
- 放在該端點既有的 `db.commit()` 之前

- [ ] **Step 4：驗證**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest \
  tests/test_password_recovery.py tests/test_admin_user_records.py tests/test_admin_iso.py -q
```

- [ ] **Step 5：Commit**

```
feat(notify): 密碼變更與帳號停用、啟用時通知當事人
```

---

## 完成條件

- [ ] 四個 Task 各自 commit，分支 `codex/p0-notifications`，未 push
- [ ] 基準的四個測試檔不新增失敗（基準：101 passed、0 failed）
- [ ] 回報中列出**每一個被改動的既有測試**與改動理由
- [ ] 沒有修改 `user_notify.py`、沒有碰前端、沒有做 P1／P2 的項目
- [ ] 回報中列出每一則新通知的最終文案（標題與內文），方便 Claude 一次審完
