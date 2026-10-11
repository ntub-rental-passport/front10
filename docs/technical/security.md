# 登入、權限與資料安全

核對日期：2026-10-08。[返回入口](../README.md)

## 身分與兩套憑證

帳號以 `users` 為主體，`user_roles` 管理 tenant／landlord 等身分。一般登入與管理員登入是不同流程；多身分細節見 [帳號說明](../multi-role-auth.md)。

[`backend/auth/security.py`](../../backend/auth/security.py) 並存兩套憑證：cookie 為 HS256 JWT，Bearer 為 Base64 payload 加 HMAC-SHA256 的自訂格式。登入同時簽發；前端 `useAuth.ts` 將 session 與 Bearer 狀態保存於 localStorage，cookie 是 HttpOnly、SameSite=Lax，Secure 由環境設定決定。

HttpOnly 只避免 JavaScript 直接讀取該 cookie；前端仍保存 Bearer，因此不能宣稱整個系統沒有可被 script 讀取的憑證。正式環境需配合 HTTPS、正確來源與部署層防護，相關部署設定不在此儲存庫。

## 後端守門

- Cookie 驗證會核對簽章、期限、帳號存在、角色、停用狀態及密碼變更時間。
- Bearer 的角色守門員同樣要核對帳號與目前權限；不要只信 payload 中的 role。
- 管理員使用獨立郵件驗證碼流程與 `admin_sessions`；固定期限與閒置限制由相關設定／程式控制。
- 房東團隊可指定 `X-Landlord-Workspace`，由 `auth/landlord_workspace.py` 驗證成員及權限；manager、accounting、viewer 的範圍以該模組為準。
- 租約、工單、點交照片及附件必須驗證資料所有權；取得 ID 不代表獲得讀取權。

前端 `router.beforeEach`、管理員選單與維護模式可控制頁面進入，不能替代後端安全檢查。新增操作應測試匿名、錯誤角色、其他帳號與其他工作區的請求。

## 密碼與驗證碼

帳密使用 Argon2 雜湊。一般註冊與密碼重設有不同的期限／次數設定，不可混為一套：密碼重設目前為 10 分鐘期限、60 秒重送冷卻、最多 5 次嘗試與 5 次寄送；完整判斷見 `routers/password.py`。

密碼重設限符合條件的已驗證一般帳密帳號。Google-only 帳號不因此新增密碼登入方式，管理員不走此自助流程。重設開始回覆一般訊息以避免直接透露帳號存在；寄信服務不可用仍可能回 503。

密碼變更更新 `password_changed_at`，舊 cookie／Bearer 需失效；相關 challenge 與管理員 session 也清理。OCR 不只本機驗證 JWT，還向 FastAPI `/api/auth/me` 複查，因此後端不可用時不繼續辨識。

## 服務憑證與資料流

OCR 回報用量用 `X-Service-Token`，payload 必須有 `svc=ocr`。使用者 cookie 與服務憑證雖共用簽章金鑰，驗證用途不同，不能互換。內部 API 同樣需做用途檢查。

個資欄位用 AES-GCM 加密，見 [資料庫文件](database.md)。OCR 原始文件會送 Google Vision；背景複核、合約分析與點交 VLM 的傳輸範圍見 [整合說明](integrations.md)。不能將「DB 加密」或「原始 OCR 不落地」延伸為「所有資料均不離開伺服器」。

## 開發例外與維護邊界

`DEV_ADMIN_NO_2FA_EMAIL` 是本機測試例外，有資料庫主機守衛；正式環境不應配置。驗證次數與部分防護狀態存在程序記憶體，多程序／重啟時的效果須重新評估。

本文件記錄目前機制，不是已完成的滲透測試或安全認證。後續需核對部署層限流、跨來源策略、日誌個資、金鑰管理與多程序狀態；目前未對實際正式環境作驗證。
