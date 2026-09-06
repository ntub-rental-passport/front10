#!/usr/bin/env bash
#
# SQL Injection 退化檢查
#
# 目的：目前後端全部使用 SQLAlchemy ORM 參數化查詢，零 raw SQL，
#       這是「結構上不可能被注入」的狀態。但沒有任何機制阻止
#       日後有人為了方便加一行字串拼接的 SQL —— 那一刻防護就破了，
#       而且不會有任何警告。
#
# 這個腳本把「目前剛好沒問題」變成「退化時會被抓到」。
#
# 用法：bash deploy/check-sql-safety.sh
# 回傳：0 = 安全，1 = 發現危險寫法
#
# 建議用法：部署前執行，或設為 git pre-commit hook。

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
BACKEND="backend"
FOUND=0

echo "=========================================="
echo " SQL Injection 危險寫法檢查"
echo "=========================================="

check() {
    local desc="$1" pattern="$2"
    # 排除註解行與本腳本自身
    local hits
    hits=$(grep -rnE "$pattern" "$BACKEND" --include="*.py" 2>/dev/null \
           | grep -vE "^\s*#|:\s*#" || true)
    if [ -n "$hits" ]; then
        echo "❌ $desc"
        echo "$hits" | sed 's/^/     /'
        FOUND=1
    else
        echo "✅ $desc —— 無"
    fi
}

# 1. f-string 或 .format() 拼接 SQL 關鍵字（最危險：使用者輸入直接變成 SQL 語法）
check "f-string 拼接 SQL" \
      "(f\"|f')[^\"']*(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|DROP)"

check ".format() 拼接 SQL" \
      "\.format\([^)]*\).*(SELECT|INSERT|UPDATE|DELETE|WHERE)"

check "% 運算子拼接 SQL" \
      "(SELECT|INSERT|UPDATE|DELETE|WHERE)[^\"']*\"\s*%\s*\("

# 2. SQLAlchemy 的 text() —— 它會把字串當原生 SQL 執行，
#    若內容含使用者輸入即為注入點（配合 :param 綁定才安全）
check "SQLAlchemy text() 原生 SQL" \
      "^\s*(from sqlalchemy import.*\btext\b|.*\btext\(\s*f)"

# 3. 直接呼叫 execute()（繞過 ORM）
check "直接 execute() 原生 SQL" \
      "\.execute\(\s*(f\"|f'|\"[^\"]*(SELECT|INSERT|UPDATE|DELETE))"

# 4. 原生 DB driver 游標操作（完全繞過 ORM）
check "原生 cursor 操作" \
      "\.cursor\(\)|pymysql\.connect|MySQLdb\.connect"

echo "=========================================="
if [ "$FOUND" -eq 0 ]; then
    echo "✅ 通過：未發現危險寫法，資料庫存取全數走 ORM 參數化查詢"
    exit 0
else
    echo "❌ 發現可能的 SQL Injection 風險寫法（見上方）"
    echo
    echo "正確做法：使用 ORM 參數化查詢"
    echo "  ✅ db.query(User).filter(User.email == email).first()"
    echo "  ❌ db.execute(f\"SELECT * FROM users WHERE email='{email}'\")"
    echo
    echo "若確實必須使用原生 SQL，務必用參數綁定："
    echo "  db.execute(text(\"SELECT * FROM users WHERE email = :e\"), {\"e\": email})"
    exit 1
fi
