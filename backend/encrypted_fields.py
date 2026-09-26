"""Authenticated encryption for schema-v3 VARBINARY personal-data columns."""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import LargeBinary
from sqlalchemy.dialects.mysql import VARBINARY
from sqlalchemy.types import TypeDecorator


def _key() -> bytes:
    try:
        key = base64.b64decode(os.environ.get("PII_ENCRYPTION_KEY", ""), validate=True)
    except ValueError as error:
        raise ValueError("PII_ENCRYPTION_KEY must be base64-encoded 32 random bytes") from error
    if len(key) != 32:
        raise ValueError("Set PII_ENCRYPTION_KEY to base64-encoded 32 random bytes before accessing personal data")
    return key


class EncryptedText(TypeDecorator):
    """Return strings to the API; store version + nonce + ciphertext + tag.

    No plaintext fallback. Keep the key stable and back it up separately from DB.
    """
    impl = LargeBinary
    cache_ok = True

    def __init__(self, length: int):
        self.length = length
        super().__init__(length=length)

    def load_dialect_impl(self, dialect):
        storage = VARBINARY(self.length) if dialect.name == "mysql" else LargeBinary(self.length)
        return dialect.type_descriptor(storage)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Encrypted personal data must be a string")
        nonce = os.urandom(12)
        result = b"\x01" + nonce + AESGCM(_key()).encrypt(nonce, value.encode("utf-8"), b"rentmate-pii-v1")
        if len(result) > self.length:
            raise ValueError(f"Personal data exceeds encrypted column capacity ({self.length} bytes)")
        return result

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        value = bytes(value)
        if len(value) < 29 or value[0] != 1:
            raise ValueError("Unsupported personal-data format; migrate legacy plaintext explicitly")
        return AESGCM(_key()).decrypt(value[1:13], value[13:], b"rentmate-pii-v1").decode("utf-8")
