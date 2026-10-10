"""Store 的表名／欄名白名單：只允許一般識別字，擋掉任何能改變 SQL 結構的字元。"""
import pytest

from db.sqlstore import Store, _check_identifiers


@pytest.mark.parametrize("name", ["site_settings", "monitor_meta", "key", "_private", "Col2"])
def test_accepts_plain_identifiers(name):
    _check_identifiers(name)


@pytest.mark.parametrize("name", [
    "users; DROP TABLE users", "key`", "a b", "1abc", "", "x--", "name)", "表", "key\n",
])
def test_rejects_anything_else(name):
    with pytest.raises(ValueError):
        _check_identifiers("ok_table", name)


def test_upsert_rejects_bad_column_before_touching_database():
    # 連線給 None：如果驗證沒有在執行 SQL 之前發生，這裡會先炸 AttributeError 而不是 ValueError。
    store = Store(None)
    with pytest.raises(ValueError):
        store.upsert("site_settings", {"key": "a"}, {"value` = 1, `admin": "x"})


def test_insert_ignore_rejects_bad_table_before_touching_database():
    store = Store(None)
    with pytest.raises(ValueError):
        store.insert_ignore("announcement_reads WHERE 1=1 --", {"user_id": 1}, {"read_at": "t"})
