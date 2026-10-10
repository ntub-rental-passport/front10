"""不連 Docker，以真實過濾器與掃描 driver 驗證安全邊界。"""
import base64
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace

import pytest

TEST_DIR = Path(__file__).resolve().parents[2] / "deploy" / "test"
spec = importlib.util.spec_from_file_location("zap_filter_openapi", TEST_DIR / "zap_filter_openapi.py")
filter_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(filter_module)


def test_filter_exclusions_preserve_other_methods_and_metadata(capsys):
    excluded = [
        ("post", "/api/auth/logout"), ("post", "/api/auth/google"),
        ("get", "/api/auth/google/callback"), ("post", "/api/auth/admin/login"),
        ("post", "/api/internal/notify"), ("post", "/api/auth/password/change"),
        ("post", "/api/auth/password/reset/complete"),
        ("patch", "/api/admin/users/{user_id}/status"),
    ]
    original = {"openapi": "3.1.0", "paths": {
        path: {method: {}, "parameters": []} for method, path in excluded
    }, "components": {"schemas": {"Example": {"type": "string"}}}}
    original["paths"]["/api/auth/logout"]["get"] = {"summary": "保留其他方法"}
    original["paths"]["/api/auth/me"] = {"get": {}}
    original["paths"]["/api/auth/password/reset/start"] = {"post": {}}
    filtered = filter_module.filter_openapi(original)
    assert filtered["components"] == original["components"]
    assert set(filtered["paths"]) == {
        "/api/auth/logout", "/api/auth/me", "/api/auth/password/reset/start",
    }
    assert filtered["paths"]["/api/auth/logout"] == {
        "get": {"summary": "保留其他方法"}, "parameters": [],
    }
    assert "post" in original["paths"]["/api/auth/logout"]
    stderr = capsys.readouterr().err
    for method, path in excluded:
        assert f"排除 {method.upper()} {path}：" in stderr


def test_filter_cli(tmp_path):
    source = tmp_path / "input.json"
    output = tmp_path / "output.json"
    source.write_text(json.dumps({"paths": {"/api/auth/logout": {"post": {}},
                                           "/api/auth/me": {"get": {}}}}), encoding="utf-8")
    result = subprocess.run([sys.executable, str(TEST_DIR / "zap_filter_openapi.py"),
                             str(source), str(output)], capture_output=True, text=True)
    assert result.returncode == 0
    assert json.loads(output.read_text(encoding="utf-8"))["paths"] == {"/api/auth/me": {"get": {}}}
    assert "POST /api/auth/logout" in result.stderr
    assert not result.stdout


@pytest.fixture
def driver(tmp_path, monkeypatch):
    script = (TEST_DIR / "run-zap.sh").read_text(encoding="utf-8")
    source = script.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    # 執行 shell 內的實際 driver 定義，把入口留給測試控制。
    monkeypatch.setattr(sys, "argv", ["scan-driver.py", "api", "landlord"])
    monkeypatch.setenv("SCAN_PASSWORD", "fake-secret-password")
    for key in ("ZAP_AUTH_HEADER", "ZAP_AUTH_HEADER_VALUE", "ZAP_AUTH_HEADER_SITE"):
        monkeypatch.setenv(key, "")
    namespace = {}
    exec(source.rsplit("\ntry:\n", 1)[0], namespace)
    namespace["WORK"] = tmp_path
    claims = base64.urlsafe_b64encode(json.dumps({"exp": int(time.time()) + 86400}).encode()).decode().rstrip("=")
    token = "eyJhbGciOiJIUzI1NiJ9." + claims + ".fake-signature"
    login = io.BytesIO(json.dumps({"accessToken": "fake-bearer-secret"}).encode())
    login.headers = SimpleNamespace(get_all=lambda *args: ["access_token=" + token + "; HttpOnly"])
    monkeypatch.setattr(namespace["opener"], "open", lambda *args, **kwargs: login)
    namespace["auth_me"] = lambda token: 200
    return namespace, token


def test_scan_requires_authenticated_me(driver, monkeypatch, capsys):
    namespace, token = driver
    namespace["auth_me"] = lambda token: 401
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: pytest.fail("登入失敗不能啟動 ZAP"))
    assert namespace["main"]() == 3
    assert "掃描前 GET /api/auth/me：401" in capsys.readouterr().out
    assert not list(namespace["WORK"].iterdir())


