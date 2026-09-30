"""輪播圖片上傳（admin/banner_images.py）。"""
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from admin import banner_images
from auth.security import get_current_admin
from routers import content_api


def image_bytes(size=(2400, 800), fmt='WEBP', color=(70, 69, 165)) -> bytes:
    buffer = io.BytesIO()
    Image.new('RGB', size, color).save(buffer, format=fmt)
    return buffer.getvalue()


class BannerImageTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name) / 'banners'
        self.env = patch.dict(os.environ, {'BANNER_IMAGE_DIR': str(self.dir)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()


class StoreTests(BannerImageTestCase):
    def test_reading_does_not_create_the_folder(self):
        self.assertEqual(banner_images.listing(), [])
        self.assertIsNone(banner_images.path_of('anything.webp'))
        self.assertFalse(self.dir.exists())

    def test_saving_returns_a_site_url_and_writes_the_file(self):
        saved = banner_images.save(image_bytes(), '首頁 輪播.webp')
        self.assertTrue(saved['url'].startswith('/api/content/banner-images/'))
        self.assertTrue(saved['name'].endswith('.webp'))
        self.assertGreater(saved['size'], 0)
        self.assertTrue((self.dir / saved['name']).exists())
        self.assertEqual(saved['width'], 2400)
        self.assertEqual(saved['height'], 800)

    def test_the_stored_name_is_safe_whatever_the_upload_was_called(self):
        for name in ('../../etc/passwd.webp', '圖.webp', 'a b/c.webp', '.webp'):
            with self.subTest(name=name):
                saved = banner_images.save(image_bytes(size=(600, 200)), name)
                self.assertRegex(saved['name'], r'^[A-Za-z0-9_-]+\.(webp|png|jpg)$')
                self.assertEqual((self.dir / saved['name']).resolve().parent, self.dir.resolve())

    def test_the_same_image_twice_keeps_one_copy(self):
        data = image_bytes()
        first = banner_images.save(data, 'banner.webp')
        second = banner_images.save(data, '別的名字.webp')
        self.assertEqual(first['name'], second['name'])
        self.assertEqual(len(list(self.dir.iterdir())), 1)

    def test_the_extension_follows_the_real_format_not_the_name(self):
        saved = banner_images.save(image_bytes(fmt='PNG'), 'lying.webp')
        self.assertTrue(saved['name'].endswith('.png'))

    def test_files_that_are_not_images_are_refused(self):
        for data in (b'not an image', b'', image_bytes(fmt='GIF')):
            with self.subTest(data=data[:8]):
                with self.assertRaises(ValueError):
                    banner_images.save(data, 'x.webp')
        self.assertEqual(banner_images.listing(), [])

    def test_oversized_files_and_oversized_images_are_refused(self):
        with self.assertRaises(ValueError):
            banner_images.save(b'x' * (banner_images.MAX_BYTES + 1), 'big.webp')
        with self.assertRaises(ValueError):
            banner_images.save(image_bytes(size=(banner_images.MAX_EDGE + 1, 800)), 'wide.webp')

    def test_listing_is_newest_first(self):
        names = [banner_images.save(image_bytes(size=(600, 200), color=(i, i, i)), f'{i}.webp')['name']
                 for i in range(3)]
        for index, name in enumerate(names):
            os.utime(self.dir / name, (1_790_000_000 + index, 1_790_000_000 + index))
        self.assertEqual([item['name'] for item in banner_images.listing()], list(reversed(names)))
        self.assertTrue(all(item['url'].endswith(item['name']) for item in banner_images.listing()))

    def test_path_of_refuses_names_that_climb_out_of_the_folder(self):
        saved = banner_images.save(image_bytes(size=(600, 200)), 'ok.webp')
        self.assertIsNotNone(banner_images.path_of(saved['name']))
        for name in ('../secret.webp', 'sub/ok.webp', 'ok.webp/../../x', '..%2Fok.webp', 'ok.exe'):
            with self.subTest(name=name):
                self.assertIsNone(banner_images.path_of(name))


class ApiTests(BannerImageTestCase):
    admin = MagicMock(id=1, email='admin@example.com')

    def client(self, admin_ok=True):
        app = FastAPI()
        app.include_router(content_api.router)
        if admin_ok:
            app.dependency_overrides[get_current_admin] = lambda: self.admin
        return TestClient(app)

    def upload(self, client, data=None, filename='banner.webp', content_type='image/webp'):
        return client.post('/api/admin/banner-images',
                           files={'file': (filename, data if data is not None else image_bytes(), content_type)})

    def test_upload_then_list_then_read_the_image(self):
        client = self.client()
        response = self.upload(client)
        self.assertEqual(response.status_code, 201, response.text)
        url = response.json()['url']

        listed = client.get('/api/admin/banner-images')
        self.assertEqual([item['url'] for item in listed.json()['items']], [url])

        # 公開讀取：首頁未登入也要看得到圖
        public = self.client(admin_ok=False).get(url)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.headers['content-type'], 'image/webp')
        self.assertIn('max-age', public.headers.get('cache-control', ''))

    def test_upload_and_list_require_an_admin(self):
        client = self.client(admin_ok=False)
        self.assertEqual(self.upload(client).status_code, 401)
        self.assertEqual(client.get('/api/admin/banner-images').status_code, 401)

    def test_a_bad_file_gets_a_chinese_reason(self):
        response = self.upload(self.client(), data=b'not an image')
        self.assertEqual(response.status_code, 400)
        self.assertIn('圖片', response.json()['detail'])

    def test_unknown_image_is_404(self):
        self.assertEqual(self.client(admin_ok=False).get('/api/content/banner-images/nope.webp').status_code, 404)


if __name__ == '__main__':
    unittest.main()
