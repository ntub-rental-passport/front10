# 環境變數原始碼索引

共找到 81 個靜態設定名稱。

此索引由 `python scripts/generate-tech-docs.py` 靜態產生；不匯入應用程式、不連線資料庫、不讀取 `.env`。請修改來源後重新產生，避免手動修改本檔。

[返回技術文件入口](../README.md)

僅列出靜態字面值讀取；動態組合的 embedding 設定名稱可能未被列出。變數的用途與必要性見 [環境設定](../technical/configuration.md)，預設值以來源為準。此文件不列出任何環境中的實際值。

| 變數 | 讀取來源 |
| --- | --- |
| `AUTH_TOKEN_SECRET` | [backend/auth/security.py](../../backend/auth/security.py) |
| `BANNER_IMAGE_DIR` | [backend/admin/banner_images.py](../../backend/admin/banner_images.py) |
| `BASE_URL` | [src/components/subscription/SubscriptionCheckout.vue](../../src/components/subscription/SubscriptionCheckout.vue), [src/pages/auth/register.vue](../../src/pages/auth/register.vue), [src/pages/garbage/index.vue](../../src/pages/garbage/index.vue), [src/services/garbageApi.ts](../../src/services/garbageApi.ts) |
| `CF_ACCESS_CLIENT_ID` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py) |
| `CF_ACCESS_CLIENT_SECRET` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py) |
| `COOKIE_SECURE` | [backend/auth/security.py](../../backend/auth/security.py) |
| `CORS_ORIGINS` | [backend/main.py](../../backend/main.py) |
| `DATABASE_URL` | [backend/db/database.py](../../backend/db/database.py), [backend/routers/auth.py](../../backend/routers/auth.py) |
| `DEV` | [src/pages/admin/settings.vue](../../src/pages/admin/settings.vue), [src/services/adminAuditApi.ts](../../src/services/adminAuditApi.ts), [src/services/adminHttp.ts](../../src/services/adminHttp.ts), [src/services/adminMetricsApi.ts](../../src/services/adminMetricsApi.ts), [src/services/adminSessionApi.ts](../../src/services/adminSessionApi.ts), [src/services/adminUsersApi.ts](../../src/services/adminUsersApi.ts), [src/services/authApi.ts](../../src/services/authApi.ts), [src/services/bannerImageApi.ts](../../src/services/bannerImageApi.ts), [src/services/contractApi.ts](../../src/services/contractApi.ts), [src/services/dashboardApi.ts](../../src/services/dashboardApi.ts), [src/services/garbageApi.ts](../../src/services/garbageApi.ts), [src/services/inspectionApi.ts](../../src/services/inspectionApi.ts), [src/services/notesApi.ts](../../src/services/notesApi.ts), [src/services/repairApi.ts](../../src/services/repairApi.ts), [src/services/repairMediaStore.ts](../../src/services/repairMediaStore.ts), [src/services/scheduledNotificationApi.ts](../../src/services/scheduledNotificationApi.ts), [src/services/subsidyReminderApi.ts](../../src/services/subsidyReminderApi.ts) |
| `DEV_ADMIN_NO_2FA_EMAIL` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `DISABLE_HMR` | [vite.config.ts](../../vite.config.ts) |
| `EMBEDDING_MODEL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py) |
| `EMBEDDING_PROVIDER` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py) |
| `FASTAPI_INTERNAL_URL` | [server/index.js](../../server/index.js) |
| `FRONTEND_URL` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `GARBAGE_DATA_DIR` | [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `GOOGLE_APPLICATION_CREDENTIALS` | [backend/admin/monitoring_service.py](../../backend/admin/monitoring_service.py), [server/index.js](../../server/index.js) |
| `GOOGLE_CLIENT_ID` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `GOOGLE_CLIENT_SECRET` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `GOOGLE_CLIENT_SECRET_FILE` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `GOOGLE_OAUTH_TRUST_ENV_PROXY` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `GOOGLE_REDIRECT_URI` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `INSPECTION_UPLOAD_DIR` | [backend/routers/inspection.py](../../backend/routers/inspection.py) |
| `INSPECTION_VLM_MODEL` | [backend/routers/inspection.py](../../backend/routers/inspection.py) |
| `JWT_SECRET` | [backend/auth/security.py](../../backend/auth/security.py), [server/index.js](../../server/index.js) |
| `LANDLORD_EMAIL_ENABLED` | [backend/notifications/user_notify.py](../../backend/notifications/user_notify.py) |
| `LAW_TOP_K` | [backend/ai/law_corpus.py](../../backend/ai/law_corpus.py) |
| `LEASE_FILE_DIR` | [backend/routers/landlord_contracts.py](../../backend/routers/landlord_contracts.py) |
| `LLM_CONNECT_TIMEOUT` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `LLM_MAX_ATTEMPTS` | [backend/common/http_retry.py](../../backend/common/http_retry.py) |
| `LLM_PROVIDER_ORDER` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `LLM_TUNNEL_API_KEY` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py) |
| `LLM_TUNNEL_URL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py) |
| `LOCAL_EMBEDDING_MODEL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py) |
| `LOCAL_EMBEDDING_URL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py) |
| `LOG_LEVEL` | [backend/main.py](../../backend/main.py) |
| `NVIDIA_API_KEY` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/routers/inspection.py](../../backend/routers/inspection.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py), [backend/scripts/embed_probe.py](../../backend/scripts/embed_probe.py) |
| `NVIDIA_BASE_URL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py), [backend/scripts/embed_probe.py](../../backend/scripts/embed_probe.py) |
| `NVIDIA_CHAT_MODEL` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `NVIDIA_MODEL` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `OCR_API_PORT` | [backend/admin/monitoring_service.py](../../backend/admin/monitoring_service.py), [server/index.js](../../server/index.js) |
| `OCR_HEALTH_URL` | [backend/admin/monitoring_service.py](../../backend/admin/monitoring_service.py) |
| `OCR_MAX_FILE_COUNT` | [server/index.js](../../server/index.js) |
| `OCR_MAX_FILE_SIZE_MB` | [server/index.js](../../server/index.js) |
| `OCR_MAX_TOTAL_SIZE_MB` | [server/index.js](../../server/index.js) |
| `OCR_VISION_CONCURRENCY` | [server/index.js](../../server/index.js) |
| `OLLAMA_ANALYZE_TIMEOUT` | [backend/routers/contract.py](../../backend/routers/contract.py) |
| `OLLAMA_CHAT_MODEL` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `OLLAMA_CHAT_TIMEOUT` | [backend/routers/contract.py](../../backend/routers/contract.py) |
| `OLLAMA_CONNECT_TIMEOUT` | [backend/routers/contract.py](../../backend/routers/contract.py) |
| `OLLAMA_MODEL` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `OLLAMA_OCR_CONTEXT_LENGTH` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_OCR_ENABLED` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_OCR_MAX_CHARS` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_OCR_MODEL` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_OCR_NUM_PREDICT` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_OCR_TIMEOUT_MS` | [server/ollama-contract.js](../../server/ollama-contract.js) |
| `OLLAMA_THINK` | [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py) |
| `OLLAMA_URL` | [backend/ai/embeddings.py](../../backend/ai/embeddings.py), [backend/ai/llm_provider.py](../../backend/ai/llm_provider.py), [backend/scripts/check_llm.py](../../backend/scripts/check_llm.py), [server/ollama-contract.js](../../server/ollama-contract.js) |
| `PII_ENCRYPTION_KEY` | [backend/db/encrypted_fields.py](../../backend/db/encrypted_fields.py), [backend/migrations/upgrade_local_sqlite_v3.py](../../backend/migrations/upgrade_local_sqlite_v3.py) |
| `REPAIR_UPLOAD_DIR` | [backend/routers/repairs.py](../../backend/routers/repairs.py) |
| `SMTP_APP_PASSWORD` | [backend/admin/monitoring_service.py](../../backend/admin/monitoring_service.py), [backend/notifications/email_service.py](../../backend/notifications/email_service.py), [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py), [backend/notifications/scheduled_notification_service.py](../../backend/notifications/scheduled_notification_service.py) |
| `SMTP_FROM_EMAIL` | [backend/notifications/email_service.py](../../backend/notifications/email_service.py), [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `SMTP_FROM_NAME` | [backend/notifications/email_service.py](../../backend/notifications/email_service.py) |
| `SMTP_HOST` | [backend/notifications/email_service.py](../../backend/notifications/email_service.py), [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `SMTP_PORT` | [backend/notifications/email_service.py](../../backend/notifications/email_service.py), [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `SMTP_USERNAME` | [backend/admin/monitoring_service.py](../../backend/admin/monitoring_service.py), [backend/notifications/email_service.py](../../backend/notifications/email_service.py), [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py), [backend/notifications/scheduled_notification_service.py](../../backend/notifications/scheduled_notification_service.py) |
| `TAIPEI_GARBAGE_GPS_URL` | [backend/routers/garbage.py](../../backend/routers/garbage.py) |
| `UPSTREAM_COOLDOWN_SECONDS` | [backend/common/upstream_state.py](../../backend/common/upstream_state.py) |
| `VAPID_PRIVATE_KEY` | [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `VAPID_PUBLIC_KEY` | [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `VAPID_SUBJECT` | [backend/notifications/garbage_service.py](../../backend/notifications/garbage_service.py) |
| `VERIFICATION_CODE_EXPIRES_SECONDS` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `VERIFICATION_CODE_MAX_ATTEMPTS` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `VERIFICATION_CODE_SECRET` | [backend/auth/verification.py](../../backend/auth/verification.py) |
| `VERIFICATION_MAX_SENDS` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `VERIFICATION_RESEND_COOLDOWN_SECONDS` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `VITE_API_BASE_URL` | [src/composables/admin/useSystemHealth.ts](../../src/composables/admin/useSystemHealth.ts), [src/pages/contract/analysis.vue](../../src/pages/contract/analysis.vue), [src/pages/landlord-lease.vue](../../src/pages/landlord-lease.vue), [src/pages/outage/useOutageData.ts](../../src/pages/outage/useOutageData.ts), [src/services/adminAuditApi.ts](../../src/services/adminAuditApi.ts), [src/services/adminHttp.ts](../../src/services/adminHttp.ts), [src/services/adminMetricsApi.ts](../../src/services/adminMetricsApi.ts), [src/services/adminSessionApi.ts](../../src/services/adminSessionApi.ts), [src/services/adminUsersApi.ts](../../src/services/adminUsersApi.ts), [src/services/authApi.ts](../../src/services/authApi.ts), [src/services/bannerImageApi.ts](../../src/services/bannerImageApi.ts), [src/services/contractApi.ts](../../src/services/contractApi.ts), [src/services/dashboardApi.ts](../../src/services/dashboardApi.ts), [src/services/garbageApi.ts](../../src/services/garbageApi.ts), [src/services/inspectionApi.ts](../../src/services/inspectionApi.ts), [src/services/landlordApiClient.ts](../../src/services/landlordApiClient.ts), [src/services/landlordPropertyApi.ts](../../src/services/landlordPropertyApi.ts), [src/services/landlordTenantApi.ts](../../src/services/landlordTenantApi.ts), [src/services/leaseInvitationApi.ts](../../src/services/leaseInvitationApi.ts), [src/services/notesApi.ts](../../src/services/notesApi.ts), [src/services/repairApi.ts](../../src/services/repairApi.ts), [src/services/repairMediaStore.ts](../../src/services/repairMediaStore.ts), [src/services/scheduledNotificationApi.ts](../../src/services/scheduledNotificationApi.ts), [src/services/subsidyReminderApi.ts](../../src/services/subsidyReminderApi.ts), [src/services/tenantLeaseApi.ts](../../src/services/tenantLeaseApi.ts), [vite.config.ts](../../vite.config.ts) |
| `VITE_API_HEALTH_URL` | [src/composables/admin/useSystemHealth.ts](../../src/composables/admin/useSystemHealth.ts) |
| `VITE_GOOGLE_CLIENT_ID` | [backend/routers/auth.py](../../backend/routers/auth.py) |
| `VITE_OCR_API_URL` | [vite.config.ts](../../vite.config.ts) |
