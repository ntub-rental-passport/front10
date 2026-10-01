"""後台資料表的測試用資料庫。

後台自己的資料 2026-10-01 從 SQLite 小檔搬進專案的資料庫（見 db/sqlstore.py）。
那些模組不收 session，直接用 database.engine，所以測試要把 engine 換成一個
記憶體資料庫，並先把表建好。

用法：

    class MyTestCase(AdminStoreTestCase):
        def setUp(self):
            super().setUp()
            ...自己的準備...
"""

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from db import database
from db import models  # noqa: F401  匯入才會把資料表註冊進 Base.metadata
from db.database import Base


class AdminStoreTestCase(unittest.TestCase):
    """每個測試一個乾淨的記憶體資料庫，測完自動丟掉。"""

    def setUp(self):
        super().setUp()
        self.engine = create_engine(
            'sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool,
        )
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
