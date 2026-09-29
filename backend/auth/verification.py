import hashlib
import hmac
import os
import secrets


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def get_verification_secret() -> str:
    secret = os.getenv("VERIFICATION_CODE_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError("VERIFICATION_CODE_SECRET 必須至少包含 32 bytes 的隨機資料。")
    return secret


def hash_verification_code(registration_id: str, code: str) -> str:
    message = f"{registration_id}:{code}".encode("utf-8")
    return hmac.new(
        get_verification_secret().encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def verification_code_matches(registration_id: str, code: str, expected_hash: str) -> bool:
    return hmac.compare_digest(
        hash_verification_code(registration_id, code),
        expected_hash,
    )
