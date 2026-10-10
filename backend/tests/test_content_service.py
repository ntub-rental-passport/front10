import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from tests.admin_store import AdminStoreTestCase
from admin import audit_service
from admin import content_service as content

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

NOW = datetime.now(timezone.utc)

def announcement(**overrides):
    values = {
        'title': '停水通知', 'body': '週六停水', 'level': 'info', 'audience': 'all',
        'published': True, 'startAt': iso(NOW - timedelta(hours=1)), 'endAt': None,
    }
    values.update(overrides)
    return values

def banner(**overrides):
    values = {
        'title': '新功能', 'imageUrl': '/banners/subsidy.webp', 'linkUrl': '/app/subsidy',
        'published': True, 'startAt': iso(NOW - timedelta(hours=1)), 'endAt': None,
    }
    values.update(overrides)
    return values

def template(**overrides):
    values = {
        'name': '繳費提醒', 'category': '帳務', 'channels': ['inapp', 'email'],
        'title': '本期帳單', 'body': '請於 {{應繳日}} 前繳費', 'actionUrl': None, 'actionLabel': None, 'enabled': True,
    }
    values.update(overrides)
    return values

class ContentTestCase(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / 'content.db'
        self.env = patch.dict(os.environ, {
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def audit(self):
        return [(e['action'], e['target'], e['detail']) for e in reversed(audit_service.list_events())]

class SeedTests(ContentTestCase):
    def test_first_read_carries_over_the_existing_content(self):
        # 列表是最近更新的在前（見 list_announcements），種子的 updated_at 各不相同
        self.assertEqual([a['id'] for a in content.list_announcements()], ['an-1', 'an-4', 'an-2', 'an-3'])
        self.assertEqual(
            [(b['id'], b['title'], b['imageUrl'], b['order'], b['published']) for b in content.list_banners()],
            [
                ('ban-1', '租補試算上線', '/banners/subsidy.webp', 0, True),
                ('ban-2', '契約分析教學', '/banners/contract.webp', 1, True),
                ('ban-3', '點交存證', '/banners/handover.webp', 2, True),
            ],
        )
        templates = content.list_templates()
        # 同樣是最近更新的在前；種子的 updated_at 各不相同，所以不是 nt-1..nt-5
        self.assertEqual([t['id'] for t in templates], ['nt-3', 'nt-1', 'nt-4', 'nt-2', 'nt-5'])
        self.assertFalse(templates[-1]['enabled'])
        # 搬內容不搬紀錄：初始化本身不算管理員操作
        self.assertEqual(self.audit(), [])

    def test_deleted_seed_content_does_not_come_back(self):
        for item in content.list_banners():
            content.delete_banner(item['id'], actor='a@example.com')
        self.assertEqual(content.list_banners(), [])

class PublicContentTests(ContentTestCase):
    def test_only_active_items_are_public(self):
        public = content.public_content()
        # an-3 已經結束、an-4 是草稿；an-1 比 an-2 晚開始，排前面
        self.assertEqual([a['id'] for a in public['announcements']], ['an-1', 'an-2'])
        self.assertEqual([b['id'] for b in public['banners']], ['ban-1', 'ban-2', 'ban-3'])

    def test_scheduled_and_unpublished_banners_stay_hidden(self):
        content.create_banner(banner(title='下週上線', startAt=iso(NOW + timedelta(days=7))), actor='a@example.com')
        content.create_banner(banner(title='草稿', published=False), actor='a@example.com')
        content.create_banner(banner(title='已結束', endAt=iso(NOW - timedelta(minutes=1))), actor='a@example.com')
        self.assertEqual([b['title'] for b in content.public_content()['banners']], ['租補試算上線', '契約分析教學', '點交存證'])

class AnnouncementTests(ContentTestCase):
    def test_create_update_delete_are_audited(self):
        created = content.create_announcement(announcement(), actor='a@example.com')
        self.assertTrue(created['id'].startswith('an-'))
        self.assertEqual(content.list_announcements()[0]['id'], created['id'])
        updated = content.update_announcement(created['id'], announcement(title='停水延期'), actor='a@example.com')
        self.assertEqual(updated['title'], '停水延期')
        content.delete_announcement(created['id'], actor='a@example.com')
        self.assertNotIn(created['id'], [a['id'] for a in content.list_announcements()])
        self.assertEqual(self.audit(), [
            ('內容管理', '公告', '新增公告「停水通知」'),
            ('內容管理', '公告', '更新公告「停水延期」'),
            ('內容管理', '公告', '刪除公告「停水延期」'),
        ])

    def test_invalid_input_is_rejected_with_a_readable_reason(self):
        for overrides, fragment in [
            ({'title': ' '}, '請輸入公告標題'),
            ({'body': ''}, '請輸入公告內容'),
            ({'level': 'critical'}, '公告等級'),
            ({'audience': 'admin'}, '公告對象'),
            ({'published': 'yes'}, '開關'),
            ({'startAt': 'today'}, '時間格式'),
            ({'endAt': iso(NOW - timedelta(days=1))}, '結束時間必須晚於開始時間'),
        ]:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError) as caught:
                    content.create_announcement(announcement(**overrides), actor='a@example.com')
                self.assertIn(fragment, str(caught.exception))

    def test_unknown_id_raises_lookup_error(self):
        with self.assertRaises(LookupError):
            content.update_announcement('an-missing', announcement(), actor='a@example.com')
        with self.assertRaises(LookupError):
            content.delete_announcement('an-missing', actor='a@example.com')

class BannerAudienceTests(ContentTestCase):
    def test_banners_default_to_everyone(self):
        self.assertEqual({b['audience'] for b in content.list_banners()}, {'all'})
        created = content.create_banner(banner(), actor='a@example.com')
        self.assertEqual(created['audience'], 'all')

    def test_audience_is_stored_and_can_be_changed(self):
        created = content.create_banner(banner(audience='landlord'), actor='a@example.com')
        self.assertEqual(created['audience'], 'landlord')
        updated = content.update_banner(created['id'], banner(audience='tenant'), actor='a@example.com')
        self.assertEqual(updated['audience'], 'tenant')
        self.assertEqual(content.public_content()['banners'][-1]['audience'], 'tenant')

    def test_an_unknown_audience_is_refused(self):
        with self.assertRaises(ValueError):
            content.create_banner(banner(audience='everyone'), actor='a@example.com')


class BannerImageNameTests(unittest.TestCase):
    def test_extracts_uploaded_image_names(self):
        for url, name in (
            ('/api/content/banner-images/spring.webp', 'spring.webp'),
            ('https://host/api/content/banner-images/spring.webp', 'spring.webp'),
            ('http://host:8000/api/content/banner-images/spring.webp', 'spring.webp'),
            ('/api/content/banner-images/%E6%98%A5%E5%A4%A9%20banner.webp', '春天 banner.webp'),
            ('/api/content/banner-images/spring.webp?v=1#preview', 'spring.webp'),
            ('https://host/api/content/banner-images/%E6%98%A5%E5%A4%A9.webp?v=1#preview', '春天.webp'),
        ):
            with self.subTest(url=url):
                self.assertEqual(content._banner_image_name(url), name)

    def test_ignores_urls_outside_the_library_and_invalid_paths(self):
        for url in (
            '/banners/x.webp', 'https://external.example/x.webp',
            'https://external.example/x.webp?url=/api/content/banner-images/spring.webp',
            '/other/api/content/banner-images/x.webp', '/api/content/banner-images-other/x.webp',
            '/api/content/banner-images/', '/api/content/banner-images/sub/x.webp',
            '/api/content/banner-images/..%2Fx.webp', 'ftp://host/api/content/banner-images/x.webp',
            'https://[invalid/api/content/banner-images/x.webp',
        ):
            with self.subTest(url=url):
                self.assertIsNone(content._banner_image_name(url))


class BannerImageUsageTests(ContentTestCase):
    def test_usage_includes_all_banners_and_orders_by_sort_order_then_id(self):
        with patch.object(content, '_new_id', side_effect=['ban-z', 'ban-a', 'ban-other', 'ban-external']):
            first = content.create_banner(banner(title='草稿', published=False,
                                                imageUrl='/api/content/banner-images/shared.webp'), actor='a@example.com')
            second = content.create_banner(banner(title='排程', startAt=iso(NOW + timedelta(days=7)),
                                                 imageUrl='https://host/api/content/banner-images/shared.webp?v=1#image'),
                                           actor='a@example.com')
            other = content.create_banner(banner(title='已結束', endAt=iso(NOW - timedelta(minutes=1)),
                                                imageUrl='/api/content/banner-images/%E6%98%A5%E5%A4%A9.webp'),
                                          actor='a@example.com')
            content.create_banner(banner(imageUrl='https://external.example/shared.webp'), actor='a@example.com')
        with content._open() as db:
            db.execute('UPDATE banners SET sort_order = ? WHERE id IN (?, ?)', (3, first['id'], second['id']))
        self.assertEqual(content.banner_image_usage(), {
            'shared.webp': [{'id': second['id'], 'title': '排程'}, {'id': first['id'], 'title': '草稿'}],
            '春天.webp': [{'id': other['id'], 'title': '已結束'}],
        })


class BannerTests(ContentTestCase):
    def test_new_banner_goes_last(self):
        created = content.create_banner(banner(), actor='a@example.com')
        self.assertEqual(created['order'], 3)
        self.assertEqual(content.list_banners()[-1]['id'], created['id'])
        self.assertEqual(self.audit(), [('內容管理', 'Banner', '新增輪播「新功能」')])

    def test_reorder_follows_the_given_ids(self):
        content.reorder_banners(['ban-3', 'ban-1', 'ban-2'], moved_id='ban-3', actor='a@example.com')
        self.assertEqual([b['id'] for b in content.list_banners()], ['ban-3', 'ban-1', 'ban-2'])
        self.assertEqual(self.audit(), [('內容管理', 'Banner', '調整輪播「點交存證」的順序')])

    def test_reorder_with_a_stale_list_is_rejected(self):
        # 另一個管理員剛新增或刪除輪播時，舊畫面送來的清單會對不上
        with self.assertRaises(ValueError):
            content.reorder_banners(['ban-1', 'ban-2'], moved_id=None, actor='a@example.com')

    def test_update_keeps_the_order(self):
        content.update_banner('ban-2', banner(title='契約分析'), actor='a@example.com')
        self.assertEqual([(b['id'], b['title']) for b in content.list_banners()][1], ('ban-2', '契約分析'))
        self.assertEqual(content.list_banners()[1]['order'], 1)

    def test_image_and_link_must_be_safe(self):
        for overrides, fragment in [
            ({'imageUrl': 'javascript:alert(1)'}, '圖片網址'),
            ({'imageUrl': '//evil.example/a.png'}, '圖片網址'),
            ({'imageUrl': '/\\evil.example/a.png'}, '圖片網址'),
            ({'linkUrl': 'https://evil.example'}, '站內'),
            ({'linkUrl': '//evil.example'}, '站內'),
            ({'title': ''}, '請輸入輪播標題'),
        ]:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError) as caught:
                    content.create_banner(banner(**overrides), actor='a@example.com')
                self.assertIn(fragment, str(caught.exception))
        self.assertEqual(content.create_banner(banner(imageUrl='https://example.com/a.png'), actor='a@example.com')['imageUrl'], 'https://example.com/a.png')

class TemplateTests(ContentTestCase):
    def test_create_toggle_update_delete_are_audited(self):
        created = content.create_template(template(), actor='a@example.com')
        self.assertEqual(content.list_templates()[0]['id'], created['id'])
        self.assertFalse(content.set_template_enabled(created['id'], False, actor='a@example.com')['enabled'])
        content.update_template(created['id'], template(name='繳費提醒（新）', actionUrl='/app/bills', actionLabel='去繳費'), actor='a@example.com')
        content.delete_template(created['id'], actor='a@example.com')
        self.assertEqual(self.audit(), [
            ('通知管理', '模板', '新增模板「繳費提醒」'),
            ('通知管理', '模板', '停用模板「繳費提醒」'),
            ('通知管理', '模板', '更新模板「繳費提醒（新）」'),
            ('通知管理', '模板', '刪除模板「繳費提醒（新）」'),
        ])

    def test_invalid_template_is_rejected(self):
        for overrides, fragment in [
            ({'name': ''}, '請輸入模板名稱'),
            ({'category': '行銷'}, '分類'),
            ({'channels': []}, '至少選一個'),
            ({'channels': ['sms']}, '管道'),
            ({'actionUrl': 'javascript:alert(1)'}, '按鈕連結'),
        ]:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError) as caught:
                    content.create_template(template(**overrides), actor='a@example.com')
                self.assertIn(fragment, str(caught.exception))

    def test_duplicate_channels_are_collapsed(self):
        created = content.create_template(template(channels=['email', 'inapp', 'email']), actor='a@example.com')
        self.assertEqual(created['channels'], ['email', 'inapp'])

