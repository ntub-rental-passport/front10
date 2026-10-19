"""手動下載台電計畫性工作停電資料至 public/data/，供開發機與種子資料使用。

執行：python scripts/fetch_taipower_outage.py
程式內：from fetch_taipower_outage import sync; sync()

正式環境由 fastapi 背景排程每日同步至 OUTAGE_DATA_DIR，不靠 GitHub workflow。
下載與解析共用 backend/notifications/taipower_sync.py；REPORT 會印出欄位對應，
若官方欄位改動，請比對 REPORT 並調整後端模組的 FIELD_ALIASES。
"""

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 直接執行 scripts/ 下的檔案時，Python 不會自動把後端目錄加入搜尋路徑。
sys.path.insert(0, str(ROOT / 'backend'))
from notifications.taipower_sync import sync as _sync


def sync(verbose=True):
    return _sync(ROOT / 'public/data', verbose=verbose)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    try:
        sync()
    except Exception as error:
        print(f'同步失敗：{error}', file=sys.stderr)
        sys.exit(1)
