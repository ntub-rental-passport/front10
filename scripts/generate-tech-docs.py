"""Generate source inventories without importing the app or reading secrets.

Run from any directory: python scripts/generate-tech-docs.py
Only docs/reference/*.md are overwritten. Requires Python 3.10+; no dependencies.
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'reference'


def link(path):
    return f'[{path.as_posix()}](../../{path.as_posix()})'


def cell(value):
    return str(value).replace('|', '&#124;').replace('\n', ' ')


def write(name, title, description, lines):
    OUT.mkdir(parents=True, exist_ok=True)
    content = [f'# {title}', '', description, '',
               '此索引由 `python scripts/generate-tech-docs.py` 靜態產生；不匯入應用程式、不連線資料庫、不讀取 `.env`。請修改來源後重新產生，避免手動修改本檔。', '',
               '[返回技術文件入口](../README.md)', '', *lines]
    (OUT / name).write_text('\n'.join(content) + '\n', encoding='utf-8')


def api_inventory():
    main = ast.parse((ROOT / 'backend/main.py').read_text(encoding='utf-8-sig'))
    registered = set()
    for node in ast.walk(main):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'include_router':
            registered.add(ast.unparse(node.args[0]))
    lines = ['FastAPI 的實際請求／回應 schema 請以執行中的 `/openapi.json`、`/docs` 為準。下列依賴包含 router 層與函式簽名，仍須追查依賴函式內的角色、資源所有權及工作區檢查；空白不代表端點可匿名存取。', '']
    count = 0
    for path in [ROOT / 'backend/main.py', *sorted((ROOT / 'backend/routers').glob('*.py'))]:
        tree = ast.parse(path.read_text(encoding='utf-8-sig'))
        routers = {'app': ('', '')} if path.name == 'main.py' else {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and ast.unparse(node.value.func) == 'APIRouter':
                for target in node.targets:
                    if isinstance(target, ast.Name) and f'{path.stem}.{target.id}' in registered:
                        kw = {k.arg: k.value for k in node.value.keywords}
                        prefix = ast.literal_eval(kw['prefix']) if 'prefix' in kw else ''
                        deps = ast.unparse(kw['dependencies']) if 'dependencies' in kw else ''
                        routers[target.id] = (prefix, deps)
        rows = []
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute) or not isinstance(dec.func.value, ast.Name):
                    continue
                router = dec.func.value.id
                method = dec.func.attr
                if router not in routers or method not in ('get', 'post', 'put', 'patch', 'delete', 'head', 'options'):
                    continue
                prefix, inherited = routers[router]
                url = prefix + ast.literal_eval(dec.args[0])
                deps = [inherited] if inherited else []
                for val in [*node.args.defaults, *[v for v in node.args.kw_defaults if v is not None], *[k.value for k in dec.keywords]]:
                    for child in ast.walk(val):
                        if isinstance(child, ast.Call) and ast.unparse(child.func) == 'Depends':
                            deps.append(ast.unparse(child))
                response = next((ast.unparse(k.value) for k in dec.keywords if k.arg == 'response_model'), '—')
                rows.append(f'| {method.upper()} | `{url}` | `{node.name}` | {cell("; ".join(dict.fromkeys(deps)) or "—")} | {cell(response)} |')
        if rows:
            count += len(rows)
            lines += [f'## {path.stem}', '', f'來源：{link(path.relative_to(ROOT))}', '', '| 方法 | 路徑 | 處理函式 | 依賴宣告 | 回應模型宣告 |', '| --- | --- | --- | --- | --- |', *rows, '']
    js = (ROOT / 'server/index.js').read_text(encoding='utf-8')
    lines += ['## Express OCR', '', f'來源：{link(Path("server/index.js"))}', '', '| 方法 | 路徑 |', '| --- | --- |']
    for method, url in re.findall(r"app\.(get|post|put|patch|delete)\(['\"]([^'\"]+)", js):
        lines.append(f'| {method.upper()} | `{url}` |')
    write('api-inventory.md', 'API 原始碼索引', f'列出目前 `backend/main.py` 註冊的 FastAPI 路由（{count} 個）及 Express 路由。', lines)


def model_inventory():
    lines = ['這是 ORM 宣告索引，不代表部署資料庫已完成遷移。SQL 建表、遷移與 schema 檢查需一併核對。`EncryptedText` 代表加密個資欄位；`relationship` 是 ORM 關聯，不是實體欄位。', '']
    tables = 0
    for path in sorted((ROOT / 'backend/db').glob('*models.py')):
        tree = ast.parse(path.read_text(encoding='utf-8-sig'))
        for cls in tree.body:
            if not isinstance(cls, ast.ClassDef):
                continue
            table = None
            constraints = None
            relations = []
            rows = []
            for node in cls.body:
                if not isinstance(node, ast.Assign):
                    continue
                for target in node.targets:
                    if not isinstance(target, ast.Name):
                        continue
                    if target.id == '__tablename__':
                        table = ast.literal_eval(node.value)
                    elif target.id == '__table_args__':
                        constraints = ast.unparse(node.value)
                    elif isinstance(node.value, ast.Call) and ast.unparse(node.value.func) == 'Column':
                        rows.append(f'| `{target.id}` | `{cell(ast.unparse(node.value))}` |')
                    elif isinstance(node.value, ast.Call) and ast.unparse(node.value.func) == 'relationship':
                        relations.append(f'- `{target.id}`：`{cell(ast.unparse(node.value))}`')
            if table:
                tables += 1
                lines += [f'## {table}', '', f'ORM：`{cls.name}`；來源：{link(path.relative_to(ROOT))}', '', '| 欄位 | 宣告（型別、外鍵與限制） |', '| --- | --- |', *rows, '']
                if constraints:
                    lines += [f'表級限制：`{cell(constraints)}`', '']
                if relations:
                    lines += ['ORM 關聯：', '', *relations, '']
    write('data-models.md', '資料模型與欄位索引', f'目前 ORM 共宣告 {tables} 張資料表。', lines)


def env_inventory():
    found = {}
    paths = [*sorted((ROOT / 'backend').rglob('*.py')), *sorted((ROOT / 'server').glob('*.js')), *sorted((ROOT / 'src').rglob('*.ts')), *sorted((ROOT / 'src').rglob('*.vue')), ROOT / 'vite.config.ts']
    for path in paths:
        if any(p in ('tests', '__pycache__') for p in path.parts) or '.test.' in path.name:
            continue
        source = path.read_text(encoding='utf-8-sig')
        if path.suffix == '.py':
            tree = ast.parse(source)
            keys = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and ast.unparse(node.func) in ('os.getenv', 'os.environ.get', '_env') and node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                    keys.append(node.args[0].value)
        else:
            keys = re.findall(r'(?:process\.env|import\.meta\.env|env)\.([A-Z][A-Z0-9_]+)', source)
        for key in keys:
            found.setdefault(key, set()).add(path.relative_to(ROOT))
    lines = ['僅列出靜態字面值讀取；動態組合的 embedding 設定名稱可能未被列出。變數的用途與必要性見 [環境設定](../technical/configuration.md)，預設值以來源為準。此文件不列出任何環境中的實際值。', '', '| 變數 | 讀取來源 |', '| --- | --- |']
    for key, paths in sorted(found.items()):
        lines.append(f'| `{key}` | {", ".join(link(p) for p in sorted(paths))} |')
    write('environment-inventory.md', '環境變數原始碼索引', f'共找到 {len(found)} 個靜態設定名稱。', lines)


if __name__ == '__main__':
    api_inventory()
    model_inventory()
    env_inventory()
    print('Generated docs/reference/{api-inventory,data-models,environment-inventory}.md')