class ApiTests(ContentTestCase):
    admin = MagicMock(email='admin@example.com')

    def test_public_content_needs_no_login_and_hides_drafts(self):
        from routers.content_api import read_public_content

        public = read_public_content()
        self.assertEqual(set(public), {'banners', 'announcements'})
        self.assertNotIn('an-4', [a['id'] for a in public['announcements']])

    def test_bad_input_is_a_400_with_the_reason(self):
        from routers.content_api import create_banner

        with self.assertRaises(HTTPException) as caught:
            create_banner(banner(linkUrl='https://evil.example'), admin=self.admin)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn('站內', caught.exception.detail)

    def test_missing_item_is_a_404(self):
        from routers.content_api import TemplateEnabled, delete_announcement, set_template_enabled

        for call in (
            lambda: delete_announcement('an-missing', admin=self.admin),
            lambda: set_template_enabled('nt-missing', TemplateEnabled(enabled=True), admin=self.admin),
        ):
            with self.assertRaises(HTTPException) as caught:
                call()
            self.assertEqual(caught.exception.status_code, 404)

    def test_reorder_endpoint_returns_the_new_order(self):
        from routers.content_api import BannerOrder, reorder_banners

        result = reorder_banners(BannerOrder(ids=['ban-2', 'ban-3', 'ban-1'], movedId='ban-1'), admin=self.admin)
        self.assertEqual([b['id'] for b in result], ['ban-2', 'ban-3', 'ban-1'])

if __name__ == '__main__':
    unittest.main()
