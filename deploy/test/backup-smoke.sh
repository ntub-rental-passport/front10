#!/usr/bin/env bash
#
# 不連 Docker 或 Google Drive；以假指令驗證備份流程，也能在 macOS 執行。
# 用法：bash deploy/test/backup-smoke.sh

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/rentmate-backup-test.XXXXXX")
TEST_ROOT=$(cd "$TEST_ROOT" && pwd -P)
ORIGINAL_PATH="$PATH"
export SMOKE_REAL_DATE
SMOKE_REAL_DATE=$(command -v date)
trap 'rm -rf "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/bin"

# 所有外部服務都記錄參數，restic 還會檢查收到的是展開後的備份內容。
cat > "$TEST_ROOT/bin/shim" <<'PY'
#!/usr/bin/env python3
import fcntl
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile

command = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["SMOKE_LOG"], "a") as log:
    log.write(json.dumps([command, *args]) + "\n")

def write_tar(target, name, contents, mode="w"):
    with tarfile.open(**target, mode=mode) as archive:
        member = tarfile.TarInfo(name)
        member.size = len(contents)
        archive.addfile(member, io.BytesIO(contents))

if command == "docker":
    if args == ["compose", "config", "--format", "json"]:
        print(json.dumps({"services": {"fastapi": {"environment": {
            "DATABASE_URL": "mysql+pymysql://rentmate:fake-db-secret@140.131.114.242/115-RentMate",
        }}}}))
    elif args[:3] == ["run", "--rm", "--network"]:
        assert os.environ["MYSQL_PWD"] == "fake-db-secret"
        print("CREATE TABLE smoke (id INT);")
    elif args[:5] == ["compose", "exec", "-T", "fastapi", "python"]:
        sys.stdin.read()
        if os.environ.get("SMOKE_SQLITE_FAIL"):
            raise SystemExit(1)
        write_tar({"fileobj": sys.stdout.buffer}, "audit.db", b"fake sqlite snapshot")
    elif args[:2] == ["run", "--rm"] and "rentmate_certbot_conf:/src:ro" in args:
        dest = next(arg[:-5] for arg in args if arg.endswith(":/dst"))
        write_tar({"name": str(Path(dest) / "certbot_conf.tar.gz")}, "cert.pem", b"fake cert", "w:gz")
    else:
        raise SystemExit("非預期的 docker 參數")
elif command == "restic":
    assert os.environ["RESTIC_REPOSITORY"] == "rclone:gdrive:rentmate-backup"
    assert os.environ["RESTIC_PASSWORD_FILE"] == str(Path.home() / ".config/rentmate/restic-password")
    if args[0] == "backup":
        staging = Path.home() / "backups/staging"
        for name in ("db.sql", "env", "key/vision.json", "certbot_conf.tar.gz", "sqlite.tar", "MANIFEST.txt", "host/crontab.txt"):
            if name == "sqlite.tar" and os.environ.get("SMOKE_SQLITE_FAIL"):
                continue
            assert (staging / name).is_file(), name
        assert str(staging) in args
        uploads = Path(os.environ["SMOKE_PROJECT"]) / "data/uploads"
        assert str(uploads) in args
        assert (uploads / "inspection/a.jpg").read_bytes() == b"fake photo\n"
        shutil.copytree(staging, Path(os.environ["SMOKE_CASE"]) / "snapshot", dirs_exist_ok=True)
    if args[0] == os.environ.get("SMOKE_RESTIC_FAIL"):
        raise SystemExit(7)
elif command == "flock":
    assert args == ["-n", "9"]
    try:
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(1)
elif command == "date":
    if args == ["+%u"]:
        assert os.environ["TZ"] == "Asia/Taipei"
        print(os.environ["SMOKE_WEEKDAY"])
    else:
        os.execv(os.environ["SMOKE_REAL_DATE"], ["date", *args])
elif command != "rclone":
    raise SystemExit("非預期的假指令")
PY
chmod +x "$TEST_ROOT/bin/shim"
for tool in docker restic rclone flock date; do
    ln -s shim "$TEST_ROOT/bin/$tool"
