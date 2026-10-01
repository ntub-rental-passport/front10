"""報修附件只提供經工單授權的下載，不掛公開靜態目錄。"""
import hashlib
import io
import os
import re
import tempfile
from pathlib import Path
from PIL import Image

IMAGE_LIMIT = 5 * 1024 * 1024
PDF_LIMIT = 10 * 1024 * 1024
TYPES = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf'}


def directory():
    return Path(os.environ.get('REPAIR_PHOTO_DIR') or Path(__file__).resolve().parents[1] / 'uploads/repair-photos')


def inspect(data, purpose):
    if not data:
        raise ValueError('沒有收到檔案內容。')
    if data.startswith(b'%PDF-'):
        if purpose not in {'receipt', 'quote'}:
            raise ValueError('只有報價單與收據可以使用 PDF。')
        if len(data) > PDF_LIMIT:
            raise ValueError('PDF 不能超過 10 MB。')
        # PDF 不在頁面內執行；下載時強制 attachment，並檢查基本結構。
        if b'%%EOF' not in data[-2048:] or not re.match(rb'%PDF-\d\.\d', data):
            raise ValueError('PDF 檔案不完整，請重新選擇。')
        return 'pdf'
    if len(data) > IMAGE_LIMIT:
        raise ValueError('圖片不能超過 5 MB。')
    try:
        with Image.open(io.BytesIO(data)) as image:
            format_name = image.format
            if max(image.size) > 12000:
                raise ValueError('圖片邊長不能超過 12,000 像素。')
            image.verify()
    except Exception as error:
        raise ValueError('請上傳有效的 WebP、PNG 或 JPG 圖片。') from error
    extension = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}.get(format_name)
    if not extension:
        raise ValueError('圖片只接受 WebP、PNG 或 JPG。')
    return extension


def save(data, filename, purpose):
    extension = inspect(data, purpose)
    name = hashlib.sha256(data).hexdigest() + '.' + extension
    location = directory()
    location.mkdir(parents=True, exist_ok=True)
    target = location / name
    if target.is_symlink():
        raise ValueError('附件儲存路徑無效。')
    if not target.exists():
        # 每次上傳有獨立暫存名，避免同圖併發寫入互相移走暫存檔。
        handle, temporary = tempfile.mkstemp(dir=location, prefix='.upload-')
        try:
            with os.fdopen(handle, 'wb') as stream:
                stream.write(data)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    clean_name = Path((filename or '附件').replace('\\', '/')).name[:255]
    return {'name': clean_name, 'type': TYPES[extension], 'size': len(data), 'url': '/api/repairs/photos/' + name, 'purpose': purpose}


def path_of(name):
    if not re.fullmatch(r'[a-f0-9]{64}\.(jpg|png|webp|pdf)', name):
        return None
    target = directory() / name
    if target.is_file() and not target.is_symlink() and target.resolve().parent == directory().resolve():
        return target
    return None
