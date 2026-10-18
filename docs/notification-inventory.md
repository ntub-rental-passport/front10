# 通知盤點：現在送什麼、該送什麼

盤點日期：2026-10-14。依據本機程式碼（`backend/notifications/`、`backend/routers/`）實際核對，
未連線正式資料庫、未實際觸發任何一則通知。這份文件是「決定要補什麼」的依據，不是已完成清單。

## 一、通知怎麼送出去

| 管道 | 進入點 | 現況 |
| --- | --- | --- |
| 站內 | `notify_user()`（`backend/notifications/user_notify.py:41`） | 寫進 `inbox_messages`，跟觸發它的動作同一筆交易；動作 rollback 通知就不存在 |
| Email | 同上，`email=True` 時 | 需 `LANDLORD_EMAIL_ENABLED=true` 且 SMTP 有設定（`user_notify.py:33`）；commit 後背景寄 |
| 瀏覽器推播 | 只有垃圾車（`backend/notifications/garbage_service.py:151`） | `notify_user()` 永遠寫 `push_state=None`，**一般通知完全不會推播** |
| 後台群發 | `backend/notifications/inbox_service.py`、`scheduled_notification_service.py` | 管理員手動或排程發送，與下面的業務通知不同路 |

排程由 `backend/main.py:59` 的迴圈驅動，`BACKGROUND_JOBS_ENABLED` 為真才啟動
（`docker-compose.yml:51` 在正式環境設為 `"true"`，開發機預設關閉）：

- 每 20 秒：垃圾車提醒、後台排程通知
- 每小時：房東收租／合約到期提醒、合約審閱到期、補助文件到期

## 二、現在實際會送的通知（全部 16 個事件型觸發點）

### 送給租客

| 事件 | 觸發點 | 連結 |
| --- | --- | --- |
| 房東修改租約條件 | `routers/contract_links.py:141`（由 `landlord_tenants.py:445`／`:476` 呼叫） | `/app` |
| 房東說明合約與租約的差異 | `routers/contract_links.py:342` | `/app` |
| 電費對帳 | `routers/utility_evidence.py:246` | `/app` |
| 補助文件 14 天後刪除 | `routers/subsidy_files.py:175` | `/app/subsidy` |
| 合約審閱紀錄 14 天後刪除 | `routers/contract_reviews.py:288` | **無** |
| 房東手動催繳 | `routers/landlord_finance.py:605` | **無** |
| 收租自動提醒（前 3 天／當天／逾期隔天） | `notifications/landlord_reminders.py:62` | **無** |
| 停水停電自動提醒（每小時：未來 24 小時計畫停電／首次發現停水公告；站內＋推播） | `notifications/outage_reminders.py` | `/app/outage` |

### 送給房東

| 事件 | 觸發點 | 連結 |
| --- | --- | --- |
| 新報修 | `routers/repairs.py:661` | `/landlord/maintenance` |
| 租客接受租約邀請 | `routers/lease_invitations.py:284` | `/landlord/tenants` |
| 租客回報已繳款 | `routers/tenant_landlord_leases.py:220` | `/landlord/finance` |
| 租客對帳款提出異議 | `routers/contract_links.py:304` | `/landlord/finance` |
| 租客合約與登記租約不同 | `routers/contract_links.py:256` | `/landlord/contracts` |
| 租客回報的電表讀數不同 | `routers/utility_evidence.py:297` | `/landlord/finance` |
| 被邀請加入工作區／成員已加入 | `routers/landlord_workspace_api.py:233`、`:315` | `/landlord/settings/team` |
| 租約到期提醒（剩 N 天與 7 天） | `notifications/landlord_reminders.py:93` | `/landlord/contracts` |

## 三、缺口

### P0：單向通知，對方被蒙在鼓裡

| 缺的通知 | 該掛在哪 | 為什麼是 P0 |
| --- | --- | --- |
| 房東更新報修狀態（受理／施工／完工／補照片／留言）→ 租客 | `routers/repairs.py:717` `update_ticket` | 去程有通知、回程沒有。租客報修後只能自己回去翻 |
| 房東新增帳單 → 租客 | `routers/landlord_finance.py` `create_charge` | 現在租客只有在「逾期被催繳」時才知道有這筆錢 |
| 房東登記收款／沖銷收款 → 租客 | 同上 `record_payment`、`reverse_payment` | 租客回報繳款會通知房東，房東確認入帳卻不會回頭通知租客 |
| 房東作廢帳單 → 租客 | 同上 `void_charge` | 金額變動卻無聲 |
| 密碼變更／重設完成 → 本人 | `routers/password.py:145`、`:173` | 帳號安全的基本通知，被盜用時這是唯一的察覺機會 |
| 後台停用／啟用帳號 → 當事人 | `routers/admin.py` `update_user_status` | 使用者只會發現自己突然登不進去 |

### P1：有明確對象、少了會造成誤會

| 缺的通知 | 該掛在哪 |
| --- | --- |
| 租客端的租約到期提醒 | `notifications/landlord_reminders.py:75`（目前只通知房東） |
| 房東登記退租 → 租客 | `routers/landlord_tenants.py` `move_out`（`record_term_change` 不涵蓋退租） |
| 解除租客綁定／撤銷邀請 → 租客 | `routers/lease_invitations.py` `unbind_tenant`、`revoke_invitation` |
| 建立租約邀請 → 租客 | `routers/lease_invitations.py:135`：現在既不寄信也不發站內通知，房東得自己把網址轉給租客；租客若已有帳號，可以直接發 |
| 房東上傳合約檔／電表照 → 租客 | `routers/landlord_contracts.py` `upload_file`、`routers/utility_evidence.py` `landlord_add_meter_photo` |
| 工作區改角色／移除成員 → 當事人 | `routers/landlord_workspace_api.py` `change_role`、`remove_member` |
| 功能維護關閉 → 受影響使用者 | `routers/platform_settings_api.py` `close_feature` |

### P2：要先有產品決定才做得下去

| 缺的通知 | 卡在哪 |
| --- | --- |
| 點交照片上傳／比對完成 → 房東 | `routers/inspection.py` 全部端點都是 `Depends(get_current_tenant)`，房東根本沒有讀取路徑（見 device-policy 計畫的擱置決策 P1） |
| 共居的室友事件（加入、家務指派） | `routers/households.py` 完全沒有通知，但室友之間要不要互相通知是產品決定 |
| 新裝置登入提醒 | 需要先有裝置識別與「這是我」的流程 |

### 結構性問題（跟個別通知無關）

1. **租客沒有通知偏好**。只有 `LandlordSettings`（`db/models.py:609`）有 `rent_reminders`、
   `contract_reminders`、`email_notifications`。租客收不收得到收租提醒，取決於**房東**的開關。
2. **三則通知點了跳不動**（上表標「無」者），使用者看到標題卻沒有下一步。
3. **推播形同不存在**。`inbox_messages.push_state` 欄位已經有了，但業務通知從不寫入，
   只有垃圾車自己走另一條路發 Web Push。

## 四、建議的實作順序

1. 補 P0 的 6 則 + 把 3 處缺少的 `action_url` 補上（純後端，一個 Task）
2. 補 P1（含租客端租約到期提醒，要先決定由誰的偏好控制）
3. 推播接上 `notify_user()`（相依於上面兩步，決定了要推哪些類別）
4. 租客通知偏好表（不做的話第 1、2 步送出的通知無法關閉）

P2 的三項先不排程，等對應的產品決定。