@pytest.mark.parametrize("post_status, scan_status, expected", [(200, 2, 2), (401, 0, 3), (200, 1, 1)])
def test_scan_reports_coverage_redacts_secrets_and_keeps_exit_code(driver, monkeypatch, capsys,
                                                                 post_status, scan_status, expected):
    namespace, token = driver
    statuses = iter([200, post_status])
    namespace["auth_me"] = lambda token: next(statuses)

    def scan(args, stdout, **kwargs):
        assert args[:1] == ["zap-api-scan.py"]
        assert args[args.index("-O") + 1] == "http://fastapi:8000"
        assert args[args.index("-c") + 1] == str(namespace["WORK"] / "zap-rules.tsv")
        assert namespace["os"].environ["ZAP_AUTH_HEADER_VALUE"] == "access_token=" + token
        content = " ".join([namespace["password"], token, "fake-bearer-secret"])
        Path(args[args.index("-r") + 1]).write_text(content, encoding="utf-8")
        Path(args[args.index("-J") + 1]).write_text(json.dumps({"evidence": content}), encoding="utf-8")
        hook = {}
        exec(Path(args[args.index("--hook") + 1]).read_text(encoding="utf-8"), hook)
        messages = [
            {"requestHeader": "GET http://fastapi:8000/api/auth/me?probe=1 HTTP/1.1\n",
             "responseHeader": "HTTP/1.1 200 OK\n"},
            {"requestHeader": "GET http://fastapi:8000/api/auth/me?probe=2 HTTP/1.1\n",
             "responseHeader": "HTTP/1.1 401 Unauthorized\n"},
            {"requestHeader": "GET http://fastapi:8000/api/health HTTP/1.1\n",
             "responseHeader": "HTTP/1.1 200 OK\n"},
            {"requestHeader": "GET http://fastapi:8000/api/unanswered HTTP/1.1\n"},
        ]
        zap = SimpleNamespace(core=SimpleNamespace(messages=lambda **kwargs: messages if kwargs["start"] == 0 else []))
        with redirect_stdout(stdout):
            hook["zap_pre_shutdown"](zap)
            print("FAIL-NEW: 0\tWARN-NEW: 1\tPASS: 8")
            print(content)
        return SimpleNamespace(returncode=scan_status)

    monkeypatch.setattr(subprocess, "run", scan)
    assert namespace["main"]() == expected
    output = capsys.readouterr().out
    assert "實際打到的 API 網址數量：2" in output
    assert "API 回應：3；401/403：1" in output
    artifacts = list(namespace["WORK"].iterdir())
    assert {path.name for path in artifacts} == {"api-landlord.html", "api-landlord.json"}
    for content in [output, *(path.read_text(encoding="utf-8") for path in artifacts)]:
        for secret in (namespace["password"], token, "fake-bearer-secret"):
            assert secret not in content
    assert json.loads((namespace["WORK"] / "api-landlord.json").read_text())["evidence"] == "[REDACTED] [REDACTED] [REDACTED]"


@pytest.mark.parametrize("case, mode, expected", [
    ("all", "api", 1), ("web", "web", 2), ("no-project", "api", 3), ("no-network", "api", 3),
])
def test_shell_guards_targets_and_aggregates_status(tmp_path, case, mode, expected):
    import os
    import shutil

    for name in ("run-zap.sh", "zap_filter_openapi.py", "zap-rules.tsv"):
        shutil.copy(TEST_DIR / name, tmp_path / name)
    tools = tmp_path / "bin"
    tools.mkdir()
    shim = tools / "docker"
    shim.write_text("#!" + sys.executable + "\n" + '''
import json
import os
from pathlib import Path
import sys
args = sys.argv[1:]
case = os.environ["ZAP_TEST_CASE"]
with open(os.environ["ZAP_TEST_LOG"], "a") as log:
    log.write(json.dumps(args) + "\\n")
if args[0] == "ps":
    assert args == ["ps", "-q", "--filter", "label=com.docker.compose.project=rentmate-test"]
    if case != "no-project":
        print("test-container-id")
elif args[:2] == ["network", "inspect"]:
    assert args[2] == "rentmate-test_test_net"
    sys.exit(1 if case == "no-network" else 0)
elif args[0] == "compose":
    assert args[1:3] == ["-p", "rentmate-test"]
    assert args[5:8] == ["exec", "-T", "fastapi"]
    if args[8] == "python":
        assert args[9:] == ["scripts/seed_test_accounts.py"]
    else:
        assert args[8] == "printenv"
        assert args[9] in ("TEST_LANDLORD_PASSWORD", "TEST_TENANT_PASSWORD")
        print("fake-secret-password")
elif args[0] == "run":
    assert args[1:4] == ["--rm", "--network", "rentmate-test_test_net"]
    assert "ghcr.io/zaproxy/zaproxy:stable" in args
    if "/zap/wrk/scan-driver.py" in args:
        assert args[-3] == "/zap/wrk/scan-driver.py"
        assert args[args.index("-e") + 1] == "SCAN_PASSWORD"
        outdir = Path(args[args.index("-v") + 1].split(":")[0])
        assert (outdir / "zap-rules.tsv").exists()
        assert outdir.stat().st_mode & 0o002
        if args[-2] == "web":
            assert "SCAN_PASSWORD" not in os.environ
            sys.exit(2)
        assert os.environ["SCAN_PASSWORD"] == "fake-secret-password"
        sys.exit(1 if args[-1] == "landlord" else 2)
    else:
        assert args[-2] == "-c"
        assert "http://fastapi:8000/openapi.json" in args[-1]
        print(json.dumps({"paths": {"/api/auth/me": {"get": {}}, "/api/auth/logout": {"post": {}}}}))
else:
    raise AssertionError(args)
''', encoding="utf-8")
    shim.chmod(0o755)
    log = tmp_path / "commands.jsonl"
    env = {**os.environ, "PATH": str(tools) + os.pathsep + os.environ["PATH"],
           "ZAP_TEST_CASE": case, "ZAP_TEST_LOG": str(log)}
    result = subprocess.run(["bash", str(tmp_path / "run-zap.sh"), mode],
                            env=env, capture_output=True, text=True)
    assert result.returncode == expected, result.stdout + result.stderr
    calls = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    scans = [call for call in calls if "/zap/wrk/scan-driver.py" in call]
    if case == "all":
        assert [call[-1] for call in scans] == ["landlord", "tenant"]
        assert "api-landlord: 1" in result.stdout
        assert "api-tenant: 2" in result.stdout
    elif case == "web":
        assert len(scans) == 1
        assert "web: 2" in result.stdout
    else:
        assert not scans
        assert not (tmp_path / "zap-out").exists()
    assert "fake-secret-password" not in result.stdout + result.stderr + log.read_text(encoding="utf-8")
    for path in (tmp_path / "zap-out").rglob("*"):
        if path.is_file():
            assert "fake-secret-password" not in path.read_text(encoding="utf-8")
