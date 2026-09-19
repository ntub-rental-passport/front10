"""Build the offline report and UTF-8 BOM file inventory using only stdlib."""
import csv
import html
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
report = DOCS / 'garbage-system-report.md'

shared = {
    'src/router/index.ts': ('共用整合', '清運頁面路由與舊路徑重新導向'),
    'src/composables/useNavigation.ts': ('共用整合', '垃圾清運功能導覽入口'),
    'src/composables/useAuth.ts': ('共用整合', '登入 session、accessToken、帳號識別'),
    'src/utils/feature-routes.ts': ('共用整合', '清運功能維護開關的路由對應'),
    'src/components/layouts/AppLayout.vue': ('共用整合', '頁面容器、導覽與捲動區域'),
    'backend/main.py': ('共用整合', '註冊 API、啟動每 20 秒提醒排程'),
    'backend/security.py': ('共用整合', '正式租客身分與 Bearer token 驗證'),
    'backend/database.py': ('共用整合', '既有 SQLAlchemy 帳號資料庫連線'),
    'backend/models.py': ('共用整合', 'users、user_roles 等既有帳號模型；非清運班表模型'),
    'backend/requirements.txt': ('設定與依賴', 'FastAPI、SQLAlchemy、requests、推播等後端依賴'),
    'package.json': ('設定與依賴', '前端依賴、開發／建置／測試指令'),
    'package-lock.json': ('設定與依賴', '前端安裝版本鎖定'),
    'vite.config.ts': ('設定與依賴', 'API 代理、Vue／Vite 與測試設定'),
    '.env.example': ('設定與依賴', '環境設定範例；真實 .env 不交付'),
    '.gitignore': ('設定與依賴', '排除 DB、憑證與建置產物等'),
    'src/mocks/admin/subscription.ts': ('周邊功能登錄', '管理端方案 mock 的垃圾清運功能項目'),
}
for name in ['admin-feature-status', 'admin-entitlements', 'feature-routes',
             'maintenance-toast-diff', 'admin-user-directory']:
    shared[f'src/utils/{name}.test.ts'] = ('周邊測試', '功能登錄、維護或權限測試中的 garbage 案例；非清運核心演算法')

descriptions = {
    'index.vue': '清運頁面總控、查詢模式、定位、看板、詳情、收藏與提醒',
    'garbage.css': '清運頁面、固定頁首、資訊卡、列表與響應式排版',
    'GarbageMap.vue': '地圖、路線搜尋與站序、霓虹實線、拖曳、隱藏及畫布同步',
    'GarbageFilters.vue': '縣市、行政區、里、道路、日期與時段篩選',
    'CollectionCountdown.vue': '垃圾／回收／廚餘獨立倒數與展開內容',
    'WeeklySchedule.vue': '站點每週清運班表',
    'GarbageGuide.vue': '操作指引',
    'GarbageReport.vue': '建立 GitHub Issue 草稿連結，不直接送出',
    'garbageApi.ts': '靜態資料載入與 Bearer 清運 API client',
    'garbage.ts': '資料型別、兩市解析、座標、ID、時間與距離',
    'garbage-status.ts': '15 分鐘即將抵達及快速篩選判定',
    'garbage-countdown.ts': '分類班表、週期、下一班與跨午夜計算',
    'garbage-routes.ts': '路線分組、官方站序／時間排序及斷線示意',
    'garbage.py': '能力／車輛 API 與受保護提醒 CRUD',
    'garbage_service.py': '班表快取、SQLite schema、提醒驗證與通知派送',
    'garbage-sw.js': 'Web Push 接收與通知點擊入口',
    'taipei-garbage.csv': '臺北原始班表快照，4,010 筆',
    'new-taipei-garbage.json': '新北原始班表快照，26,655 筆',
    'taipei-garbage-source.json': '臺北來源與匯入摘要',
    'new-taipei-garbage-source.json': '新北來源、checksum 與匯入摘要',
    'verify-garbage-browser.mjs': 'Chrome 模擬操作、API mock、路線與地圖圖層回歸驗證',
    'verify-garbage-scroll.mjs': '捲動與不同像素比例的畫布尺寸驗證',
    'update-taipei-garbage.ts': '臺北資料下載、品質檢查及快照更新',
    'update-new-taipei-garbage.ts': '新北分頁資料下載、品質檢查及快照更新',
    'update-taipei-garbage.yml': '每月更新兩市資料、測試建置及建立 PR',
    'garbage-data.yml': 'GitHub 清運資料回報表單範本，含問題類型、站點與觀察說明',
    'garbage.test.ts': '臺北 CSV、資料品質、時間、座標、距離與 GPS 新鮮度',
    'new-taipei-garbage.test.ts': '新北解析、官方站序、分類服務日與估計離站',
    'garbage-status.test.ts': '15 分鐘狀態門檻、整分鐘離站、快速篩選與跨日',
    'garbage-countdown.test.ts': '下一班、分類收運、服務日與跨午夜倒數',
    'garbage-routes.test.ts': '路線分組、排序與缺少座標時的斷線',
    'garbage-update.test.ts': '政府資料更新驗證與拒絕異常資料',
    'test_garbage.py': '提醒擁有者隔離、服務日、原子領取、傳送狀態與推播端點驗證',
    'build-garbage-report.py': '重建 HTML 系統報告與 CSV 分類索引',
}

