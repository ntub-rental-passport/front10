"""測試帳號可在容器裡以環境變數重設，不需要寫入 /.env。"""
import pytest

from scripts import seed_test_accounts as seed


@pytest.fixture
def env_path(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    monkeypatch.setattr(seed, "ENV_PATH", path)
    monkeypatch.delenv("TEST_LANDLORD_PASSWORD", raising=False)
    return path


def test_environment_password_takes_priority(env_path, monkeypatch):
    env_path.write_text("TEST_LANDLORD_PASSWORD=file-password\n", encoding="utf-8")
    monkeypatch.setenv("TEST_LANDLORD_PASSWORD", "environment-password")
    assert seed.resolve_password("TEST_LANDLORD_PASSWORD", False) == ("environment-password", False)
    assert env_path.read_text(encoding="utf-8") == "TEST_LANDLORD_PASSWORD=file-password\n"


@pytest.mark.parametrize("dry_run", [False, True])
def test_environment_password_never_reads_or_writes_env(env_path, monkeypatch, dry_run):
    monkeypatch.setenv("TEST_LANDLORD_PASSWORD", "environment-password")

    def unexpected(*args):
        pytest.fail("環境變數存在時不應讀寫 .env 或產生密碼")

    monkeypatch.setattr(seed, "read_env_value", unexpected)
    monkeypatch.setattr(seed, "write_env_value", unexpected)
    monkeypatch.setattr(seed, "generate_password", unexpected)
    assert seed.resolve_password("TEST_LANDLORD_PASSWORD", dry_run) == ("environment-password", False)
    assert not env_path.exists()


@pytest.mark.parametrize("environment", [None, ""])
def test_without_environment_reuses_env(env_path, monkeypatch, environment):
    if environment is not None:
        monkeypatch.setenv("TEST_LANDLORD_PASSWORD", environment)
    env_path.write_text('OTHER=value\nTEST_LANDLORD_PASSWORD="file-password"\n', encoding="utf-8")
    before = env_path.read_bytes()
    assert seed.resolve_password("TEST_LANDLORD_PASSWORD", False) == ("file-password", False)
    assert env_path.read_bytes() == before


@pytest.mark.parametrize("dry_run", [False, True])
@pytest.mark.parametrize("existing", [None, "OTHER=value\nTEST_LANDLORD_PASSWORD=\n"])
def test_without_environment_generates_password(env_path, monkeypatch, dry_run, existing):
    if existing is not None:
        env_path.write_text(existing, encoding="utf-8")
    monkeypatch.setattr(seed, "generate_password", lambda: "generated-password")
    assert seed.resolve_password("TEST_LANDLORD_PASSWORD", dry_run) == ("generated-password", True)
    if dry_run:
        assert env_path.exists() == (existing is not None)
        if existing is not None:
            assert env_path.read_text(encoding="utf-8") == existing
    else:
        assert seed.read_env_value("TEST_LANDLORD_PASSWORD") == "generated-password"
        if existing is not None:
            assert "OTHER=value\n" in env_path.read_text(encoding="utf-8")
