"""共用檔案儲存、加密與圖片處理。"""
import base64
import io
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

from admin import banner_images
import storage
from storage import EncryptionUnavailable


def image_bytes(size=(80, 40), fmt='PNG', mode='RGB', **kwargs):
    buffer = io.BytesIO()
    Image.new(mode, size).save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


class StorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.key = b'k' * 32
        env = {env_var: str(self.root / kind) for kind, (env_var, _) in storage.KINDS.items()}
        env['FILE_ENCRYPTION_KEY'] = base64.b64encode(self.key).decode()
        env_patch = patch.dict(os.environ, env)
        env_patch.start()
        self.addCleanup(env_patch.stop)

    def test_directory_reads_each_environment_variable_at_call_time(self):
        expected = {
            'banners': 'BANNER_IMAGE_DIR', 'inspection': 'INSPECTION_UPLOAD_DIR',
            'repairs': 'REPAIR_UPLOAD_DIR', 'contracts': 'LEASE_FILE_DIR',
            'reviews': 'REVIEW_FILE_DIR', 'subsidy': 'SUBSIDY_FILE_DIR',
            'avatars': 'AVATAR_FILE_DIR',
        }
        self.assertEqual(set(storage.KINDS), set(expected))
        for kind, env_var in expected.items():
            with self.subTest(kind=kind):
                self.assertEqual(storage.directory(kind), self.root / kind)
                with patch.dict(os.environ, {env_var: str(self.root / 'other' / kind)}):
                    self.assertEqual(storage.directory(kind), self.root / 'other' / kind)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_defaults_match_existing_routers(self):
        # 只比較目錄，但匯入路由會初始化驗證模組；測試不依賴本機 .env。
        with patch.dict(os.environ, {'JWT_SECRET': os.getenv('JWT_SECRET') or 'storage-test-secret-at-least-32-bytes'}):
            from routers import inspection, landlord_contracts, repairs

        existing = {
            'banners': banner_images.image_dir, 'inspection': inspection.photo_directory,
            'repairs': repairs.photo_directory, 'contracts': landlord_contracts.file_directory,
        }
        with patch.dict(os.environ):
            for env_var, _ in storage.KINDS.values():
                os.environ.pop(env_var, None)
            for kind, original_directory in existing.items():
                with self.subTest(kind=kind):
                    self.assertEqual(storage.directory(kind), original_directory())
            backend_dir = Path(__file__).resolve().parents[1]
            for kind in ('reviews', 'subsidy', 'avatars'):
                self.assertEqual(storage.directory(kind), backend_dir / 'uploads' / kind)

    def test_unknown_kind_raises_value_error(self):
        with self.assertRaises(ValueError):
            storage.directory('unknown')
        with self.assertRaises(ValueError):
            storage.save('unknown', b'content', 'pdf')
        self.assertEqual(list(self.root.iterdir()), [])

    def test_plain_round_trip_for_every_kind(self):
        data = b'file content\x00\xff'
        for kind in storage.KINDS:
            with self.subTest(kind=kind):
                name = storage.save(kind, data, 'pdf')
                self.assertRegex(name, r'^[0-9a-f]{32}\.pdf$')
                path = storage.directory(kind) / name
                self.assertEqual(storage.path_of(kind, name), path)
                self.assertEqual(path.read_bytes(), data)
                self.assertEqual(storage.read(kind, name), data)
                self.assertEqual(list(path.parent.iterdir()), [path])
                storage.delete(kind, name)
                self.assertFalse(path.exists())
                with self.assertRaises(FileNotFoundError):
                    storage.read(kind, name)

    def test_encrypted_round_trip_and_format(self):
        data = b'private file content' * 10
        name = storage.save('reviews', data, 'pdf', encrypt=True)
        path = storage.path_of('reviews', name)
        blob = path.read_bytes()
        self.assertNotEqual(blob, data)
        self.assertNotIn(data, blob)
        self.assertEqual(blob[0], 1)
        self.assertEqual(len(blob), len(data) + 29)
        self.assertEqual(AESGCM(self.key).decrypt(blob[1:13], blob[13:], b'rentmate-file-v1:reviews'), data)
        self.assertEqual(storage.read('reviews', name, encrypted=True), data)
        self.assertEqual(list(path.parent.iterdir()), [path])
        storage.delete('reviews', name)
        self.assertFalse(path.exists())

    def test_each_save_uses_a_new_name_and_nonce(self):
        first = storage.save('reviews', b'content', 'pdf', encrypt=True)
        second = storage.save('reviews', b'content', 'pdf', encrypt=True)
        self.assertNotEqual(first, second)
        self.assertNotEqual(storage.read('reviews', first)[1:13], storage.read('reviews', second)[1:13])

    def test_encrypted_empty_file_round_trip(self):
        name = storage.save('subsidy', b'', 'pdf', encrypt=True)
        self.assertEqual(storage.read('subsidy', name, encrypted=True), b'')

    def test_decrypt_under_a_different_kind_fails(self):
        name = storage.save('reviews', b'private content', 'pdf', encrypt=True)
        with patch.dict(os.environ, {'SUBSIDY_FILE_DIR': str(storage.directory('reviews'))}):
            with self.assertRaises(ValueError):
                storage.read('subsidy', name, encrypted=True)

    def test_missing_or_invalid_key_fails_save_and_read_without_plaintext_fallback(self):
        name = storage.save('reviews', b'private content', 'pdf', encrypt=True)
        keys = (None, '', 'not base64!', '不是金鑰', base64.b64encode(b'short').decode(),
                base64.b64encode(b'x' * 33).decode())
        for key in keys:
            with self.subTest(key=key), patch.dict(os.environ):
                if key is None:
                    os.environ.pop('FILE_ENCRYPTION_KEY', None)
                else:
                    os.environ['FILE_ENCRYPTION_KEY'] = key
                with self.assertRaisesRegex(EncryptionUnavailable, '金鑰'):
                    storage.save('subsidy', b'private content', 'pdf', encrypt=True)
                self.assertFalse(storage.directory('subsidy').exists())
                with self.assertRaisesRegex(EncryptionUnavailable, '金鑰'):
                    storage.read('reviews', name, encrypted=True)
        self.assertIsInstance(EncryptionUnavailable(), RuntimeError)

    def test_plain_storage_does_not_require_an_encryption_key(self):
        with patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': ''}):
            name = storage.save('reviews', b'content', 'pdf')
            self.assertEqual(storage.read('reviews', name), b'content')

    def test_wrong_key_fails_authentication(self):
        name = storage.save('reviews', b'content', 'pdf', encrypt=True)
        with patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': base64.b64encode(b'z' * 32).decode()}):
            with self.assertRaises(ValueError):
                storage.read('reviews', name, encrypted=True)

    def test_corrupt_or_plaintext_blobs_are_rejected(self):
        name = storage.save('reviews', b'private content', 'pdf', encrypt=True)
        path = storage.path_of('reviews', name)
        blob = path.read_bytes()
        invalid_blobs = (
            b'', b'\x01', blob[:28], b'\x02' + blob[1:],
            blob[:1] + bytes([blob[1] ^ 1]) + blob[2:],
            blob[:-1] + bytes([blob[-1] ^ 1]), b'plaintext file content' * 3,
        )
        for invalid in invalid_blobs:
            with self.subTest(blob=invalid):
                path.write_bytes(invalid)
                with self.assertRaises(ValueError):
                    storage.read('reviews', name, encrypted=True)

    def test_extensions_are_lowercase_and_validated(self):
        for ext in ('JPG', 'jpeg', 'a1', 'abc12'):
            with self.subTest(ext=ext):
                name = storage.save('reviews', b'content', ext)
                self.assertTrue(name.endswith('.' + ext.lower()))
        for ext in ('', 'a', 'abcdef', '.jpg', '../jpg', 'jpg/..', 'jpg\x00', 'jpg\n', '圖檔'):
            with self.subTest(ext=ext), self.assertRaises(ValueError):
                storage.save('subsidy', b'content', ext)
        self.assertFalse(storage.directory('subsidy').exists())

    def test_path_of_and_read_reject_invalid_names(self):
        names = (
            '../x.jpg', 'A' * 32 + '.jpg', 'a' * 31 + '.jpg', 'a' * 33 + '.jpg',
            'x.jpg/..', str(self.root / ('a' * 32 + '.jpg')), 'a' * 32 + '.jpg\x00',
            'a' * 32 + '.jpg\n', 'a' * 32 + '.JPG', 'a' * 32 + '.a',
            'a' * 32 + '.abcdef', 'a' * 32 + '.jpg.part', '', None,
        )
        for name in names:
            with self.subTest(name=name):
                self.assertIsNone(storage.path_of('reviews', name))
                with self.assertRaises(FileNotFoundError):
                    storage.read('reviews', name)

    def test_symlink_outside_directory_is_rejected(self):
        outside = self.root / 'outside.jpg'
        outside.write_bytes(b'private content')
        folder = storage.directory('reviews')
        folder.mkdir()
        name = 'a' * 32 + '.jpg'
        (folder / name).symlink_to(outside)
        self.assertIsNone(storage.path_of('reviews', name))
        with self.assertRaises(FileNotFoundError):
            storage.read('reviews', name)
        with self.assertLogs('storage', level='WARNING'):
            storage.delete('reviews', name)
        self.assertEqual(outside.read_bytes(), b'private content')

    def test_interrupted_write_does_not_expose_a_final_file(self):
        def fail_write(path, data):
            with path.open('wb') as output:
                output.write(data[:3])
            self.assertEqual(path.suffix, '.part')
            self.assertEqual(list(path.parent.iterdir()), [path])
            raise OSError('模擬寫入失敗')

        with patch.object(Path, 'write_bytes', fail_write):
            with self.assertRaises(OSError):
                storage.save('reviews', b'content', 'pdf')
        self.assertEqual(list(storage.directory('reviews').iterdir()), [])

    def test_failed_replace_does_not_expose_a_final_file(self):
        with patch.object(Path, 'replace', side_effect=OSError('模擬改名失敗')):
            with self.assertRaises(OSError):
                storage.save('reviews', b'content', 'pdf')
        self.assertEqual(list(storage.directory('reviews').iterdir()), [])

    def test_delete_missing_or_invalid_name_is_harmless(self):
        storage.delete('reviews', 'a' * 32 + '.pdf')
        with self.assertLogs('storage', level='WARNING'):
            storage.delete('reviews', '../x.pdf')
        self.assertFalse(storage.directory('reviews').exists())

    def test_delete_logs_and_swallows_oserror(self):
        name = storage.save('reviews', b'content', 'pdf')
        with patch.object(Path, 'unlink', side_effect=PermissionError('模擬權限不足')):
            with self.assertLogs('storage', level='WARNING'):
                storage.delete('reviews', name)
        self.assertEqual(storage.read('reviews', name), b'content')