done

setup_case() {
    export SMOKE_CASE="$TEST_ROOT/$1"
    export HOME="$SMOKE_CASE/home"
    export SMOKE_PROJECT="$HOME/rentmate"
    export SMOKE_LOG="$SMOKE_CASE/commands.jsonl"
    export SMOKE_WEEKDAY=7
    export PATH="$TEST_ROOT/bin:$ORIGINAL_PATH"
    unset RESTIC_REPOSITORY RESTIC_PASSWORD_FILE SMOKE_RESTIC_FAIL SMOKE_SQLITE_FAIL
    mkdir -p "$SMOKE_PROJECT/deploy" "$SMOKE_PROJECT/key" \
        "$SMOKE_PROJECT/data/uploads/inspection" "$HOME/.config/rentmate"
    cp "$SCRIPT_DIR/backup.sh" "$SMOKE_PROJECT/deploy/backup.sh"
    printf 'JWT_SECRET=fake-env-secret\n' > "$SMOKE_PROJECT/.env"
    printf '{}\n' > "$SMOKE_PROJECT/key/vision.json"
    printf 'fake photo\n' > "$SMOKE_PROJECT/data/uploads/inspection/a.jpg"
    printf 'fake-restic-secret\n' > "$HOME/.config/rentmate/restic-password"
    chmod 600 "$HOME/.config/rentmate/restic-password"
    : > "$SMOKE_LOG"
}

run_backup() {
    RUN_STATUS=0
    bash "$SMOKE_PROJECT/deploy/backup.sh" "$@" > "$SMOKE_CASE/output.log" 2>&1 || RUN_STATUS=$?
}

