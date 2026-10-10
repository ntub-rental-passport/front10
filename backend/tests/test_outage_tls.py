"""停水 API 必須驗證 TLS：不可以再傳 verify=False。"""
import ssl

import pytest

from routers import outage


def test_tls_context_verifies_certificates():
    context = outage._tls_context()
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert not (context.verify_flags & ssl.VERIFY_X509_STRICT)


@pytest.fixture
def anyio_backend():
    # 環境沒有安裝 trio；只跑 asyncio。
    return "asyncio"


@pytest.mark.anyio
async def test_water_client_never_disables_verification(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, **kwargs):
            seen.update(kwargs)

        async def __aenter__(self):
            raise RuntimeError("stop")  # 只檢查建構參數，不真的連線

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(outage.httpx, "AsyncClient", FakeClient)
    await outage.fetch_real_water_outage("臺北市中正區")
    assert seen.get("verify") is not False
    assert isinstance(seen.get("verify"), ssl.SSLContext)
