"""首頁輪播的圖片：管理員從後台上傳，存在 VM 的硬碟上（2026-09-30 起）。

原本後台只能填圖片網址，能選的是打包在程式裡的三張（public/banners/）。要換新圖
得把檔案放進專案再部署一次，所以這裡讓管理員直接上傳。

## 存哪裡

BANNER_IMAGE_DIR 指到的資料夾。VM 上掛載成 ./data/banner-images，跟點交照片同一種
做法：檔案在 VM 的硬碟上，容器重建不會消失。

## 檔名

上傳進來的用內容雜湊命名，附檔名照真正的圖片格式（不是使用者取的名字）：
- 同一張圖上傳兩次只留一份。
- 名字只會有英數、底線與減號。
- 上傳者取的名字只拿來當開頭的可讀前綴，其餘字元一律丟掉。

讀取則寬鬆一些：管理員也可能直接把圖丟進 VM 的資料夾，那些檔名不會照上面的
規則（中文、空白、.jpeg 都有可能），一樣要列得出來、選得到。擋的是會跑出這個
資料夾的名字：帶路徑分隔符號的、`.` 與 `..`、指到外面的捷徑，以及不是圖片副檔名的檔案。

## 怎麼讀

`GET /api/content/banner-images/<檔名>`，不需登入 —— 首頁輪播本來就是公開的。
走 /api/ 是為了沿用 nginx 既有的轉發，不必另外開一條靜態檔路徑。
"""

import hashlib
import io
import os
import re
from pathlib import Path
from urllib.parse import quote

from PIL import Image

_REPO_ROOT = Path(__file__).resolve().parents[2]

#: 一張輪播圖的上限。2400×800 的 WebP 大約 200KB，5MB 已經非常寬鬆
MAX_BYTES = 5 * 1024 * 1024
#: 邊長上限。超過這個尺寸不是輪播圖，是誤傳的原始照片
MAX_EDGE = 6000
#: 只收瀏覽器都認得、且能無損判讀的格式
FORMATS = {'WEBP': 'webp', 'PNG': 'png', 'JPEG': 'jpg'}
CONTENT_TYPES = {'webp': 'image/webp', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg'}
URL_PREFIX = '/api/content/banner-images'


def image_dir() -> Path:
    """⚠️ 一定要在呼叫時才讀環境變數（理由同 garbage_service.data_dir）。"""
    return Path(os.getenv('BANNER_IMAGE_DIR') or (_REPO_ROOT / 'backend/uploads/banners'))


def _prefix(filename: str) -> str:
    """上傳的檔名只留英數與減號當前綴；中文檔名會整個被丟掉，那時用 banner。"""
    stem = Path(filename or '').stem
    cleaned = re.sub(r'[^A-Za-z0-9-]+', '-', stem).strip('-').lower()
    return (cleaned[:40] or 'banner')


def _inspect(data: bytes) -> tuple[str, int, int]:
    """回 (副檔名, 寬, 高)。不是認得的圖片就丟 ValueError。"""
    try:
        with Image.open(io.BytesIO(data)) as image:
            fmt, (width, height) = image.format, image.size
            image.verify()  # 檔頭看起來對，但內容壞掉的也要擋
    except Exception as error:
        raise ValueError('這個檔案不是圖片，請改上傳 WebP、PNG 或 JPG。') from error
    if fmt not in FORMATS:
        raise ValueError('圖片格式只接受 WebP、PNG 或 JPG。')
    if max(width, height) > MAX_EDGE:
        raise ValueError(f'圖片邊長不能超過 {MAX_EDGE:,} 像素。')
    return FORMATS[fmt], width, height


def _is_image_name(name: str) -> bool:
    """檔名看起來是不是這個資料夾裡的圖片。擋掉會跑出資料夾的名字。"""
    if not name or name in {'.', '..'} or name.startswith('.'):
        return False
    if '/' in name or '\\' in name or '\x00' in name:
        return False
    return name.rsplit('.', 1)[-1].lower() in CONTENT_TYPES if '.' in name else False


def _view(path: Path) -> dict:
    stat = path.stat()
    return {
        'name': path.name,
        # 中文、空白的檔名要編碼過才能直接放進 <img src>
        'url': f'{URL_PREFIX}/{quote(path.name)}',
        'size': stat.st_size,
        'uploadedAt': stat.st_mtime,
    }


def save(data: bytes, filename: str) -> dict:
    """存一張上傳的圖。不合法就丟 ValueError，訊息是給管理員看的中文。"""
    if not data:
        raise ValueError('沒有收到檔案內容。')
    if len(data) > MAX_BYTES:
        raise ValueError(f'圖片不能超過 {MAX_BYTES // (1024 * 1024)} MB。')
    extension, width, height = _inspect(data)

    name = f'{_prefix(filename)}-{hashlib.sha256(data).hexdigest()[:12]}.{extension}'
    directory = image_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    if not path.exists():
        # 先寫暫存檔再改名：中途失敗不會留下半張圖被前台讀到
        temporary = path.with_name(path.name + '.part')
        temporary.write_bytes(data)
        temporary.replace(path)
    return {**_view(path), 'width': width, 'height': height}


def listing() -> list[dict]:
    """已上傳的圖片，新到舊。沒有資料夾就是還沒傳過，不建檔。"""
    directory = image_dir()
    if not directory.is_dir():
        return []
    files = [p for p in directory.iterdir() if p.is_file() and _is_image_name(p.name)]
    files.sort(key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
    return [_view(p) for p in files]


def path_of(name: str) -> Path | None:
    """檔名對應的檔案。名字不合格式或檔案不在就回 None —— 不讓人用名字跑出資料夾。"""
    if not _is_image_name(name or ''):
        return None
    path = image_dir() / name
    if not path.is_file():
        return None
    directory = image_dir().resolve()
    if path.resolve().parent != directory:
        return None
    return path


def content_type_of(name: str) -> str:
    return CONTENT_TYPES[name.rsplit('.', 1)[1].lower()]
