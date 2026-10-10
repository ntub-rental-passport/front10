#!/usr/bin/env python3
"""移除會破壞掃描登入狀態或連到外部身分服務的 OpenAPI 操作。"""
import argparse
import copy
from fnmatch import fnmatchcase
import json
from pathlib import Path
import sys


# 集中列出 (方法、路徑 glob、原因)，以免新增端點時漏掉掃描例外。
EXCLUSION_RULES = (
    # 登出會清除 cookie，管理員還會刪除伺服器端 session。
    ("POST", "/api/auth/logout", "登出會清除登入 cookie / session"),
    # Google 登入會呼叫外部 OAuth 服務；假金鑰不應被送到 Google。
    ("*", "/api/auth/google", "Google OAuth 會連到外部服務"),
    ("*", "/api/auth/google/*", "Google OAuth 會連到外部服務"),
    # 此流程需要管理員信箱驗證與 session，本次只掃房東與租客。
    ("*", "/api/auth/admin/*", "管理員驗證與 session 不在本次掃描範圍"),
    # 內部服務端點使用獨立的服務憑證，不是使用者 API。
    ("*", "/api/internal/*", "內部服務端點不適用使用者登入憑證"),
    # password.py 的兩個操作會更新 password_changed_at、撤銷舊 token 並清除 cookie。
    ("POST", "/api/auth/password/change", "變更密碼會撤銷目前登入 token"),
    ("POST", "/api/auth/password/reset/complete", "完成密碼重設會撤銷舊 token"),
    # admin.py 可停用測試帳號，三個身分守門員都會立即拒絕停用的帳號。
    ("PATCH", "/api/admin/users/{user_id}/status", "停用測試帳號會讓掃描失去登入權限"),
)
HTTP_METHODS = frozenset(("get", "put", "post", "delete", "options", "head", "patch", "trace"))


def filter_openapi(document: dict) -> dict:
    filtered = copy.deepcopy(document)
    paths = filtered.get("paths", {})
    for path, item in list(paths.items()):
        for method in list(item):
            if method not in HTTP_METHODS:
                continue
            for rule_method, pattern, reason in EXCLUSION_RULES:
                if rule_method in ("*", method.upper()) and fnmatchcase(path, pattern):
                    print(f"排除 {method.upper()} {path}：{reason}", file=sys.stderr)
                    del item[method]
                    break
        # parameters / servers 等路徑共用欄位不能讓空端點留在匯入清單。
        if not HTTP_METHODS.intersection(item):
            del paths[path]
    return filtered


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    document = json.loads(args.input.read_text(encoding="utf-8"))
    args.output.write_text(json.dumps(filter_openapi(document), ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")


if __name__ == "__main__":
    main()
