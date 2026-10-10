"""檔案使用獨立金鑰加密，並將儲存種類納入驗證。"""
import base64
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EncryptionUnavailable(RuntimeError):
    """檔案加密金鑰尚未設定或格式不正確。"""


def _key() -> bytes:
    try:
        key = base64.b64decode(os.environ.get('FILE_ENCRYPTION_KEY', ''), validate=True)
    except ValueError as error:
        raise EncryptionUnavailable('FILE_ENCRYPTION_KEY 必須是以 base64 編碼的 32 位元組金鑰。') from error
    if len(key) != 32:
        raise EncryptionUnavailable('請設定 FILE_ENCRYPTION_KEY 為以 base64 編碼的 32 位元組金鑰。')
    return key


def encrypt(kind: str, data: bytes) -> bytes:
    cipher = AESGCM(_key())
    nonce = os.urandom(12)
    return b'\x01' + nonce + cipher.encrypt(nonce, data, b'rentmate-file-v1:' + kind.encode())


def decrypt(kind: str, data: bytes) -> bytes:
    cipher = AESGCM(_key())
    if len(data) < 29 or data[0] != 1:
        raise ValueError('不支援的加密檔案格式。')
    try:
        return cipher.decrypt(data[1:13], data[13:], b'rentmate-file-v1:' + kind.encode())
    except InvalidTag as error:
        raise ValueError('檔案解密驗證失敗。') from error
