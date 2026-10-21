"""將所有 EncryptedText 欄位從舊金鑰輪替至新金鑰，預設僅檢查、不寫入。

在 backend/ 執行 python -m migrations.rotate_pii_key [--apply]，
或 python migrations/rotate_pii_key.py [--apply]。
OLD_PII_ENCRYPTION_KEY、PII_ENCRYPTION_KEY 與 DATABASE_URL 僅從環境變數讀取。
"""
import argparse
import base64
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import LargeBinary, column, create_engine, select, table

from db.encrypted_fields import EncryptedText

AAD = b'rentmate-pii-v1'


class RotationError(ValueError):
    """可安全顯示、不含敏感資料的輪替錯誤。"""


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # 不回顯誤放在命令列的金鑰或連線資訊。
        super().error('命令列參數無效；僅支援 --apply 與 --help。')


def read_settings():
    keys = []
    for name in ('OLD_PII_ENCRYPTION_KEY', 'PII_ENCRYPTION_KEY'):
        try:
            key = base64.b64decode(os.environ.get(name, ''), validate=True)
        except ValueError:
            raise RotationError(f'{name} 必須是以 base64 編碼的 32 位元組金鑰。') from None
        if len(key) != 32:
            raise RotationError(f'{name} 必須是以 base64 編碼的 32 位元組金鑰。')
        keys.append(key)
    if keys[0] == keys[1]:
        raise RotationError('新舊個資金鑰不可相同。')
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise RotationError('必須設定 DATABASE_URL 環境變數。')
    return url, keys[0], keys[1]


def encrypted_tables():
    # 驗證環境變數後才載入模型，避免 db.database 載入 .env 成為輸入來源。
    from db import models
    from db.database import Base

    for model_table in Base.metadata.sorted_tables:
        names = [col.name for col in model_table.columns if isinstance(col.type, EncryptedText)]
        if not names:
            continue
        pk_names = [col.name for col in model_table.primary_key.columns]
        if not pk_names:
            raise RotationError(f'{model_table.fullname} 缺少主鍵，無法安全輪替。')
        # 使用無 TypeDecorator、無 onupdate 的 SQL 欄位，僅更新原始密文。
        raw_table = table(model_table.name, *(
            column(col.name, LargeBinary() if isinstance(col.type, EncryptedText) else col.type)
            for col in model_table.columns
        ), schema=model_table.schema)
        yield raw_table, pk_names, names


def decrypt(value, cipher):
    if not isinstance(value, (bytes, bytearray, memoryview)):
        return None
    value = bytes(value)
    if len(value) < 29 or value[0] != 1:
        return None
    try:
        return cipher.decrypt(value[1:13], value[13:], AAD)
    except InvalidTag:
        return None


def rotate(engine, old_key, new_key, apply=False):
    old_cipher, new_cipher = AESGCM(old_key), AESGCM(new_key)
    pending = []
    undecryptable = 0
    with engine.begin() as connection:
        for raw_table, pk_names, names in encrypted_tables():
            counts = {name: {'new': 0, 'old': 0, 'undecryptable': 0} for name in names}
            selected = [raw_table.c[name] for name in dict.fromkeys(pk_names + names)]
            for row in connection.execute(select(*selected)).mappings():
                primary_key = {name: row[name] for name in pk_names}
                for name in names:
                    value = row[name]
                    if value is None:
                        continue
                    if decrypt(value, new_cipher) is not None:
                        counts[name]['new'] += 1
                        continue
                    plaintext = decrypt(value, old_cipher)
                    if plaintext is not None:
                        counts[name]['old'] += 1
                        if apply:
                            pending.append((raw_table, name, primary_key, bytes(value), plaintext))
                    else:
                        counts[name]['undecryptable'] += 1
                        undecryptable += 1
                        print(f'無法解密：資料表={raw_table.fullname} 主鍵={primary_key!r} 欄位={name}')
            for name, count in counts.items():
                print(f'{raw_table.fullname}.{name}: new={count["new"]} old={count["old"]} '
                      f'undecryptable={count["undecryptable"]}')

        if apply and undecryptable:
            raise RotationError('存在無法解密的值，已中止輪替，未寫入任何資料。')
        for raw_table, name, primary_key, old_bytes, plaintext in pending:
            nonce = os.urandom(12)
            new_bytes = b'\x01' + nonce + new_cipher.encrypt(nonce, plaintext, AAD)
            conditions = [raw_table.c[key] == value for key, value in primary_key.items()]
            result = connection.execute(raw_table.update().where(
                *conditions, raw_table.c[name] == old_bytes,
            ).values({name: new_bytes}))
            if result.rowcount != 1:
                raise RotationError('偵測到並行修改，已回復整筆交易。')

        # 全部更新後才逐一重讀，避免漏掉後續更新造成的異動。
        for raw_table, name, primary_key, _, plaintext in pending:
            conditions = [raw_table.c[key] == value for key, value in primary_key.items()]
            value = connection.execute(select(raw_table.c[name]).where(*conditions)).scalar_one_or_none()
            if value is None or decrypt(value, new_cipher) != plaintext:
                raise RotationError('輪替後解密驗證失敗，已回復整筆交易。')
    return len(pending)


def main(argv=None):
    parser = ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--apply', action='store_true', help='通過完整檢查後，在單一交易內寫入並驗證')
    args = parser.parse_args(argv)
    engine = None
    try:
        url, old_key, new_key = read_settings()
        engine = create_engine(url, hide_parameters=True)
        rotated = rotate(engine, old_key, new_key, apply=args.apply)
        if args.apply:
            print(f'已輪替 {rotated} 個值。')
        else:
            print('僅檢查，未寫入任何資料；使用 --apply 執行輪替。')
        return 0
    except RotationError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        # 資料庫例外可能含連線資訊或 SQL 參數，不輸出原始例外。
        print('金鑰輪替失敗，交易未提交。', file=sys.stderr)
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    sys.exit(main())
