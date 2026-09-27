-- 管理員閒置登出：伺服器端的登入工作階段（見 models.AdminSession）。
-- main.py 啟動時的 create_all 會自動建立這張表；這個檔案留給手動建表或對照用。
CREATE TABLE IF NOT EXISTS admin_sessions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL,
  last_active_at DATETIME NOT NULL,
  INDEX ix_admin_sessions_user_id (user_id),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
