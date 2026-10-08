"""VM 本機檔案儲存，供上傳功能共用。"""
import io
import logging
import os
import re
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from . import crypto
from .crypto import EncryptionUnavailable

__all__ = [
    'KINDS', 'EncryptionUnavailable', 'directory', 'save', 'read', 'delete',
    'path_of', 'reencode_image', 'image_format',
]

BASE_DIR = Path(__file__).resolve().parents[1]
KINDS = {
    'banners': ('BANNER_IMAGE_DIR', 'banners'),
    'inspection': ('INSPECTION_UPLOAD_DIR', 'inspection'),
    'repairs': ('REPAIR_UPLOAD_DIR', 'repairs'),
    'contracts': ('LEASE_FILE_DIR', 'contracts'),
    'reviews': ('REVIEW_FILE_DIR', 'reviews'),
    'subsidy': ('SUBSIDY_FILE_DIR', 'subsidy'),
    'avatars': ('AVATAR_FILE_DIR', 'avatars'),
}
_STORED_NAME = re.compile(r'[0-9a-f]{32}\.[a-z0-9]{2,5}')
_MAX_IMAGE_PIXELS = 40_000_000
logger = logging.getLogger(__name__)


def directory(kind: str) -> Path:
    try:
        env_var, subdir = KINDS[kind]
    except KeyError as error:
        raise ValueError(f'未知的檔案種類：{kind}') from error
    return Path(os.getenv(env_var) or (BASE_DIR / 'uploads' / subdir))


def save(kind: str, data: bytes, ext: str, *, encrypt: bool = False) -> str:
    ext = ext.lower()
    if not re.fullmatch(r'[a-z0-9]{2,5}', ext):
        raise ValueError('副檔名必須是 2 至 5 個英文字母或數字。')
    folder = directory(kind)
    if encrypt:
        data = crypto.encrypt(kind, data)
    name = f'{uuid.uuid4().hex}.{ext}'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    temporary = path.with_name(path.name + '.part')
    try:
        # 完整寫入後才公開檔案，避免讀到中途失敗的內容。
        temporary.write_bytes(data)
        temporary.replace(path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            logger.warning('無法刪除暫存檔案：%s', temporary, exc_info=True)
    return name


def path_of(kind: str, stored_name: str) -> Path | None:
    folder = directory(kind)
    if not isinstance(stored_name, str) or not _STORED_NAME.fullmatch(stored_name):
        return None
    path = folder / stored_name
    try:
        if path.resolve().parent != folder.resolve():
            return None
    except (OSError, RuntimeError):
        return None
    return path


def read(kind: str, stored_name: str, *, encrypted: bool = False) -> bytes:
    path = path_of(kind, stored_name)
    if path is None or not path.is_file():
        raise FileNotFoundError('找不到檔案。')
    data = path.read_bytes()
    return crypto.decrypt(kind, data) if encrypted else data


def delete(kind: str, stored_name: str) -> None:
    try:
        path = path_of(kind, stored_name)
        if path is None:
            logger.warning('忽略不合法的儲存檔名：%s / %r', kind, stored_name)
            return
        path.unlink(missing_ok=True)
    except OSError:
        # 資料庫已提交，刪檔失敗只留待清理，不讓請求失敗。
        logger.warning('無法刪除檔案：%s / %r', kind, stored_name, exc_info=True)


class _ImageTooLarge(ValueError):
    """像素過多：訊息要原樣給使用者，不能被包成「無法解析」。"""


def reencode_image(data: bytes, *, max_edge: int, quality: int = 85) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as image:
            # 在載入像素之前檢查，避免解壓縮佔用過多記憶體。
            if image.width * image.height > _MAX_IMAGE_PIXELS:
                raise _ImageTooLarge('圖片不能超過 4,000 萬像素。')
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=quality, optimize=True, exif=b'')
            return buffer.getvalue()
    except _ImageTooLarge:
        raise
    except Exception as error:
        raise ValueError('無法解析圖片，請選擇有效的圖片檔案。') from error


def image_format(data: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
            return image.format
    except Exception:
        return None