check_success() {
    setup_case success
    for legacy in inspection-photos repair-photos banner-images; do
        mkdir -p "$SMOKE_PROJECT/data/$legacy"
        printf 'legacy photo\n' > "$SMOKE_PROJECT/data/$legacy/old.jpg"
    done
    # 放入七份舊備份，確認新備份產生後仍只留下七份。
    mkdir -p "$HOME/backups"
    for index in 1 2 3 4 5 6 7; do
        touch -t 202001010000 "$HOME/backups/rentmate-backup-2020010$index-000000.tar.gz"
    done
    START_EPOCH=$(date +%s)
    run_backup
    [ "$RUN_STATUS" -eq 0 ]
    [ ! -e "$HOME/backups/staging" ]
    python3 - "$START_EPOCH" <<'PY'
import json
import os
from pathlib import Path
import sys
import tarfile
import time

project = Path(os.environ["SMOKE_PROJECT"])
epoch = int((project / "data/backup-status/last-success").read_text())
assert int(sys.argv[1]) <= epoch <= int(time.time())
calls = [json.loads(line) for line in Path(os.environ["SMOKE_LOG"]).read_text().splitlines()]
restic = [call[1:] for call in calls if call[0] == "restic"]
sources = [str(Path.home() / "backups/staging"), str(project / "data/uploads")]
sources += [str(project / "data" / name) for name in ("inspection-photos", "repair-photos", "banner-images")]
assert restic == [
    ["backup", "--host", "rentmate-vm", "--tag", "rentmate", *sources],
    ["forget", "--host", "rentmate-vm", "--tag", "rentmate", "--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "3", "--prune"],
    ["check"],
], restic
archives = list((Path.home() / "backups").glob("rentmate-backup-*.tar.gz"))
assert len(archives) == 7
archive = max(archives, key=lambda path: path.stat().st_mtime)
with tarfile.open(archive) as tar:
    names = {name.split("/", 1)[-1] for name in tar.getnames()}
    assert {"db.sql", "env", "sqlite.tar", "certbot_conf.tar.gz", "key/vision.json", "MANIFEST.txt"} <= names
    assert not any("uploads" in name for name in names)
output = (Path(os.environ["SMOKE_CASE"]) / "output.log").read_text()
assert all(secret not in output for secret in ("fake-db-secret", "fake-restic-secret", "fake-env-secret"))
assert all(f"data/{name}" in output for name in ("inspection-photos", "repair-photos", "banner-images"))
PY
}

check_failure() {
    setup_case failure
    export SMOKE_RESTIC_FAIL=backup
    run_backup
    [ "$RUN_STATUS" -ne 0 ]
    [ ! -e "$SMOKE_PROJECT/data/backup-status/last-success" ]
    [ ! -e "$HOME/backups/staging" ]

    # 舊的成功紀錄必須連修改時間都保留。
    mkdir -p "$SMOKE_PROJECT/data/backup-status"
    printf '1234567890\n' > "$SMOKE_PROJECT/data/backup-status/last-success"
    touch -t 202001010000 "$SMOKE_PROJECT/data/backup-status/last-success"
    cp -p "$SMOKE_PROJECT/data/backup-status/last-success" "$SMOKE_CASE/previous-success"
    run_backup
    [ "$RUN_STATUS" -ne 0 ]
    [ ! -e "$HOME/backups/staging" ]
    python3 - <<'PY'
import json
import os
from pathlib import Path

status = Path(os.environ["SMOKE_PROJECT"]) / "data/backup-status/last-success"
previous = Path(os.environ["SMOKE_CASE"]) / "previous-success"
assert status.read_bytes() == previous.read_bytes()
assert status.stat().st_mtime_ns == previous.stat().st_mtime_ns
calls = [json.loads(line) for line in Path(os.environ["SMOKE_LOG"]).read_text().splitlines()]
assert [call[1] for call in calls if call[0] == "restic"] == ["backup", "backup"]
PY

    # 快照成功但後續步驟失敗，也不能更新監控時間。
    for failed_step in forget check; do
        export SMOKE_RESTIC_FAIL="$failed_step"
        run_backup
        [ "$RUN_STATUS" -ne 0 ]
        [ ! -e "$HOME/backups/staging" ]
        cmp "$SMOKE_PROJECT/data/backup-status/last-success" "$SMOKE_CASE/previous-success"
    done
    unset SMOKE_RESTIC_FAIL
    export SMOKE_SQLITE_FAIL=1
    run_backup
    [ "$RUN_STATUS" -ne 0 ]
    [ ! -e "$HOME/backups/staging" ]
    cmp "$SMOKE_PROJECT/data/backup-status/last-success" "$SMOKE_CASE/previous-success"
}

check_permissions() {
    setup_case permissions
    chmod 644 "$HOME/.config/rentmate/restic-password"
    run_backup
    [ "$RUN_STATUS" -eq 1 ]
    [ ! -e "$SMOKE_PROJECT/data/backup-status/last-success" ]
    [ ! -e "$HOME/backups" ]
    [ ! -s "$SMOKE_LOG" ]
    grep -q 'deploy/README.md' "$SMOKE_CASE/output.log"
}

check_local_only() {
    setup_case local_only
    # 本機模式連異地備份的前置檢查也應跳過。
    rm "$HOME/.config/rentmate/restic-password"
    run_backup --local-only
    [ "$RUN_STATUS" -eq 0 ]
    [ ! -e "$SMOKE_PROJECT/data/backup-status/last-success" ]
    [ ! -e "$HOME/backups/staging" ]
    python3 - <<'PY'
import json
import os
from pathlib import Path

calls = [json.loads(line) for line in Path(os.environ["SMOKE_LOG"]).read_text().splitlines()]
assert all(call[0] != "restic" for call in calls)
assert len(list((Path.home() / "backups").glob("rentmate-backup-*.tar.gz"))) == 1
PY
}

FAILURES=0
for test_case in success failure permissions local_only; do
    # 不把測試函式放進 if，否則 bash 會停用函式內的 errexit。
    set +e
    (set -e; "check_$test_case")
    RESULT=$?
    set -e
    if [ "$RESULT" -eq 0 ]; then
        echo "PASS: $test_case"
    else
        echo "FAIL: $test_case"
        cat "$TEST_ROOT/$test_case/output.log" 2>/dev/null || true
        FAILURES=$((FAILURES + 1))
    fi
done
[ "$FAILURES" -eq 0 ]
