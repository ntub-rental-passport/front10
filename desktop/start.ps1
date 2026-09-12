# RentMate 桌機代理 啟動腳本（Windows PowerShell）
#
# 做四件事：建虛擬環境 → 裝套件 → 讀 .env → 啟動代理
# 每一步都可以重複執行，已經做過的會跳過。
#
# 用法（在 desktop 資料夾按右鍵「在終端中開啟」後）：
#     powershell -ExecutionPolicy Bypass -File .\start.ps1
# 或直接點兩下 start.bat

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "=== RentMate 桌機代理 ===" -ForegroundColor Cyan

# ---- 1. 找 Python ----
$python = $null
foreach ($candidate in @("py", "python")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) { $python = $candidate; break }
}
if (-not $python) {
    Write-Host "找不到 Python。請先安裝 Python 3.11 以上：https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "安裝時記得勾選 Add python.exe to PATH" -ForegroundColor Yellow
    Read-Host "按 Enter 結束"; exit 1
}

# ---- 2. 虛擬環境 ----
# 用 venv 而不是直接裝進系統 Python：這台電腦上的其他專案
# 不會被這裡的套件版本影響，要重來時砍掉 .venv 就好。
if (-not (Test-Path ".venv")) {
    Write-Host "`n[1/3] 建立虛擬環境…" -ForegroundColor Green
    & $python -m venv .venv
}
$venvPython = ".\.venv\Scripts\python.exe"

# ---- 3. 套件 ----
# 用標記檔記錄「裝過了」，免得每次啟動都跑一次 pip（第一次要下載約 300MB）
$marker = ".venv\.installed"
$needInstall = -not (Test-Path $marker)
if (-not $needInstall) {
    $needInstall = (Get-Item "requirements.txt").LastWriteTime -gt (Get-Item $marker).LastWriteTime
}
if ($needInstall) {
    Write-Host "`n[2/3] 安裝套件（第一次約需 5-10 分鐘，要下載 PyTorch）…" -ForegroundColor Green
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { Write-Host "套件安裝失敗" -ForegroundColor Red; Read-Host "按 Enter 結束"; exit 1 }
    New-Item -ItemType File -Path $marker -Force | Out-Null
} else {
    Write-Host "`n[2/3] 套件已安裝，略過" -ForegroundColor DarkGray
}

# ---- 4. 讀 .env ----
if (-not (Test-Path ".env")) {
    Write-Host "`n找不到 .env" -ForegroundColor Red
    Write-Host "請複製 .env.example 成 .env，並填入 LLM_TUNNEL_API_KEY" -ForegroundColor Yellow
    Write-Host "產生一把鑰匙：" -ForegroundColor Yellow
    Write-Host "    $venvPython -c `"import secrets; print(secrets.token_urlsafe(32))`"" -ForegroundColor White
    Read-Host "按 Enter 結束"; exit 1
}
Get-Content ".env" -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

# ---- 5. 確認 Ollama 在跑 ----
# 先問一句，免得代理起來了才發現生成那條路是斷的
$ollamaUrl = [Environment]::GetEnvironmentVariable("OLLAMA_URL")
if (-not $ollamaUrl) { $ollamaUrl = "http://127.0.0.1:11434" }
try {
    Invoke-WebRequest -Uri "$ollamaUrl/api/tags" -TimeoutSec 3 -UseBasicParsing | Out-Null
    Write-Host "`n[3/3] Ollama 正常（$ollamaUrl）" -ForegroundColor Green
} catch {
    Write-Host "`n[3/3] ⚠️  連不上 Ollama（$ollamaUrl）" -ForegroundColor Yellow
    Write-Host "    代理仍會啟動（embedding 可以用），但生成會失敗。" -ForegroundColor Yellow
    Write-Host "    Ollama 裝好後通常會自動在背景執行；沒有的話開一個視窗跑 ollama serve" -ForegroundColor Yellow
}

Write-Host "`n啟動中… 按 Ctrl+C 停止`n" -ForegroundColor Cyan
& $venvPython proxy.py
Read-Host "`n代理已停止。按 Enter 關閉視窗"