tracked = subprocess.check_output(['git', 'ls-files'], cwd=ROOT).decode('utf-8').splitlines()
paths = set(shared)
for path in tracked:
    name = Path(path).name
    if 'garbage' in path.lower() or name in ['WeeklySchedule.vue', 'CollectionCountdown.vue']:
        paths.add(path)
paths.update(['docs/garbage-system-report.md', 'docs/garbage-system-report.html',
              'docs/garbage-file-inventory.csv', 'scripts/build-garbage-report.py'])
runtime = 'backend/garbage-reminders.db'
if (ROOT / runtime).exists():
    paths.add(runtime)

rows = []
for path in sorted(paths):
    name = Path(path).name
    category, purpose = shared.get(path, ('', descriptions.get(name, '')))
    if not category:
        if path.endswith('.db'):
            category, purpose = '執行期資料（不交付）', 'SQLite 提醒資料；僅盤點路徑，未讀取內容'
        elif path.startswith('docs/'):
            category, purpose = '文件與交接', '本次系統報告／分類索引' if 'system-report' in name or 'inventory' in name else '既有開發文件，包含舊版行為'
        elif path.endswith('.test.ts') or '/tests/' in path:
            category, purpose = '核心測試', purpose or '班表／狀態／資料更新／提醒服務測試，依檔名對應模組'
        elif path.startswith('scripts/verify'):
            category = '瀏覽器驗證'
        elif path.startswith('scripts/') or path.startswith('.github/'):
            category = '資料更新與工具'
        elif path.startswith('public/data/'):
            category = '資料快照與來源'
        elif path.startswith('backend/'):
            category = '後端清運模組'
        elif path.startswith('src/utils/'):
            category = '前端資料與演算法'
        elif path.startswith('src/services/'):
            category = '前端 API'
        elif path.startswith('public/'):
            category = '推播接收'
        else:
            category = '前端頁面與元件'
    audience = '後端／資料庫' if category in ['後端清運模組', '執行期資料（不交付）'] else '前端／後端／資料庫'
    delivery = '不交付真實內容' if path.endswith('.db') else '共用檔案，勿整檔搬移' if path in shared else '納入交接索引'
    rows.append([category, path, purpose, audience, delivery])

with (DOCS / 'garbage-file-inventory.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['分類', '相對路徑', '用途', '閱讀對象', '交接方式'])
    writer.writerows(rows)

def inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)

