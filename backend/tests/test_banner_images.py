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

from admin import audit_service, banner_images, content_service
from auth.security import get_current_admin
from db.database import get_db
from routers import content_api
from tests.admin_store import AdminStoreTestCase


def image_bytes(size=(2400, 800), fmt='WEBP', color=(70, 69, 165)) -> bytes:
    buffer = io.BytesIO()
    Image.new('RGB', size, color).save(buffer, format=fmt)
    return buffer.getvalue()


class BannerImageTestCase(unittest.TestCase):
    def setUp(self):
        super().setUp()
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
        second = banner_images.save(data, 'another-name.webp')
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


    def test_delete_removes_the_file_and_missing_or_invalid_names_raise(self):
        saved = banner_images.save(image_bytes(size=(600, 200)), 'ok.webp')
        banner_images.delete(saved['name'])
        self.assertFalse((self.dir / saved['name']).exists())
        self.assertEqual(banner_images.listing(), [])
        for name in (saved['name'], '../x.webp', 'unknown.webp'):
            with self.subTest(name=name), self.assertRaises(LookupError):
                banner_images.delete(name)


class ApiTests(BannerImageTestCase, AdminStoreTestCase):
    admin = MagicMock(id=1, email='admin@example.com')

    def client(self, admin_ok=True):
        app = FastAPI()
        app.include_router(content_api.router)
        # 內容服務用測試資料庫，但 get_current_admin 的相依會另外去要連線：不換掉的話，
        # 沒有 .env 的環境（CI、暫存工作區）會先回 503，測不到 401。
        app.dependency_overrides[get_db] = lambda: None
        if admin_ok:
            app.dependency_overrides[get_current_admin] = lambda: self.admin
        return TestClient(app)

    def upload(self, client, data=None, filename='banner.webp', content_type='image/webp'):
        return client.post('/api/admin/banner-images',
                           files={'file': (filename, data if data is not None else image_bytes(), content_type)})

    def create_banner(self, url, title='新功能'):
        return content_service.create_banner({
            'title': title, 'imageUrl': url, 'linkUrl': '/app/subsidy',
            'published': False, 'startAt': '2026-01-01T00:00:00Z', 'endAt': None,
        }, actor=self.admin.email)

    def fill_library(self):
        images = [image_bytes(size=(60, 20), fmt='PNG', color=(i, 0, 0)) for i in range(banner_images.LIMIT)]
        saved = [banner_images.save(data, f'{index}.png') for index, data in enumerate(images)]
        return images, saved

    def test_upload_then_list_then_read_the_image(self):
        client = self.client()
        response = self.upload(client)
        self.assertEqual(response.status_code, 201, response.text)
        url = response.json()['url']
        self.assertEqual(response.json()['usedBy'], [])
        self.assertTrue(response.json()['deletable'])
        self.assertEqual(set(response.json()),
                         {'name', 'url', 'size', 'uploadedAt', 'width', 'height', 'usedBy', 'deletable'})

        listed = client.get('/api/admin/banner-images')
        self.assertEqual([item['url'] for item in listed.json()['items']], [url])
        self.assertEqual(listed.json()['count'], 1)
        self.assertEqual(listed.json()['limit'], 30)

        # 公開讀取：首頁未登入也要看得到圖
        public = self.client(admin_ok=False).get(url)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.headers['content-type'], 'image/webp')
        self.assertIn('max-age', public.headers.get('cache-control', ''))

    def test_upload_list_and_delete_require_an_admin(self):
        client = self.client(admin_ok=False)
        self.assertEqual(self.upload(client).status_code, 401)
        self.assertEqual(client.get('/api/admin/banner-images').status_code, 401)
        self.assertEqual(client.delete('/api/admin/banner-images/nope.webp').status_code, 401)

    def test_list_shows_usage_and_preserves_newest_first_order(self):
        first = banner_images.save(image_bytes(size=(60, 20), fmt='PNG'), 'first.png')
        second = banner_images.save(image_bytes(size=(60, 20), fmt='PNG', color=(1, 2, 3)), 'second.png')
        for index, item in enumerate((first, second)):
            os.utime(self.dir / item['name'], (100 + index, 100 + index))
        banner = self.create_banner(first['url'])
        response = self.client().get('/api/admin/banner-images')
        self.assertEqual(response.status_code, 200)
        expected = []
        for item, used_by in ((second, []), (first, [{'id': banner['id'], 'title': banner['title']}])):
            expected.append({**{key: item[key] for key in ('name', 'url', 'size')},
                             'uploadedAt': 101.0 if item is second else 100.0,
                             'usedBy': used_by, 'deletable': not used_by})
        self.assertEqual(response.json(), {'items': expected, 'count': 2, 'limit': 30})

    def test_empty_library_does_not_list_builtin_images(self):
        self.assertEqual(self.client().get('/api/admin/banner-images').json(),
                         {'items': [], 'count': 0, 'limit': 30})

    def test_delete_unused_image_removes_file_and_records_audit(self):
        saved = banner_images.save(image_bytes(size=(60, 20)), 'unused.webp')
        response = self.client().delete(f'/api/admin/banner-images/{saved["name"]}')
        self.assertEqual(response.status_code, 204, response.text)
        self.assertEqual(response.content, b'')
        self.assertFalse((self.dir / saved['name']).exists())
        events = audit_service.list_events(subject=f'banner-image:{saved["name"]}')
        self.assertEqual(len(events), 1)
        self.assertEqual({key: events[0][key] for key in ('action', 'target', 'detail', 'actor', 'subject')}, {
            'action': '內容管理', 'target': 'Banner 圖片', 'detail': f'刪除輪播圖片「{saved["name"]}」',
            'actor': self.admin.email, 'subject': f'banner-image:{saved["name"]}',
        })

    def test_delete_used_image_is_conflict_and_keeps_file(self):
        saved = banner_images.save(image_bytes(size=(60, 20)), 'used.webp')
        self.create_banner(saved['url'], 'A')
        self.create_banner('https://host' + saved['url'] + '?v=1#image', 'B')
        response = self.client().delete(f'/api/admin/banner-images/{saved["name"]}')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {
            'detail': '這張圖片還有 2 則輪播在用：「A」、「B」。請先替那些輪播換圖再刪除。',
        })
        self.assertTrue((self.dir / saved['name']).exists())
        self.assertEqual(audit_service.list_events(subject=f'banner-image:{saved["name"]}'), [])

    def test_delete_conflict_shows_at_most_three_titles(self):
        saved = banner_images.save(image_bytes(size=(60, 20)), 'used.webp')
        for title in ('A', 'B', 'C', 'D', 'E'):
            self.create_banner(saved['url'], title)
        response = self.client().delete(f'/api/admin/banner-images/{saved["name"]}')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['detail'],
                         '這張圖片還有 5 則輪播在用：「A」、「B」、「C」等 5 則。請先替那些輪播換圖再刪除。')
        self.assertTrue((self.dir / saved['name']).exists())

    def test_delete_invalid_and_unknown_names_is_404(self):
        client = self.client()
        for name in ('..%2Fx.webp', 'unknown.webp', 'bad.exe'):
            with self.subTest(name=name):
                response = client.delete(f'/api/admin/banner-images/{name}')
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json(), {'detail': '找不到這張圖片。'})
        self.assertEqual(audit_service.list_events(), [])

    def test_distinct_upload_when_full_is_conflict_without_a_new_file(self):
        self.fill_library()
        names = {path.name for path in self.dir.iterdir()}
        response = self.upload(self.client(), image_bytes(size=(60, 20), fmt='PNG', color=(255, 0, 0)))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {'detail': '圖庫已滿（30 張），請先刪除未使用的圖片。'})
        self.assertEqual({path.name for path in self.dir.iterdir()}, names)
        self.assertEqual(len(banner_images.listing()), 30)

    def test_identical_upload_when_full_reuses_name_and_reports_existing_usage(self):
        images, saved = self.fill_library()
        banner = self.create_banner(saved[0]['url'])
        client = self.client()
        for filename in ('0.png', 'renamed.png'):
            with self.subTest(filename=filename):
                response = self.upload(client, images[0], filename=filename)
                self.assertEqual(response.status_code, 201, response.text)
                self.assertEqual(response.json()['name'], saved[0]['name'])
                self.assertEqual(response.json()['usedBy'], [{'id': banner['id'], 'title': banner['title']}])
                self.assertFalse(response.json()['deletable'])
                self.assertEqual(len(list(self.dir.iterdir())), 30)

    def test_invalid_upload_when_full_keeps_existing_400_error(self):
        self.fill_library()
        response = self.upload(self.client(), b'not an image')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'detail': '這個檔案不是圖片，請改上傳 WebP、PNG 或 JPG。'})

    def test_a_bad_file_gets_a_chinese_reason(self):
        response = self.upload(self.client(), data=b'not an image')
        self.assertEqual(response.status_code, 400)
        self.assertIn('圖片', response.json()['detail'])

    def test_files_put_on_the_vm_by_hand_also_show_up(self):
        # 管理員可能直接把圖丟進 VM 的資料夾，檔名不會照上傳時的規則（中文、空白、.jpeg）
        self.dir.mkdir(parents=True)
        for name, fmt in (('我的 banner.webp', 'WEBP'), ('photo.jpeg', 'JPEG'), ('A_B-1.PNG', 'PNG')):
            (self.dir / name).write_bytes(image_bytes(size=(1200, 400), fmt=fmt))
        (self.dir / 'readme.txt').write_text('不是圖片')
        (self.dir / 'half.webp.part').write_bytes(b'')

        listed = banner_images.listing()
        self.assertEqual(sorted(item['name'] for item in listed),
                         ['A_B-1.PNG', 'photo.jpeg', '我的 banner.webp'])
        for item in listed:
            self.assertIsNotNone(banner_images.path_of(item['name']))
        # 網址要能直接放進 <img src>，中文與空白得先編碼
        url = next(item['url'] for item in listed if item['name'] == '我的 banner.webp')
        self.assertNotIn(' ', url)
        self.assertEqual(self.client(admin_ok=False).get(url).status_code, 200)

    def test_unknown_image_is_404(self):
        self.assertEqual(self.client(admin_ok=False).get('/api/content/banner-images/nope.webp').status_code, 404)


if __name__ == '__main__':
    unittest.main()
