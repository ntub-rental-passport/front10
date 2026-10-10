"""清理資料庫已不再引用的點交照片、報修照片與租約附件。

預設只列出孤兒檔；加上 --apply 才刪除。未知檔名與符號連結一律保留，
一小時內更新的檔案也保留；超過 24 小時且未被引用的 .part 暫存檔
也列入孤兒檔。尚未建立的目錄直接略過。

    python backend/scripts/cleanup_orphan_uploads.py
    python backend/scripts/cleanup_orphan_uploads.py --kind inspection --apply
    python -m scripts.cleanup_orphan_uploads --kind repairs --kind contracts
"""
import argparse
import re
import stat
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from db import models  # noqa: E402
from db.database import engine as default_engine  # noqa: E402
from routers import inspection, landlord_contracts, repairs  # noqa: E402


# 上傳先寫檔再提交資料庫，保留近期檔案以免誤刪尚未提交的上傳。
RECENT_GRACE_SECONDS = 3600

KINDS = {
    "inspection": (inspection.photo_directory, models.InspectionRecord.photo_url,
                   re.compile(r"[0-9a-f]{32}\.jpg")),
    "repairs": (repairs.photo_directory, models.RepairTicketPhoto.photo_url, repairs._STORED_NAME),
    "contracts": (landlord_contracts.file_directory, models.LandlordLeaseFile.stored_name,
                  landlord_contracts._STORED_NAME),
}


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if value < 1024 or unit == "TiB":
            return f"{value:.1f} {unit}"
        value /= 1024


def run(kinds=None, apply: bool = False, engine=None, out=sys.stdout) -> int:
    kinds = list(dict.fromkeys(KINDS if kinds is None else kinds))
    engine = default_engine if engine is None else engine
    if engine is None:
        print("資料庫無法連線：尚未設定 DATABASE_URL。", file=out)
        return 1

    started = time.time()
    # 先完成所有查詢，避免資料庫連線失敗時已經刪掉部分種類的檔案。
    try:
        with Session(engine) as db:
            references = {
                kind: {row[0] for row in db.query(KINDS[kind][1]).all() if isinstance(row[0], str)}
                for kind in kinds
            }
    except SQLAlchemyError:
        print("資料庫無法連線或讀取引用資料，未刪除任何檔案。", file=out)
        return 1

    print("模式：實際刪除" if apply else "模式：僅預覽（不刪除檔案）", file=out)
    cutoff = started - 24 * 60 * 60
    recent_cutoff = started - RECENT_GRACE_SECONDS
    status = 0
    for kind in kinds:
        directory_fn, _, pattern = KINDS[kind]
        directory = directory_fn()
        try:
            entries = sorted(directory.iterdir())
        except FileNotFoundError:
            print(f"[{kind}] 目錄：{directory}（不存在，略過）", file=out)
            continue
        except OSError as error:
            print(f"[{kind}] 目錄：{directory}", file=out)
            print(f"目錄無法讀取：{error.strerror or str(error)}", file=out)
            status = 1
            continue
        print(f"[{kind}] 目錄：{directory}", file=out)
        total = referenced = unknown = fresh_parts = recent = 0
        orphans = []
        try:
            for path in entries:
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    total += 1
                    unknown += 1
                    continue
                if not stat.S_ISREG(info.st_mode):
                    continue
                total += 1
                if info.st_mtime > recent_cutoff:
                    recent += 1
                elif path.name.endswith(".part"):
                    if path.name in references[kind]:
                        referenced += 1
                    elif info.st_mtime < cutoff:
                        orphans.append((path, info.st_size))
                    else:
                        fresh_parts += 1
                elif not pattern.fullmatch(path.name):
                    unknown += 1
                elif path.name in references[kind]:
                    referenced += 1
                else:
                    orphans.append((path, info.st_size))
        except OSError as error:
            print(f"目錄無法讀取：{error.strerror or str(error)}", file=out)
            status = 1
            continue

        size = sum(size for _, size in orphans)
        print(f"檔案總數：{total}；已引用：{referenced}；"
              f"孤兒檔：{len(orphans)}（{human_size(size)}）；"
              f"未知：{unknown}；保留暫存檔：{fresh_parts}；近期檔案：{recent}", file=out)
        if not apply:
            for path, size in orphans:
                print(f"  孤兒檔：{path.name}（{human_size(size)}）", file=out)
            continue

        deleted = failures = 0
        for path, _ in orphans:
            try:
                path.unlink()
                deleted += 1
            except OSError as error:
                failures += 1
                status = 1
                print(f"  刪除失敗：{path.name}（{error.strerror or str(error)}）", file=out)
        print(f"已刪除：{deleted}；失敗：{failures}", file=out)
    return status


def main(argv=None, engine=None, out=sys.stdout) -> int:
    parser = argparse.ArgumentParser(description="找出上傳目錄中未被資料庫引用的孤兒檔。")
    parser.add_argument("--apply", action="store_true", help="實際刪除孤兒檔（預設僅預覽）")
    parser.add_argument("--kind", choices=KINDS, action="append", help="指定種類，可重複使用；預設全部")
    args = parser.parse_args(argv)
    return run(kinds=args.kind, apply=args.apply, engine=engine, out=out)


if __name__ == "__main__":
    sys.exit(main())
