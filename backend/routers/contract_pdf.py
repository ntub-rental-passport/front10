"""Authenticated, memory-only PDF encryption. Never persist or log inputs."""
import base64
import binascii
from io import BytesIO
import json
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from pypdf import PdfReader, PdfWriter

from auth.security import get_current_user

router = APIRouter(prefix="/api/contract", dependencies=[Depends(get_current_user)])
MAX_REQUEST_BYTES = 24 * 1024 * 1024
MAX_PDF_BYTES = 16 * 1024 * 1024


def normalize_tenant_password(value: object) -> str:
    password = value.strip().upper() if isinstance(value, str) else ""
    if not re.fullmatch(r"[A-Z][12][0-9]{8}", password):
        raise ValueError("invalid identity")
    code = dict(zip("ABCDEFGHJKLMNPQRSTUVXYWZIO", range(10, 36)))[password[0]]
    total = code // 10 + (code % 10) * 9
    total += sum(int(digit) * weight for digit, weight in zip(password[1:], [8, 7, 6, 5, 4, 3, 2, 1, 1]))
    if total % 10:
        raise ValueError("invalid identity")
    return password


def encrypt_contract_pdf(data: bytes, password: str) -> bytes:
    password = normalize_tenant_password(password)
    if not data.startswith(b"%PDF-") or len(data) > MAX_PDF_BYTES:
        raise ValueError("invalid document")
    reader = PdfReader(BytesIO(data), strict=True)
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 60:
        raise ValueError("invalid document")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({"/Title": "RentMate Contract", "/Producer": "RentMate"})
    writer.encrypt(user_password=password, owner_password=secrets.token_urlsafe(48), algorithm="AES-256")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


@router.post("/export-encrypted-pdf")
async def export_encrypted_pdf(request: Request):
    # Avoid multipart spooling plaintext files to disk, and bound chunked requests too.
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(413, "契約檔案過大，無法匯出。")
        body.extend(chunk)
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError()
        password = normalize_tenant_password(payload.get("tenant_id"))
        encoded = payload.get("pdf_base64")
        if not isinstance(encoded, str):
            raise ValueError()
        pdf = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError, binascii.Error):
        # Do not echo submitted values in validation errors.
        raise HTTPException(422, "請確認租客身分證字號與契約資料後再匯出。") from None
    finally:
        body.clear()
    try:
        encrypted = await run_in_threadpool(encrypt_contract_pdf, pdf, password)
    except Exception:
        raise HTTPException(422, "契約 PDF 加密失敗，請重新匯出。") from None
    return Response(encrypted, media_type="application/pdf", headers={
        "Content-Disposition": 'attachment; filename="RentMate-encrypted-contract.pdf"',
        "Cache-Control": "no-store, private", "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
    })
