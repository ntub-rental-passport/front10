# API 原始碼索引

列出目前 `backend/main.py` 註冊的 FastAPI 路由（177 個）及 Express 路由。

此索引由 `python scripts/generate-tech-docs.py` 靜態產生；不匯入應用程式、不連線資料庫、不讀取 `.env`。請修改來源後重新產生，避免手動修改本檔。

[返回技術文件入口](../README.md)

FastAPI 的實際請求／回應 schema 請以執行中的 `/openapi.json`、`/docs` 為準。下列依賴包含 router 層與函式簽名，仍須追查依賴函式內的角色、資源所有權及工作區檢查；空白不代表端點可匿名存取。

## main

來源：[backend/main.py](../../backend/main.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/` | `root` | — | — |
| GET | `/api/health` | `health_check` | — | — |

## admin

來源：[backend/routers/admin.py](../../backend/routers/admin.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/metrics` | `read_metrics` | Depends(get_current_admin) | — |
| GET | `/api/admin/audit` | `read_audit` | Depends(get_current_admin) | — |
| GET | `/api/admin/monitoring/events` | `read_monitoring_events` | Depends(get_current_admin) | — |
| GET | `/api/admin/users` | `list_users` | Depends(get_current_admin); Depends(get_db) | list[AdminUserRow] |
| PATCH | `/api/admin/users/{user_id}/status` | `update_user_status` | Depends(get_current_admin); Depends(get_db) | AdminUserRow |

## admin_notifications_api

來源：[backend/routers/admin_notifications_api.py](../../backend/routers/admin_notifications_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/notification-center` | `list_notifications` | Depends(get_current_admin) | — |
| POST | `/api/admin/notification-center/notes` | `send_note` | Depends(get_current_admin) | — |
| POST | `/api/admin/notification-center/read-all` | `read_all` | Depends(get_current_admin) | — |
| POST | `/api/admin/notification-center/{notification_id}/read` | `read_one` | Depends(get_current_admin) | — |
| POST | `/api/admin/notification-center/{notification_id}/unread` | `unread_one` | Depends(get_current_admin) | — |

## admin_repairs_api

來源：[backend/routers/admin_repairs_api.py](../../backend/routers/admin_repairs_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/repairs` | `list_repairs` | Depends(get_db); Depends(get_current_admin) | — |
| GET | `/api/admin/repairs/{ticket_id}` | `read_repair` | Depends(get_db); Depends(get_current_admin) | — |
| PATCH | `/api/admin/repairs/{ticket_id}` | `update_repair_notes` | Depends(get_db); Depends(get_current_admin) | — |

## admin_user_records_api

來源：[backend/routers/admin_user_records_api.py](../../backend/routers/admin_user_records_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/users/{user_id}/records` | `read_user_records` | Depends(get_db); Depends(get_current_admin) | — |

## ai_usage_api

來源：[backend/routers/ai_usage_api.py](../../backend/routers/ai_usage_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/internal/ai-usage` | `report_usage` | — | — |
| GET | `/api/admin/ai-usage` | `read_usage` | Depends(get_current_admin) | — |

## auth

來源：[backend/routers/auth.py](../../backend/routers/auth.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | `login_with_email` | Depends(get_db) | EmailLoginResponse |
| GET | `/api/auth/google/start` | `start_google_oauth` | — | — |
| GET | `/api/auth/google/callback` | `google_oauth_callback` | — | — |
| POST | `/api/auth/google/session` | `exchange_google_ticket` | Depends(get_db) | GoogleOAuthSessionResponse |
| POST | `/api/auth/google` | `verify_google_login` | — | GoogleAccountResponse |
| POST | `/api/auth/registration/start` | `start_registration` | Depends(get_db) | RegistrationPendingResponse |
| POST | `/api/auth/registration/resend` | `resend_registration_code` | Depends(get_db) | RegistrationPendingResponse |
| POST | `/api/auth/registration/verify` | `verify_registration` | Depends(get_db) | RegistrationVerifyResponse |
| GET | `/api/auth/me` | `get_me` | Depends(get_current_user); Depends(get_db) | EmailLoginResponse |
| PATCH | `/api/auth/profile` | `update_profile` | Depends(get_current_user); Depends(get_db) | EmailLoginResponse |
| POST | `/api/auth/logout` | `logout` | Depends(get_db) | — |
| POST | `/api/auth/admin/activity` | `report_admin_activity` | Depends(get_db) | — |
| POST | `/api/auth/admin/login` | `admin_login_start` | Depends(get_db) | AdminLoginChallengeResponse |
| POST | `/api/auth/admin/verify` | `admin_login_verify` | Depends(get_db) | EmailLoginResponse |

## content_api

來源：[backend/routers/content_api.py](../../backend/routers/content_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/content/public` | `read_public_content` | — | — |
| GET | `/api/admin/content` | `read_admin_content` | Depends(get_current_admin) | — |
| POST | `/api/admin/content/announcements` | `create_announcement` | Depends(get_current_admin) | — |
| PUT | `/api/admin/content/announcements/{announcement_id}` | `update_announcement` | Depends(get_current_admin) | — |
| DELETE | `/api/admin/content/announcements/{announcement_id}` | `delete_announcement` | Depends(get_current_admin) | — |
| POST | `/api/admin/content/banners` | `create_banner` | Depends(get_current_admin) | — |
| PUT | `/api/admin/content/banners/{banner_id}` | `update_banner` | Depends(get_current_admin) | — |
| DELETE | `/api/admin/content/banners/{banner_id}` | `delete_banner` | Depends(get_current_admin) | — |
| POST | `/api/admin/banner-images` | `upload_banner_image` | Depends(get_current_admin) | — |
| GET | `/api/admin/banner-images` | `list_banner_images` | Depends(get_current_admin) | — |
| GET | `/api/content/banner-images/{name}` | `read_banner_image` | — | — |
| PUT | `/api/admin/content/banner-order` | `reorder_banners` | Depends(get_current_admin) | — |
| GET | `/api/admin/notification-templates` | `read_templates` | Depends(get_current_admin) | — |
| POST | `/api/admin/notification-templates` | `create_template` | Depends(get_current_admin) | — |
| PUT | `/api/admin/notification-templates/{template_id}` | `update_template` | Depends(get_current_admin) | — |
| PATCH | `/api/admin/notification-templates/{template_id}/enabled` | `set_template_enabled` | Depends(get_current_admin) | — |
| DELETE | `/api/admin/notification-templates/{template_id}` | `delete_template` | Depends(get_current_admin) | — |

## contract

來源：[backend/routers/contract.py](../../backend/routers/contract.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/contract/analyze` | `analyze_contract` | [Depends(get_current_user)] | — |
| POST | `/api/contract/chat` | `contract_chat` | [Depends(get_current_user)] | — |
| POST | `/api/contract/finalize` | `finalize_contract` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |
| GET | `/api/contract/rentals` | `list_stored_contracts` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |
| GET | `/api/contract/rentals/{rental_id}/document` | `read_contract_document` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |

## contract_pdf

來源：[backend/routers/contract_pdf.py](../../backend/routers/contract_pdf.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/contract/export-encrypted-pdf` | `export_encrypted_pdf` | [Depends(get_current_user)] | — |

## dashboard

來源：[backend/routers/dashboard.py](../../backend/routers/dashboard.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/dashboard/contracts` | `list_contracts` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |
| PUT | `/api/dashboard/bills/{bill_id}/payment` | `record_payment` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |
| DELETE | `/api/dashboard/bills/{bill_id}/payment` | `undo_payment` | [Depends(get_current_user)]; Depends(get_db); Depends(get_current_user) | — |

## garbage

來源：[backend/routers/garbage.py](../../backend/routers/garbage.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/garbage/capabilities` | `get_capabilities` | — | — |
| GET | `/api/garbage/vehicles` | `vehicles` | — | — |
| GET | `/api/garbage/reminders` | `list_reminders` | Depends(get_current_tenant) | — |
| POST | `/api/garbage/reminders` | `add_reminder` | Depends(get_current_tenant) | — |
| PATCH | `/api/garbage/reminders/{identifier}` | `toggle_reminder` | Depends(get_current_tenant) | — |
| DELETE | `/api/garbage/reminders/{identifier}` | `delete_reminder` | Depends(get_current_tenant) | — |

## households

來源：[backend/routers/households.py](../../backend/routers/households.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/households` | `list_households` | Depends(get_current_tenant); Depends(get_db) | — |
| POST | `/api/households` | `create_household` | Depends(get_current_tenant); Depends(get_db) | — |
| POST | `/api/households/join/{invite_code}` | `join_household` | Depends(get_current_tenant); Depends(get_db) | — |
| POST | `/api/households/{household_id}/invite` | `rotate_invite` | Depends(get_current_tenant); Depends(get_db) | — |
| GET | `/api/households/{household_id}/members` | `list_members` | Depends(get_current_tenant); Depends(get_db) | — |
| POST | `/api/households/{household_id}/members` | `create_member` | Depends(get_current_tenant); Depends(get_db) | — |
| DELETE | `/api/households/{household_id}/members/{member_id}` | `remove_member` | Depends(get_current_tenant); Depends(get_db) | — |
| GET | `/api/households/{household_id}/tasks` | `list_tasks` | Depends(get_current_tenant); Depends(get_db) | — |
| POST | `/api/households/{household_id}/tasks` | `create_task` | Depends(get_current_tenant); Depends(get_db) | — |
| PATCH | `/api/households/{household_id}/tasks/{task_id}` | `update_task` | Depends(get_current_tenant); Depends(get_db) | — |
| DELETE | `/api/households/{household_id}/tasks/{task_id}` | `delete_task` | Depends(get_current_tenant); Depends(get_db) | — |

## inbox_api

來源：[backend/routers/inbox_api.py](../../backend/routers/inbox_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/admin/notifications/send` | `send_notification` | Depends(get_current_admin) | — |
| GET | `/api/admin/notifications/messages` | `admin_messages` | Depends(get_current_admin) | — |
| GET | `/api/notifications` | `my_inbox` | Depends(get_current_user) | — |
| POST | `/api/notifications/{message_id}/read` | `read_message` | Depends(get_current_user) | — |
| POST | `/api/notifications/read-all` | `read_all` | Depends(get_current_user) | — |
| POST | `/api/notifications/announcements/{announcement_id}/read` | `read_announcement` | Depends(get_current_user) | — |
| POST | `/api/notifications/announcements/dismiss` | `dismiss_announcement` | Depends(get_current_user) | — |

## inspection

來源：[backend/routers/inspection.py](../../backend/routers/inspection.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/inspection/properties` | `properties` | Depends(get_db); Depends(get_current_tenant) | — |
| GET | `/api/inspection/items` | `list_items` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/inspection/items` | `create_item` | Depends(get_db); Depends(get_current_tenant) | — |
| DELETE | `/api/inspection/items/{item_id}` | `delete_item` | Depends(get_db); Depends(get_current_tenant) | — |
| PUT | `/api/inspection/items/{item_id}/photos/{phase}` | `upload_photo` | Depends(get_db); Depends(get_current_tenant) | — |
| DELETE | `/api/inspection/items/{item_id}/photos/{record_id}` | `delete_photo` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/inspection/analyze` | `analyze_defect` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/inspection/items/{item_id}/compare` | `compare_photos` | Depends(get_db); Depends(get_current_tenant) | — |

## landlord_contracts

來源：[backend/routers/landlord_contracts.py](../../backend/routers/landlord_contracts.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/contracts` | `list_contracts` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/contracts/{lease_id}/files` | `upload_file` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/contracts/{lease_id}/files/{file_id}` | `download_file` | Depends(get_db); Depends(get_landlord_workspace) | — |
| DELETE | `/api/landlord/contracts/{lease_id}/files/{file_id}` | `delete_file` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/contracts/{lease_id}/inspection` | `lease_inspection` | Depends(get_db); Depends(get_landlord_workspace) | — |

## landlord_finance

來源：[backend/routers/landlord_finance.py](../../backend/routers/landlord_finance.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/finance/charges` | `list_charges` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/charges` | `create_charge` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/charges/{charge_id}/payments` | `record_payment` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/charges/{charge_id}/payments/{payment_id}/reverse` | `reverse_payment` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/charges/{charge_id}/void` | `void_charge` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/charges/{charge_id}/remind` | `remind_charge` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/finance/expenses` | `list_expenses` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/finance/expenses` | `create_expense` | Depends(get_db); Depends(get_landlord_workspace) | — |
| DELETE | `/api/landlord/finance/expenses/{expense_id}` | `delete_expense` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/finance/trend` | `collection_trend` | Depends(get_db); Depends(get_landlord_workspace) | — |

## landlord_properties

來源：[backend/routers/landlord_properties.py](../../backend/routers/landlord_properties.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/properties` | `list_properties` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/properties` | `create_property` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PATCH | `/api/landlord/properties/{property_id}` | `update_property` | Depends(get_db); Depends(get_landlord_workspace) | — |
| DELETE | `/api/landlord/properties/{property_id}` | `delete_property` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/properties/{property_id}/rooms` | `create_rooms` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PATCH | `/api/landlord/properties/{property_id}/rooms/{room_id}` | `update_room` | Depends(get_db); Depends(get_landlord_workspace) | — |
| DELETE | `/api/landlord/properties/{property_id}/rooms/{room_id}` | `delete_room` | Depends(get_db); Depends(get_landlord_workspace) | — |

## landlord_tenants

來源：[backend/routers/landlord_tenants.py](../../backend/routers/landlord_tenants.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/tenants` | `list_tenants` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/tenants/summary` | `tenant_summary` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/tenants/options` | `tenant_options` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/tenants/{tenant_id}` | `tenant_detail` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/tenants` | `create_tenant` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PATCH | `/api/landlord/tenants/{tenant_id}` | `update_tenant` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PATCH | `/api/landlord/tenants/{tenant_id}/lease` | `update_tenant_lease` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/tenants/{tenant_id}/renew` | `renew_lease` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/tenants/{tenant_id}/move-out` | `move_out` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/tenants/import/preview` | `import_preview` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/tenants/import/confirm` | `import_confirm` | Depends(get_db); Depends(get_landlord_workspace) | — |

## landlord_workspace_api

來源：[backend/routers/landlord_workspace_api.py](../../backend/routers/landlord_workspace_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/workspaces` | `list_workspaces` | Depends(get_db); Depends(get_current_landlord) | — |
| GET | `/api/landlord/settings` | `read_settings` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PUT | `/api/landlord/settings/profile` | `save_profile` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PUT | `/api/landlord/settings/notifications` | `save_notifications` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/audit` | `list_audit` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/team` | `list_team` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/team` | `invite_member` | Depends(get_db); Depends(get_landlord_workspace) | — |
| PATCH | `/api/landlord/team/{member_id}` | `change_role` | Depends(get_db); Depends(get_landlord_workspace) | — |
| DELETE | `/api/landlord/team/{member_id}` | `remove_member` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/team-invitations/{token}` | `preview_team_invitation` | Depends(get_db); Depends(get_current_landlord) | — |
| POST | `/api/landlord/team-invitations/{token}/accept` | `accept_team_invitation` | Depends(get_db); Depends(get_current_landlord) | — |
| GET | `/api/landlord/overview/tasks` | `overview_tasks` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/landlord/backup` | `export_backup` | Depends(get_db); Depends(get_landlord_workspace) | — |

## lease_invitations

來源：[backend/routers/lease_invitations.py](../../backend/routers/lease_invitations.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/landlord/invitations/leases/{lease_id}` | `invitation_status` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/invitations/leases/{lease_id}` | `create_invitation` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/invitations/leases/{lease_id}/revoke` | `revoke_invitation` | Depends(get_db); Depends(get_landlord_workspace) | — |
| POST | `/api/landlord/invitations/leases/{lease_id}/unbind` | `unbind_tenant` | Depends(get_db); Depends(get_landlord_workspace) | — |
| GET | `/api/invitations/{token}` | `preview_invitation` | Depends(get_db) | — |
| GET | `/api/invitations/{token}/me` | `preview_for_tenant` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/invitations/{token}/accept` | `accept_invitation` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/invitations/code-preview` | `preview_by_code` | Depends(get_db); Depends(get_current_tenant) | — |
| POST | `/api/invitations/code-accept` | `accept_by_code` | Depends(get_db); Depends(get_current_tenant) | — |

## notes

來源：[backend/routers/notes.py](../../backend/routers/notes.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/notes` | `list_notes` | Depends(get_current_user); Depends(get_db) | list[NoteResponse] |
| POST | `/api/notes` | `create_note` | Depends(get_current_user); Depends(get_db) | NoteResponse |
| PATCH | `/api/notes/{note_id}` | `update_note` | Depends(get_current_user); Depends(get_db) | NoteResponse |
| DELETE | `/api/notes/{note_id}` | `delete_note` | Depends(get_current_user); Depends(get_db) | — |

## outage

來源：[backend/routers/outage.py](../../backend/routers/outage.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/outage/notices` | `get_outage_notices` | — | — |

## password

來源：[backend/routers/password.py](../../backend/routers/password.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/password/reset/start` | `start_reset` | Depends(get_db) | — |
| POST | `/api/auth/password/reset/complete` | `complete_reset` | Depends(get_db) | — |
| POST | `/api/auth/password/change` | `change_password` | Depends(get_current_user); Depends(get_db) | — |

## platform_settings_api

來源：[backend/routers/platform_settings_api.py](../../backend/routers/platform_settings_api.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/settings/public` | `read_public_settings` | — | — |
| GET | `/api/admin/settings` | `read_admin_settings` | Depends(get_current_admin) | — |
| PUT | `/api/admin/settings` | `update_admin_settings` | Depends(get_current_admin) | — |
| GET | `/api/admin/site-settings` | `read_site_settings` | Depends(get_current_admin) | — |
| PUT | `/api/admin/site-settings` | `update_site_settings` | Depends(get_current_admin) | — |
| GET | `/api/admin/feature-outages` | `read_feature_outages` | Depends(get_current_admin) | — |
| PUT | `/api/admin/feature-outages/{feature_key}` | `close_feature` | Depends(get_current_admin) | — |
| DELETE | `/api/admin/feature-outages/{feature_key}` | `reopen_feature` | Depends(get_current_admin) | — |

## repairs

來源：[backend/routers/repairs.py](../../backend/routers/repairs.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/repairs/targets` | `list_targets` | Depends(get_db); Depends(get_current_tenant) | — |
| GET | `/api/repairs` | `list_tickets` | Depends(get_db); Depends(current_actor) | — |
| POST | `/api/repairs` | `create_ticket` | Depends(get_db); Depends(get_current_tenant) | — |
| PATCH | `/api/repairs/{ticket_id}` | `update_ticket` | Depends(get_db); Depends(current_actor) | — |
| POST | `/api/repairs/{ticket_id}/read` | `mark_read` | Depends(get_db); Depends(current_actor) | — |
| GET | `/api/repairs/{ticket_id}/photos/{photo_id}` | `read_photo` | Depends(get_db); Depends(current_actor) | — |

## scheduled_notifications

來源：[backend/routers/scheduled_notifications.py](../../backend/routers/scheduled_notifications.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/scheduled-notifications` | `list_schedules` | Depends(get_current_admin) | — |
| POST | `/api/admin/scheduled-notifications` | `create_schedule` | Depends(get_current_admin) | — |
| DELETE | `/api/admin/scheduled-notifications/{identifier}` | `cancel_schedule` | Depends(get_current_admin) | — |

## subsidy_reminders

來源：[backend/routers/subsidy_reminders.py](../../backend/routers/subsidy_reminders.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/subsidy/reminders` | `list_reminders` | Depends(get_current_tenant) | — |
| POST | `/api/subsidy/reminders` | `create_reminder` | Depends(get_current_tenant) | — |
| DELETE | `/api/subsidy/reminders/{identifier}` | `cancel_reminder` | Depends(get_current_tenant) | — |

## tenant_landlord_leases

來源：[backend/routers/tenant_landlord_leases.py](../../backend/routers/tenant_landlord_leases.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| POST | `/api/tenant/landlord-leases/charges/{charge_id}/report` | `report_payment` | Depends(get_db); Depends(get_current_tenant) | — |
| GET | `/api/tenant/landlord-leases/{lease_id}` | `lease_detail` | Depends(get_db); Depends(get_current_tenant) | — |
| GET | `/api/tenant/landlord-leases/{lease_id}/files/{file_id}` | `download_file` | Depends(get_db); Depends(get_current_tenant) | — |

## tenant_leases

來源：[backend/routers/tenant_leases.py](../../backend/routers/tenant_leases.py)

| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |
| --- | --- | --- | --- | --- |
| GET | `/api/tenant/leases` | `list_tenant_leases` | Depends(get_db); Depends(get_current_tenant) | — |

## Express OCR

來源：[server/index.js](../../server/index.js)

| 方法 | 路徑 |
| --- | --- |
| GET | `/api/health` |
| GET | `/api/ocr/review/:jobId` |
| POST | `/api/ocr` |