lines = report.read_text(encoding='utf-8').splitlines()
body, toc = [], []
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith('```'):
        code = []
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i])
            i += 1
        body.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
        i += 1
        continue
    heading = re.match(r'^(#{1,6}) (.+)', line)
    if heading:
        level, title = len(heading[1]), heading[2]
        anchor = f'section-{i}'
        body.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
        if level == 2:
            toc.append(f'<a href="#{anchor}">{html.escape(title)}</a>')
    elif line.startswith('|'):
        table = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = lines[i].strip('|').split('|')
            if not all(re.fullmatch(r'\s*:?-+:?\s*', c) for c in cells):
                tag = 'th' if not table else 'td'
                table.append('<tr>' + ''.join(f'<{tag}>{inline(c.strip())}</{tag}>' for c in cells) + '</tr>')
            i += 1
        body.append('<div class="table-wrap"><table>' + ''.join(table) + '</table></div>')
        continue
    elif line.startswith('- ') or re.match(r'^\d+\. ', line):
        ordered = not line.startswith('- ')
        tag = 'ol' if ordered else 'ul'
        items = []
        pattern = r'^\d+\. ' if ordered else r'^- '
        while i < len(lines) and re.match(pattern, lines[i]):
            items.append('<li>' + inline(re.sub(pattern, '', lines[i])) + '</li>')
            i += 1
        body.append(f'<{tag}>' + ''.join(items) + f'</{tag}>')
        continue
    else:
        body.append('<p>' + inline(line) + '</p>')
    i += 1

page = '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>RentMate 垃圾清運系統報告書</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f4f8;color:#252b40;font:16px/1.85 "Microsoft JhengHei",sans-serif}
header{padding:24px max(24px,calc((100vw - 1120px)/2));background:#5146a5;color:#fff}header a{color:#fff}
main{max-width:1120px;margin:24px auto;background:white;padding:42px;border-radius:16px}
nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:6px;background:#f3f1fc;padding:20px;border-radius:12px}
h1{font-size:30px;line-height:1.45}h2{margin-top:48px;padding-bottom:8px;border-bottom:2px solid #e9e5f7;font-size:23px;scroll-margin-top:20px}h3{font-size:19px}
a{color:#5146a5;overflow-wrap:anywhere}p,li,td{overflow-wrap:anywhere}code{font-size:13px;background:#f2f3f6;padding:2px 4px;border-radius:4px}
pre{background:#20263c;color:#f3f4ff;padding:20px;overflow:auto;border-radius:10px}pre code{background:none;padding:0;color:inherit}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #e1e3eb;padding:10px 12px;text-align:left;vertical-align:top}th{background:#efedf9}tr:nth-child(odd) td{background:#fafaff}
@media(max-width:700px){main{padding:20px;margin:10px}h1{font-size:25px}}
@media print{@page{size:A4;margin:16mm}body{background:white;font-size:10pt}header{display:none}main{margin:0;padding:0;max-width:none}h1{font-size:22pt}h2{font-size:16pt;break-after:avoid}h3{break-after:avoid}table{font-size:9pt}tr{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f8;color:#252b40}nav{display:none}a{color:inherit;text-decoration:none}.table-wrap{overflow:visible}}
</style><header>RentMate 系統交接文件 · 2026-09-11<br><a href="garbage-system-report.md">Markdown 原稿</a>　<a href="garbage-file-inventory.csv">下載檔案分類 CSV</a>　瀏覽器列印可另存 PDF</header><main>
'''
page += '<nav aria-label="報告目錄">' + ''.join(toc) + '</nav>' + '\n'.join(body) + '</main></html>'
(DOCS / 'garbage-system-report.html').write_text(page, encoding='utf-8')

missing = [r[1] for r in rows if not (ROOT / r[1]).is_file()]
assert not missing, missing
for target in re.findall(r'\]\(([^)]+)\)', report.read_text(encoding='utf-8')):
    if not target.startswith(('http:', 'https:', '#')):
        assert (DOCS / target).exists(), target
print(f'Created offline HTML and inventory: {len(rows)} files; all file links exist.')