class ImageTests(unittest.TestCase):
    def test_reencode_applies_orientation_and_removes_all_exif(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[315] = 'private author'
        data = image_bytes(fmt='JPEG', exif=exif)
        result = storage.reencode_image(data, max_edge=100)
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertEqual(image.size, (40, 80))
            self.assertEqual(image.mode, 'RGB')
            self.assertEqual(dict(image.getexif()), {})
            self.assertNotIn('exif', image.info)

    def test_reencode_limits_longest_edge_and_converts_to_rgb(self):
        for size in ((200, 100), (100, 200)):
            for mode in ('RGBA', 'L', 'P'):
                with self.subTest(size=size, mode=mode):
                    result = storage.reencode_image(image_bytes(size=size, mode=mode), max_edge=50, quality=70)
                    with Image.open(io.BytesIO(result)) as image:
                        self.assertEqual(image.format, 'JPEG')
                        self.assertEqual(image.mode, 'RGB')
                        self.assertEqual(max(image.size), 50)
                        self.assertEqual(min(image.size), 25)

    def test_reencode_rejects_non_images_and_truncated_images(self):
        for data in (b'', b'not an image', image_bytes(fmt='JPEG')[:40]):
            with self.subTest(data=data):
                with self.assertRaisesRegex(ValueError, '^無法解析圖片，請選擇有效的圖片檔案。$'):
                    storage.reencode_image(data, max_edge=100)

    def test_reencode_rejects_over_40_megapixels_before_loading_pixels(self):
        data = image_bytes()
        # 只改 PNG 檔頭與校驗碼，避免測試本身配置超大圖片的像素記憶體。
        header = data[12:16] + struct.pack('>II', 5000, 8001) + data[24:29]
        data = data[:12] + header + struct.pack('>I', zlib.crc32(header)) + data[33:]
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.size, (5000, 8001))
        with patch('storage.ImageOps.exif_transpose') as transpose:
            with self.assertRaisesRegex(ValueError, '^圖片不能超過 4,000 萬像素。$'):
                storage.reencode_image(data, max_edge=100)
            transpose.assert_not_called()

    def test_pillow_decompression_bomb_is_reported_as_value_error(self):
        data = image_bytes()
        with patch.object(Image, 'MAX_IMAGE_PIXELS', 100):
            with self.assertRaises(ValueError):
                storage.reencode_image(data, max_edge=100)
            self.assertIsNone(storage.image_format(data))

    def test_image_format_detects_content(self):
        for fmt in ('JPEG', 'PNG', 'WEBP', 'GIF'):
            with self.subTest(fmt=fmt):
                self.assertEqual(storage.image_format(image_bytes(fmt=fmt)), fmt)

    def test_image_format_rejects_non_images_and_failed_verification(self):
        data = image_bytes()
        corrupt = bytearray(data)
        corrupt[data.index(b'IDAT') + 4] ^= 1
        with Image.open(io.BytesIO(corrupt)) as image:
            self.assertEqual(image.format, 'PNG')
        for invalid in (b'', b'not an image', data[:24], bytes(corrupt)):
            with self.subTest(data=invalid):
                self.assertIsNone(storage.image_format(invalid))


if __name__ == '__main__':
    unittest.main()
