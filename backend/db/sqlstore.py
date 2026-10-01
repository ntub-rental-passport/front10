"""後台那幾個模組共用的連線層：寫法跟原本的 sqlite3 一樣，底層換成專案的資料庫。

## 為什麼有這個檔案

後台自己的資料（系統設定、公告輪播、稽核、通知中心、AI 用量…）原本各自存在
一個 SQLite 小檔。那樣避開了「MySQL 少一張表、後端就起不來」的風險，代價是這些
資料不在 ER 圖與資料庫文件裡，備份與查詢都要另外處理。2026-10-01 決定全部搬進
MySQL。

搬的時候不想把那幾個模組重寫一遍 —— 它們的 SQL 與註解都還正確，改愈多愈容易出
錯。所以這裡提供一個「看起來像 sqlite3 連線」的薄殼：

    with open_store() as db:
        row = db.execute('SELECT value FROM site_settings WHERE `key` = ?', (key,)).fetchone()
        if row: print(row['value'])

`?` 佔位符、`row['欄位名']`、`fetchone/fetchall/rowcount` 都照舊，呼叫端幾乎不用改。

## 不處理的事

- **建表**：資料表由 migrations/ 的 SQL 建立，這裡不會自己 CREATE TABLE。
  原本 SQLite 版是「用到才建檔」，MySQL 不該這樣 —— 表的形狀要能被
  db/schema_check.py 檢查，不能由程式隨手長出來。
- **方言差異**：`INSERT OR IGNORE`、`ON CONFLICT ... DO UPDATE` 這類 SQLite 專用
  語法沒有自動翻譯，呼叫端要改寫成 MySQL 的 `INSERT IGNORE`、
  `ON DUPLICATE KEY UPDATE`。數量不多，而且翻譯的魔法比直接寫清楚更危險。
"""

import re
from contextlib import contextmanager

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from db import database

_PLACEHOLDER = re.compile(r'\?')


class Row:
    """讓結果列同時支援 row['欄位'] 與 row[0]，跟 sqlite3.Row 一樣。"""

    __slots__ = ('_mapping', '_values')

    def __init__(self, mapping):
        self._mapping = mapping
        self._values = tuple(mapping.values())

    def __getitem__(self, key):
        return self._values[key] if isinstance(key, int) else self._mapping[key]

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def keys(self):
        return list(self._mapping.keys())

    def __contains__(self, key):
        return key in self._mapping


class _Result:
    __slots__ = ('_rows', 'rowcount')

    def __init__(self, rows, rowcount):
        self._rows = rows
        self.rowcount = rowcount

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class Store:
    """包著一個 SQLAlchemy 連線，介面比照 sqlite3 的 Connection。"""

    __slots__ = ('_connection',)

    def __init__(self, connection):
        self._connection = connection

    def execute(self, sql: str, params=()):
        """`?` 佔位符照舊；參數用序列傳入，跟 sqlite3 一樣。"""
        index = 0

        def name(_match):
            nonlocal index
            index += 1
            return f':p{index - 1}'

        statement = _PLACEHOLDER.sub(name, sql)
        bound = {f'p{i}': value for i, value in enumerate(params)}
        result = self._connection.execute(text(statement), bound)
        rows = [Row(row._mapping) for row in result] if result.returns_rows else []
        return _Result(rows, result.rowcount)

    def upsert(self, table: str, keys: dict, values: dict, *, add=False):
        """有就更新、沒有就新增。

        不用 MySQL 的 `ON DUPLICATE KEY UPDATE`，也不用 SQLite 的 `ON CONFLICT`：
        測試跑在 SQLite、正式站跑在 MySQL，寫任何一邊的方言另一邊就掛。這幾張表
        都是後台低頻寫入，先 UPDATE 再視情況 INSERT 的成本可以忽略。

        `add=True` 時把 values 累加上去（AI 用量的每日累計用）。
        """
        assignment = ', '.join(f'`{k}` = `{k}` + ?' if add else f'`{k}` = ?' for k in values)
        where = ' AND '.join(f'`{k}` = ?' for k in keys)
        updated = self.execute(
            f'UPDATE {table} SET {assignment} WHERE {where}',
            (*values.values(), *keys.values()),
        ).rowcount
        if updated:
            return
        columns = list(keys) + list(values)
        placeholders = ', '.join('?' for _ in columns)
        names = ', '.join(f'`{c}`' for c in columns)
        self.execute(
            f'INSERT INTO {table} ({names}) VALUES ({placeholders})',
            (*keys.values(), *values.values()),
        )

    def insert_ignore(self, table: str, keys: dict, values: dict) -> int:
        """沒有才新增，已經有就什麼都不做。回 1 代表這次真的寫進去了。

        呼叫端用這個回傳值判斷「是不是我搶到的」（例如額度告警每月只發一次）。
        """
        where = ' AND '.join(f'`{k}` = ?' for k in keys)
        existing = self.execute(f'SELECT 1 FROM {table} WHERE {where}', tuple(keys.values())).fetchone()
        if existing:
            return 0
        columns = list(keys) + list(values)
        placeholders = ', '.join('?' for _ in columns)
        names = ', '.join(f'`{c}`' for c in columns)
        self.execute(
            f'INSERT INTO {table} ({names}) VALUES ({placeholders})',
            (*keys.values(), *values.values()),
        )
        return 1


class StoreUnavailable(SQLAlchemyError):
    """連不上資料庫。

    繼承 SQLAlchemyError 是刻意的：呼叫端原本就用它判斷「讀不到設定」，
    那時的處置（退回預設值）在這裡同樣正確 —— 登入與註冊不能因為資料庫
    暫時連不上就整個停擺。
    """


@contextmanager
def open_store():
    """一次交易：正常結束就 commit，丟例外就 rollback。"""
    if database.engine is None:
        raise StoreUnavailable('資料庫尚未設定（缺少 DATABASE_URL）。')
    connection = database.engine.connect()
    try:
        with connection.begin():
            yield Store(connection)
    finally:
        connection.close()
