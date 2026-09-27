import os
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import audit_service
from database import Base
from models import PendingAdminLogin, User, UserRole
from verification import hash_verification_code

T0 = 1_790_000_000.0


class AuditTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'ADMIN_AUDIT_DB': self.temp.name + '/audit.db',
            'ADMIN_SCHEDULE_DB': self.temp.name + '/schedule.db',
            'MONITOR_DB': self.temp.name + '/monitoring.db',
            'SMTP_USERNAME': 'sender@example.com',
            'SMTP_APP_PASSWORD': 'app-password',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def entries(self, subject=None):
        return [
            (e['action'], e['actor'], e['target'], e['detail'])
            for e in reversed(audit_service.list_events(subject=subject))
        ]


class AuditServiceTests(AuditTestCase):
    def test_newest_first_with_timezone(self):
        audit_service.record('使用者管理', 'a@example.com', '停用帳號', actor='admin@example.com', now=T0)
        audit_service.record('使用者管理', 'a@example.com', '啟用帳號', actor='admin@example.com', now=T0 + 60)
        events = audit_service.list_events()
        self.assertEqual([e['detail'] for e in events], ['啟用帳號', '停用帳號'])
        # 沒帶時區的話瀏覽器會當成本地時間，UTC+8 就差 8 小時
        self.assertRegex(events[0]['at'], r'[+-]\d{2}:\d{2}$')

    def test_subject_filter_follows_the_account_not_the_email(self):
        # 改過信箱之後，舊紀錄的 target 是舊信箱；查某個帳號要用 subject
        audit_service.record('使用者管理', 'old@example.com', '停用帳號', actor='x', subject='user:7', now=T0)
        audit_service.record('使用者管理', 'new@example.com', '啟用帳號', actor='x', subject='user:7', now=T0 + 1)
        audit_service.record('使用者管理', 'other@example.com', '停用帳號', actor='x', subject='user:8', now=T0 + 2)
        self.assertEqual(
            [e['target'] for e in audit_service.list_events(subject='user:7')],
            ['new@example.com', 'old@example.com'],
        )

    def test_a_failed_write_never_breaks_the_operation(self):
        with patch.object(audit_service, '_open', side_effect=OSError('disk full')):
            audit_service.record('使用者管理', 'a@example.com', '停用帳號', actor='admin@example.com')

    def test_reason_is_one_line_and_bounded(self):
        self.assertEqual(audit_service.clean_reason('  多次\n發布   不當內容 '), '多次 發布 不當內容')
        self.assertIsNone(audit_service.clean_reason('   \n  '))
        self.assertIsNone(audit_service.clean_reason(None))
        self.assertEqual(len(audit_service.clean_reason('字' * 500)), audit_service.REASON_MAX_LENGTH)


class AccountStatusAuditTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.admin = User(email='admin@example.com')
        self.tenant = User(email='tenant@example.com')
        self.db.add_all([self.admin, self.tenant])
        self.db.flush()
        self.db.add_all([
            UserRole(user_id=self.admin.id, role='admin'),
            UserRole(user_id=self.tenant.id, role='tenant'),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        super().tearDown()

    def set_status(self, user, status, reason=None):
        from routers.admin import UpdateStatusRequest, update_user_status

        return update_user_status(
            user.id, UpdateStatusRequest(status=status, reason=reason), admin=self.admin, db=self.db
        )

    def test_suspension_records_who_and_why(self):
        self.set_status(self.tenant, 'suspended', '多次發布不當內容')
        self.assertEqual(
            self.entries(subject=f'user:{self.tenant.id}'),
            [('使用者管理', 'admin@example.com', 'tenant@example.com', '停用帳號：多次發布不當內容')],
        )

    def test_reason_is_optional_and_enabling_has_none(self):
        self.set_status(self.tenant, 'suspended')
        self.set_status(self.tenant, 'active')
        self.assertEqual([e[3] for e in self.entries()], ['停用帳號', '啟用帳號'])

    def test_repeating_the_same_status_is_not_another_action(self):
        self.set_status(self.tenant, 'suspended')
        self.set_status(self.tenant, 'suspended')  # 兩個分頁各按一次
        self.assertEqual(len(self.entries()), 1)

    def test_rejected_attempts_leave_no_record(self):
        with self.assertRaises(HTTPException):
            self.set_status(self.admin, 'suspended')  # 不能停用自己
        self.assertEqual(self.entries(), [])


class ScheduleAuditTests(AuditTestCase):
    admin = SimpleNamespace(email='admin@example.com')

    def payload(self, due):
        from routers.scheduled_notifications import ScheduleInput

        return ScheduleInput(
            title='停水通知',
            body='明天上午停水。',
            category='系統',
            channels=['email'],
            recipient={'kind': 'role', 'role': 'user'},
            recipientLabel='全部租客',
            sourceLabel='停水通知',
            scheduledAt=due.isoformat(),
        )

    def test_create_and_cancel_are_recorded_with_the_scheduled_time(self):
        import scheduled_notification_service as service
        from routers.scheduled_notifications import cancel_schedule, create_schedule

        due = (datetime.now(service.TZ) + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        item = create_schedule(self.payload(due), admin=self.admin)
        cancel_schedule(item['id'], admin=self.admin)

        when = f'{due.month}/{due.day} 09:00'
        self.assertEqual(self.entries(subject=f"scheduled:{item['id']}"), [
            ('通知管理', 'admin@example.com', '排程通知「停水通知」', f'排定 {when} 以 Email 寄給全部租客'),
            ('通知管理', 'admin@example.com', '排程通知「停水通知」', f'取消排程（原定 {when}）'),
        ])

    def test_rejected_schedule_leaves_no_record(self):
        import scheduled_notification_service as service
        from routers.scheduled_notifications import create_schedule

        past = datetime.now(service.TZ) - timedelta(minutes=5)
        with self.assertRaises(HTTPException):
            create_schedule(self.payload(past), admin=self.admin)
        self.assertEqual(self.entries(), [])


class AdminLoginAuditTests(AuditTestCase):
    CODE = '123456'

    def setUp(self):
        super().setUp()
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.admin = User(email='admin@example.com')
        self.db.add(self.admin)
        self.db.flush()
        self.db.add(UserRole(user_id=self.admin.id, role='admin'))
        self.challenge_id = str(uuid.uuid4())
        now = datetime.utcnow()
        self.db.add(PendingAdminLogin(
            id=self.challenge_id,
            user_id=self.admin.id,
            email=self.admin.email,
            verification_code_hash=hash_verification_code(self.challenge_id, self.CODE),
            expires_at=now + timedelta(minutes=10),
            attempt_count=0,
            request_ip='203.0.113.7',
            created_at=now,
        ))
        self.db.commit()
        self.request = SimpleNamespace(
            headers={'x-forwarded-for': '203.0.113.7, 10.0.0.1'},
            client=SimpleNamespace(host='10.0.0.1'),
        )

    def tearDown(self):
        self.db.close()
        super().tearDown()

    def verify(self, code):
        from routers.auth import AdminLoginVerifyRequest, admin_login_verify

        return admin_login_verify(
            AdminLoginVerifyRequest(challengeId=self.challenge_id, code=code),
            request=self.request,
            response=Response(),
            db=self.db,
        )

    def logins(self):
        return [(e['detail'], e['ip']) for e in reversed(audit_service.list_events(subject=f'user:{self.admin.id}'))]

    def test_successful_login_is_recorded_with_the_real_ip(self):
        self.verify(self.CODE)
        # 經過 Cloudflare 與 Nginx，要記的是最前面那一段，不是代理的位址
        self.assertEqual(self.logins(), [('管理員登入', '203.0.113.7')])

    def test_login_creates_a_server_session_that_logout_removes(self):
        from models import AdminSession
        from routers.auth import logout
        from security import AUTH_COOKIE_NAME, create_cookie_token, read_access_token

        result = self.verify(self.CODE)
        session = self.db.query(AdminSession).one()
        # Bearer token 帶著伺服器端紀錄的 id，閒置判斷才有東西可以對
        self.assertEqual(read_access_token(result.accessToken)['sid'], session.id)

        cookie = create_cookie_token(self.admin.id, self.admin.email, 'admin', sid=session.id)
        logout(SimpleNamespace(cookies={AUTH_COOKIE_NAME: cookie}), Response(), db=self.db)
        # 登出後那張 Bearer token 也跟著失效，不必等它自己過期
        self.assertEqual(self.db.query(AdminSession).count(), 0)

    def test_page_reload_keeps_the_session_id_and_the_original_expiry(self):
        # 合併 main 時抓到的：get_current_user 重新組 CurrentUser 時丟掉了 exp 與 sid，
        # 結果每次重新整理，/me 發的新憑證都沒有 sid（管理員立刻被擋）、期限也被延長
        from models import AdminSession
        from routers.auth import get_me
        from security import AUTH_COOKIE_NAME, create_cookie_token, get_current_user, read_access_token

        self.verify(self.CODE)
        session = self.db.query(AdminSession).one()
        cookie = create_cookie_token(self.admin.id, self.admin.email, 'admin', sid=session.id)
        current = get_current_user(SimpleNamespace(cookies={AUTH_COOKIE_NAME: cookie}), self.db)
        self.assertEqual(current.sid, session.id)
        self.assertIsNotNone(current.exp)

        reissued = read_access_token(get_me(current=current, db=self.db).accessToken)
        self.assertEqual(reissued['sid'], session.id)
        self.assertEqual(reissued['exp'], current.exp)

    def test_wrong_code_after_a_correct_password_is_recorded(self):
        with self.assertRaises(HTTPException):
            self.verify('000000')
        self.assertEqual(self.logins(), [('帳密正確，但驗證碼錯誤（還可再試 2 次）', '203.0.113.7')])

    def test_running_out_of_attempts_is_recorded_as_voided(self):
        for _ in range(3):
            with self.assertRaises(HTTPException):
                self.verify('000000')
        self.assertEqual([detail for detail, _ in self.logins()], [
            '帳密正確，但驗證碼錯誤（還可再試 2 次）',
            '帳密正確，但驗證碼錯誤（還可再試 1 次）',
            '帳密正確，但驗證碼錯誤 3 次，這次登入已作廢',
        ])


if __name__ == '__main__':
    unittest.main()
