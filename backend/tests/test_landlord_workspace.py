"""房東端搬進資料庫：租約規則、續約、合約附件、帳務、邀請、團隊權限、自動提醒。"""
import base64
import datetime
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import create_access_token
from db import database
from db.database import Base, get_db
from db.models import (InboxMessage, LandlordCharge, LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant,
                       LeaseInvitation, User, UserRole)
from notifications import landlord_reminders
from routers import (inspection, landlord_contracts, landlord_finance, landlord_properties, landlord_tenants,
                     landlord_workspace_api, lease_invitations, repairs, tenant_landlord_leases, tenant_leases)

OWNER, TENANT, MEMBER, OUTSIDER, OTHER_TENANT = 1, 2, 3, 4, 5
TODAY = datetime.date.today()
DAY = datetime.timedelta(days=1)
PDF = 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-1.4\n% contract\n').decode()


class LandlordWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.upload_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.upload_dir.cleanup)
        env = patch.dict(os.environ, {
            'AUTH_TOKEN_SECRET': 'landlord-workspace-test',
            'PII_ENCRYPTION_KEY': base64.b64encode(b'w' * 32).decode(),
            'LEASE_FILE_DIR': self.upload_dir.name,
            'REPAIR_UPLOAD_DIR': self.upload_dir.name,
        })
        env.start()
        self.addCleanup(env.stop)
        lease_invitations._code_attempts.clear()

        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda c, _: c.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.Session = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)

        with self.Session() as db:
            db.add_all([
                User(id=OWNER, email='owner@test.example', display_name='林房東', roles=[UserRole(role='landlord')]),
                User(id=TENANT, email='tenant@test.example', roles=[UserRole(role='tenant')]),
                User(id=MEMBER, email='member@test.example', roles=[UserRole(role='landlord')]),
                User(id=OUTSIDER, email='outsider@test.example', roles=[UserRole(role='landlord')]),
                User(id=OTHER_TENANT, email='other@test.example', roles=[UserRole(role='tenant')]),
            ])
            db.flush()
            db.add(LandlordProperty(id=1, landlord_id=OWNER, name='松江路', address='臺北市中山區松江路 88 號'))
            db.flush()
            db.add_all([LandlordRoom(id=1, property_id=1, number='101'), LandlordRoom(id=2, property_id=1, number='102')])
            db.add(LandlordTenant(id=1, landlord_id=OWNER, name='王小明', phone='0912000000', email='tenant@test.example'))
            db.flush()
            db.add(LandlordLease(id=1, tenant_id=1, property_id=1, room_id=1,
                                 start_date=TODAY.replace(day=1) - datetime.timedelta(days=62),
                                 end_date=TODAY + datetime.timedelta(days=200),
                                 monthly_rent=15000, deposit_amount=30000, payment_day=5, status='active'))
            db.commit()

        app = FastAPI()
        for router in (landlord_tenants.router, landlord_properties.router, landlord_finance.router,
                       landlord_contracts.router, landlord_workspace_api.router, lease_invitations.landlord_router,
                       lease_invitations.public_router, tenant_leases.router, repairs.router,
                       tenant_landlord_leases.router, inspection.router):
            app.include_router(router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def call(self, method, path, user=OWNER, role='landlord', workspace=None, **kwargs):
        headers = {'Authorization': f'Bearer {create_access_token(user, role)}'}
        if workspace:
            headers['X-Landlord-Workspace'] = str(workspace)
        return self.client.request(method, path, headers=headers, **kwargs)

    def ok(self, response, code=200):
        self.assertEqual(response.status_code, code, response.text)
        return response.json()

    def add_tenant(self, **overrides):
        payload = {'name': '陳小華', 'phone': '0922000000', 'property_id': 1, 'room_id': 2,
                   'lease_start': (TODAY + 30 * DAY).isoformat(), 'lease_end': (TODAY + 400 * DAY).isoformat(),
                   'monthly_rent': 12000, 'deposit_amount': 24000, 'payment_day': 10}
        payload.update(overrides)
        return self.call('POST', '/api/landlord/tenants', json=payload)

    # ---------------- 租約狀態 ----------------

    def test_future_lease_does_not_mark_room_rented(self):
        self.ok(self.add_tenant(), 201)
        rooms = {room['number']: room for room in self.ok(self.call('GET', '/api/landlord/properties'))['items'][0]['rooms']}
        self.assertEqual(rooms['102']['status'], 'vacant')
        self.assertEqual(rooms['102']['next_tenant'], '陳小華')
        self.assertEqual(rooms['101']['status'], 'rented')

    def test_scheduled_move_out_keeps_room_until_date(self):
        result = self.ok(self.call('POST', '/api/landlord/tenants/1/move-out', json={
            'move_out_date': (TODAY + 7 * DAY).isoformat(), 'deposit_refund': 30000}))
        self.assertEqual(result['lease_status'], 'expiring')  # 剩 7 天，仍住著
        self.assertEqual(result['scheduled_move_out'], (TODAY + 7 * DAY).isoformat())
        rooms = self.ok(self.call('GET', '/api/landlord/properties'))['items'][0]['rooms']
        self.assertEqual(rooms[0]['status'], 'rented')

    def test_move_out_refund_cannot_exceed_deposit(self):
        response = self.call('POST', '/api/landlord/tenants/1/move-out', json={
            'move_out_date': TODAY.isoformat(), 'deposit_refund': 999999})
        self.assertEqual(response.status_code, 422)

    def test_edit_rejects_another_tenants_phone(self):
        self.ok(self.add_tenant(), 201)
        tenant = self.ok(self.call('GET', '/api/landlord/tenants/1'))
        payload = {'name': tenant['name'], 'phone': '0922000000', 'property_id': 1, 'room_id': 1,
                   'lease_start': tenant['lease_start'], 'lease_end': tenant['lease_end'], 'monthly_rent': 15000,
                   'deposit_amount': 30000, 'payment_day': 5}
        self.assertEqual(self.call('PATCH', '/api/landlord/tenants/1', json=payload).status_code, 409)

    def test_amount_sort_is_numeric(self):
        self.ok(self.add_tenant(monthly_rent=9000), 201)
        rows = self.ok(self.call('GET', '/api/landlord/tenants?sort_by=monthly_rent&sort_order=desc'))['items']
        self.assertEqual([row['monthly_rent'] for row in rows], [15000, 9000])

    # ---------------- 續約與合約附件 ----------------

    def test_renewal_is_persisted_and_linked(self):
        lease = self.ok(self.call('GET', '/api/landlord/tenants/1'))
        end = datetime.date.fromisoformat(lease['lease_end'])
        too_early = self.call('POST', '/api/landlord/tenants/1/renew', json={
            'lease_start': end.isoformat(), 'lease_end': (end + 365 * DAY).isoformat(), 'monthly_rent': 16000,
            'deposit_amount': 30000, 'payment_day': 5})
        self.assertEqual(too_early.status_code, 409)
        self.ok(self.call('POST', '/api/landlord/tenants/1/renew', json={
            'lease_start': (end + DAY).isoformat(), 'lease_end': (end + 366 * DAY).isoformat(), 'monthly_rent': 16000,
            'deposit_amount': 30000, 'payment_day': 5}), 201)
        contracts = self.ok(self.call('GET', '/api/landlord/contracts'))['items']
        self.assertEqual(len(contracts), 2)
        current = next(item for item in contracts if item['lease_id'] == 1)
        self.assertIsNotNone(current['renewed_by_lease_id'])
        # 已有續約：現行租約仍是生效的那份
        self.assertEqual(self.ok(self.call('GET', '/api/landlord/tenants/1'))['lease_id'], 1)

    def test_contract_file_round_trip(self):
        uploaded = self.ok(self.call('POST', '/api/landlord/contracts/1/files', json={'name': '租約.pdf', 'data': PDF}), 201)
        download = self.call('GET', f'/api/landlord/contracts/1/files/{uploaded["id"]}')
        self.assertEqual(download.status_code, 200)
        self.assertTrue(download.content.startswith(b'%PDF-'))
        self.assertEqual(self.call('POST', '/api/landlord/contracts/1/files',
                                   json={'name': 'x.pdf', 'data': base64.b64encode(b'not a pdf').decode()}).status_code, 415)
        self.ok(self.call('DELETE', f'/api/landlord/contracts/1/files/{uploaded["id"]}'))
        self.assertEqual(os.listdir(self.upload_dir.name), [])
        # 別的房東拿不到
        self.assertEqual(self.call('GET', '/api/landlord/contracts/1/files/1', user=OUTSIDER).status_code, 404)

    # ---------------- 帳務 ----------------

    def test_rent_charges_are_fixed_once_created(self):
        month = TODAY.strftime('%Y-%m')
        before = self.ok(self.call('GET', f'/api/landlord/finance/charges?month={month}'))
        self.assertTrue(any(item['carried'] for item in before['items']), '前幾個月沒收的租金要帶到本月')
        amounts = {item['id']: item['amount'] for item in before['items']}
        self.ok(self.call('PATCH', '/api/landlord/tenants/1/lease', json={
            'lease_start': (TODAY.replace(day=1) - datetime.timedelta(days=62)).isoformat(),
            'lease_end': (TODAY + 200 * DAY).isoformat(), 'monthly_rent': 99000, 'deposit_amount': 30000, 'payment_day': 5}))
        after = self.ok(self.call('GET', f'/api/landlord/finance/charges?month={month}'))
        self.assertEqual({item['id']: item['amount'] for item in after['items'] if item['id'] in amounts}, amounts)

    def test_partial_overdue_counts_as_overdue(self):
        rows = self.ok(self.call('GET', '/api/landlord/finance/charges'))['items']
        overdue = next(item for item in rows if item['overdue'])
        result = self.ok(self.call('POST', f'/api/landlord/finance/charges/{overdue["id"]}/payments',
                                   json={'amount': 5000, 'paid_on': TODAY.isoformat(), 'method': 'cash'}), 201)
        self.assertTrue(result['partial'])
        self.assertTrue(result['overdue'])
        self.assertEqual(result['status'], 'overdue')
        too_much = self.call('POST', f'/api/landlord/finance/charges/{overdue["id"]}/payments',
                             json={'amount': 999999, 'paid_on': TODAY.isoformat()})
        self.assertEqual(too_much.status_code, 422)
        reversed_ = self.ok(self.call('POST', f'/api/landlord/finance/charges/{overdue["id"]}/payments/{result["payments"][0]["id"]}/reverse',
                                      json={'reason': '記錯金額'}))
        self.assertEqual(reversed_['paid'], 0)
        self.assertEqual(len(reversed_['payments']), 2)

    def test_rent_periods_do_not_drift_after_short_months(self):
        lease = LandlordLease(start_date=datetime.date(2026, 1, 31), end_date=datetime.date(2026, 6, 15),
                              monthly_rent=30000, payment_day=5, payment_frequency='monthly', status='active')
        periods = landlord_finance.rent_periods(lease, datetime.date(2027, 1, 1))
        self.assertEqual([(p[0].isoformat(), p[1].isoformat()) for p in periods[:3]],
                         [('2026-01-31', '2026-02-27'), ('2026-02-28', '2026-03-30'), ('2026-03-31', '2026-04-29')])
        self.assertTrue(all(p[3] == 30000 for p in periods[:-1]))
        # 最後一期 5/31 ～ 6/15：16 天 / 30 天
        self.assertEqual(periods[-1][3], round(30000 * 16 / 30))

    def test_trend_reports_six_months(self):
        rows = self.ok(self.call('GET', '/api/landlord/finance/trend'))['items']
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[-1]['month'], TODAY.strftime('%Y-%m'))
        self.assertTrue(any(row['total'] for row in rows))

    def test_reminder_requires_bound_account(self):
        charge = self.ok(self.call('GET', '/api/landlord/finance/charges'))['items'][0]
        self.assertEqual(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/remind').status_code, 409)
        with self.Session() as db:
            db.get(LandlordLease, 1).tenant_user_id = TENANT
            db.commit()
        result = self.ok(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/remind'))
        self.assertIsNotNone(result['reminded_at'])
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).filter_by(user_id=TENANT, category='帳務').count(), 1)

    def test_expenses_are_scoped_and_include_repairs(self):
        self.ok(self.call('POST', '/api/landlord/finance/expenses', json={
            'title': '換燈泡', 'category': '維修', 'amount': 300, 'spent_on': TODAY.isoformat()}), 201)
        self.assertEqual(self.ok(self.call('GET', '/api/landlord/finance/expenses'))['total'], 300)
        self.assertEqual(self.ok(self.call('GET', '/api/landlord/finance/expenses', user=OUTSIDER))['items'], [])

    # ---------------- 邀請租客 ----------------

    def invite(self, email=None):
        return self.ok(self.call('POST', '/api/landlord/invitations/leases/1', json={'email': email}), 201)

    def test_invitation_flow_binds_account(self):
        created = self.invite()
        token = created['token']
        preview = self.ok(self.client.get(f'/api/invitations/{token}'))
        self.assertEqual(preview['state'], 'pending')
        self.assertEqual(preview['room_number'], '101')
        self.assertNotIn('phone', preview)
        wrong = self.call('POST', f'/api/invitations/{token}/accept', user=OTHER_TENANT, role='tenant')
        self.assertEqual(wrong.status_code, 403)
        accepted = self.ok(self.call('POST', f'/api/invitations/{token}/accept', user=TENANT, role='tenant'))
        self.assertEqual(accepted['state'], 'accepted')
        # 重送同一個接受：回原本結果
        self.ok(self.call('POST', f'/api/invitations/{token}/accept', user=TENANT, role='tenant'))
        status_ = self.ok(self.call('GET', '/api/landlord/invitations/leases/1'))
        self.assertTrue(status_['bound'])
        tenant = self.ok(self.call('GET', '/api/landlord/tenants/1'))
        self.assertEqual(tenant['line_status'], 'bound')
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).filter_by(user_id=OWNER).count(), 1)

    def test_reissue_revokes_previous_and_code_works(self):
        first = self.invite()
        second = self.invite()
        revoked = self.call('POST', f'/api/invitations/{first["token"]}/accept', user=TENANT, role='tenant')
        self.assertEqual(revoked.status_code, 410)
        accepted = self.ok(self.call('POST', '/api/invitations/code-accept', user=TENANT, role='tenant',
                                     json={'code': second['code'].lower()}))
        self.assertEqual(accepted['lease_id'], 1)

    def test_code_guessing_is_rate_limited(self):
        for _ in range(lease_invitations.CODE_ATTEMPTS):
            self.assertEqual(self.call('POST', '/api/invitations/code-preview', user=TENANT, role='tenant',
                                       json={'code': 'WRONG123'}).status_code, 404)
        self.assertEqual(self.call('POST', '/api/invitations/code-preview', user=TENANT, role='tenant',
                                   json={'code': 'WRONG123'}).status_code, 429)

    def test_bound_lease_is_hidden_from_email_lookalike(self):
        token = self.invite()['token']
        self.ok(self.call('POST', f'/api/invitations/{token}/accept', user=TENANT, role='tenant'))
        with self.Session() as db:
            db.get(LandlordTenant, 1).email = 'other@test.example'
            db.commit()
        self.assertEqual(self.ok(self.call('GET', '/api/tenant/leases', user=OTHER_TENANT, role='tenant'))['items'], [])
        self.assertEqual(len(self.ok(self.call('GET', '/api/tenant/leases', user=TENANT, role='tenant'))['items']), 1)

    # ---------------- 團隊與權限 ----------------

    def join(self, role):
        created = self.ok(self.call('POST', '/api/landlord/team', json={'email': 'member@test.example', 'role': role}), 201)
        token = created['path'].rsplit('/', 1)[-1]
        self.assertEqual(self.call('POST', f'/api/landlord/team-invitations/{token}/accept', user=OUTSIDER).status_code, 403)
        self.ok(self.call('POST', f'/api/landlord/team-invitations/{token}/accept', user=MEMBER))

    def test_viewer_reads_owner_data_but_cannot_write(self):
        self.join('viewer')
        workspaces = self.ok(self.call('GET', '/api/landlord/workspaces', user=MEMBER))['items']
        self.assertEqual({item['owner_id'] for item in workspaces}, {MEMBER, OWNER})
        rows = self.ok(self.call('GET', '/api/landlord/tenants', user=MEMBER, workspace=OWNER))['items']
        self.assertEqual([row['name'] for row in rows], ['王小明'])
        self.assertEqual(self.add_tenant_as(MEMBER).status_code, 403)
        self.assertEqual(self.call('GET', '/api/landlord/team', user=MEMBER, workspace=OWNER).status_code, 403)

    def add_tenant_as(self, user):
        return self.call('POST', '/api/landlord/tenants', user=user, workspace=OWNER, json={
            'name': '成員新增', 'phone': '0933000000', 'property_id': 1, 'room_id': 2,
            'lease_start': (TODAY + 30 * DAY).isoformat(), 'lease_end': (TODAY + 400 * DAY).isoformat(),
            'monthly_rent': 12000, 'deposit_amount': 24000, 'payment_day': 10})

    def test_accounting_can_only_write_finance(self):
        self.join('accounting')
        charge = self.ok(self.call('GET', '/api/landlord/finance/charges', user=MEMBER, workspace=OWNER))['items'][0]
        self.ok(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/payments', user=MEMBER, workspace=OWNER,
                          json={'amount': 100, 'paid_on': TODAY.isoformat()}), 201)
        self.assertEqual(self.add_tenant_as(MEMBER).status_code, 403)
        audit = self.ok(self.call('GET', '/api/landlord/audit'))['items']
        self.assertEqual(audit[0]['title'], '確認收款')
        self.assertEqual(audit[0]['actor'], 'member@test.example')

    def test_repair_timeline_records_acting_member(self):
        self.join('manager')
        with self.Session() as db:
            db.get(LandlordLease, 1).tenant_user_id = TENANT
            db.commit()
        ticket = self.ok(self.call('POST', '/api/repairs', user=TENANT, role='tenant', json={
            'target': 'lease:1', 'location': '浴室', 'equipment': '熱水器', 'description': '沒有熱水',
            'urgency': 'soon', 'phone': '0912000000', 'photos': []}), 201)
        self.ok(self.call('POST', f'/api/repairs/{ticket["id"]}/read', user=MEMBER, workspace=OWNER))
        updated = self.ok(self.call('PATCH', f'/api/repairs/{ticket["id"]}', user=MEMBER, workspace=OWNER, json={
            'updates': {'status': 'processing'}, 'event': {'title': '已安排師傅'}}))
        names = [item['actorName'] for item in updated['timeline']]
        self.assertEqual(names[0], None)  # 租客提交
        self.assertEqual(names[-1], 'member（團隊成員）')
        with self.Session() as db:
            from db.models import RepairTicketEvent
            self.assertEqual(db.query(RepairTicketEvent).order_by(RepairTicketEvent.id.desc()).first().actor_user_id, MEMBER)

    def test_non_member_cannot_switch_workspace(self):
        self.assertEqual(self.call('GET', '/api/landlord/tenants', user=OUTSIDER, workspace=OWNER).status_code, 403)

    def test_removed_member_loses_access(self):
        self.join('manager')
        self.ok(self.add_tenant_as(MEMBER), 201)
        member_id = self.ok(self.call('GET', '/api/landlord/team'))['items'][0]['id']
        self.ok(self.call('DELETE', f'/api/landlord/team/{member_id}'))
        self.assertEqual(self.call('GET', '/api/landlord/tenants', user=MEMBER, workspace=OWNER).status_code, 403)

    # ---------------- 設定與提醒 ----------------

    def test_settings_persist(self):
        saved = self.ok(self.call('PUT', '/api/landlord/settings/profile', json={
            'display_name': '林大房東', 'phone': '0911-222-333', 'workspace_name': '松江路工作區'}))
        self.assertEqual(saved['workspace_name'], '松江路工作區')
        self.ok(self.call('PUT', '/api/landlord/settings/notifications', json={
            'email_notifications': False, 'rent_reminders': True, 'contract_reminders': False,
            'repair_notifications': True, 'reminder_days': 45}))
        again = self.ok(self.call('GET', '/api/landlord/settings'))
        self.assertEqual((again['display_name'], again['reminder_days'], again['contract_reminders']), ('林大房東', 45, False))

    def test_reminder_email_follows_preference(self):
        from notifications import user_notify
        sent = []
        with patch.object(user_notify, 'email_available', return_value=True),                 patch.object(user_notify, 'start_email_delivery', side_effect=lambda ids: sent.extend(ids)):
            with self.Session() as db:
                db.get(LandlordLease, 1).tenant_user_id = TENANT
                db.commit()
            charge = self.ok(self.call('GET', '/api/landlord/finance/charges'))['items'][0]
            self.ok(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/remind'))
            self.assertEqual(len(sent), 1)
            with self.Session() as db:
                message = db.query(InboxMessage).filter_by(user_id=TENANT).one()
                self.assertEqual(message.email_state, 'pending')
            self.ok(self.call('PUT', '/api/landlord/settings/notifications', json={
                'email_notifications': False, 'rent_reminders': True, 'contract_reminders': True,
                'repair_notifications': True, 'reminder_days': 30}))
            self.ok(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/remind'))
            self.assertEqual(len(sent), 1)

    def test_automatic_rent_reminder_sent_once(self):
        with self.Session() as db:
            db.get(LandlordLease, 1).tenant_user_id = TENANT
            db.commit()
            charge = LandlordCharge(landlord_id=OWNER, lease_id=1, kind='other', title='管理費', period_start=TODAY,
                                    period_end=TODAY, due_date=TODAY + 3 * DAY, amount=500)
            db.add(charge)
            db.commit()
        landlord_reminders.dispatch_due(TODAY, self.Session)
        landlord_reminders.dispatch_due(TODAY, self.Session)
        with self.Session() as db:
            titles = [message.title for message in db.query(InboxMessage).filter_by(user_id=TENANT)]
        self.assertEqual(sum('管理費' in title for title in titles), 1)

    def test_backup_includes_finance_and_history(self):
        charge = self.ok(self.call('GET', '/api/landlord/finance/charges'))['items'][0]
        self.ok(self.call('POST', f'/api/landlord/finance/charges/{charge["id"]}/payments',
                          json={'amount': 100, 'paid_on': TODAY.isoformat()}), 201)
        backup = self.ok(self.call('GET', '/api/landlord/backup'))
        self.assertEqual(len(backup['tenants']), 1)
        self.assertTrue(backup['charges'])
        self.assertTrue(any(item['payments'] for item in backup['charges']))
        self.assertEqual(backup['audit'][-1]['title'], '確認收款')
        self.assertEqual(self.ok(self.call('GET', '/api/landlord/audit'))['items'][0]['title'], '匯出完整備份')

    def test_row_encrypted_with_other_key_does_not_break_pages(self):
        from sqlalchemy import text
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'z' * 32).decode()}):
            with self.Session() as db:
                db.add(LandlordTenant(id=2, landlord_id=OWNER, name='舊金鑰租客', phone='0955000000'))
                db.commit()
        rows = self.ok(self.call('GET', '/api/landlord/tenants'))['items']
        broken = next(row for row in rows if row['name'] == '舊金鑰租客')
        self.assertFalse(broken['pii_readable'])
        self.ok(self.call('GET', '/api/landlord/finance/charges'))
        self.ok(self.call('GET', '/api/landlord/overview/tasks'))
        self.ok(self.add_tenant(), 201)
        landlord_reminders.dispatch_due(TODAY, self.Session)

    # ---------------- 租客端看房東租約 ----------------

    def bind_tenant(self):
        with self.Session() as db:
            db.get(LandlordLease, 1).tenant_user_id = TENANT
            db.commit()

    def test_tenant_dashboard_lists_landlord_lease_read_only(self):
        self.bind_tenant()
        with self.Session() as db:
            contracts = tenant_landlord_leases.landlord_contracts_for(db, db.get(User, TENANT), ('sky',), 0)
        self.assertEqual(len(contracts), 1)
        contract = contracts[0]
        self.assertEqual((contract['source'], contract['title']), ('landlord', '松江路 101'))
        self.assertTrue(contract['cycles'])
        self.assertTrue(all(cycle['rentAmount'] == 15000 for cycle in contract['cycles'][1:-1]))
        with self.Session() as db:
            self.assertEqual(tenant_landlord_leases.landlord_contracts_for(db, db.get(User, OTHER_TENANT), ('sky',), 0), [])

    def test_tenant_payment_report_notifies_landlord_without_marking_paid(self):
        self.bind_tenant()
        with self.Session() as db:
            cycle = tenant_landlord_leases.landlord_contracts_for(db, db.get(User, TENANT), ('sky',), 0)[0]['cycles'][0]
        charge_id = int(cycle['id'].split(':')[1])
        result = self.ok(self.call('POST', f'/api/tenant/landlord-leases/charges/{charge_id}/report', user=TENANT,
                                   role='tenant', json={'paid_at': TODAY.isoformat(), 'payment_method': 'bank-transfer',
                                                        'payment_note': '末五碼 12345'}))
        self.assertIsNone(result['paidAt'])
        self.assertIn('12345', result['tenantReport']['detail'])
        charges = self.ok(self.call('GET', f'/api/landlord/finance/charges?month={TODAY.strftime("%Y-%m")}'))['items']
        reported = next(item for item in charges if item['id'] == charge_id)
        self.assertEqual(reported['paid'], 0)
        self.assertIsNotNone(reported['tenant_report'])
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).filter_by(user_id=OWNER, category='帳務').count(), 1)
        self.assertEqual(self.call('POST', f'/api/tenant/landlord-leases/charges/{charge_id}/report', user=OTHER_TENANT,
                                   role='tenant', json={'paid_at': TODAY.isoformat()}).status_code, 404)

    def test_tenant_can_read_lease_and_attachment(self):
        self.bind_tenant()
        uploaded = self.ok(self.call('POST', '/api/landlord/contracts/1/files', json={'name': '租約.pdf', 'data': PDF}), 201)
        detail = self.ok(self.call('GET', '/api/tenant/landlord-leases/1', user=TENANT, role='tenant'))
        self.assertEqual([item['name'] for item in detail['files']], ['租約.pdf'])
        download = self.call('GET', f'/api/tenant/landlord-leases/1/files/{uploaded["id"]}', user=TENANT, role='tenant')
        self.assertTrue(download.content.startswith(b'%PDF-'))
        self.assertEqual(self.call('GET', '/api/tenant/landlord-leases/1', user=OTHER_TENANT, role='tenant').status_code, 404)

    def test_inspection_on_landlord_lease_is_visible_to_landlord(self):
        self.bind_tenant()
        targets = self.ok(self.call('GET', '/api/inspection/properties', user=TENANT, role='tenant'))
        self.assertIn('lease:1', [item['id'] for item in targets])
        item = self.ok(self.call('POST', '/api/inspection/items', user=TENANT, role='tenant',
                                 json={'rental_id': 'lease:1', 'room': '客廳', 'name': '沙發'}), 201)
        self.assertEqual(item['propertyId'], 'lease:1')
        listed = self.ok(self.call('GET', '/api/inspection/items?rental_id=lease:1', user=TENANT, role='tenant'))
        self.assertEqual([entry['name'] for entry in listed], ['沙發'])
        self.assertEqual(self.call('POST', '/api/inspection/items', user=OTHER_TENANT, role='tenant',
                                   json={'rental_id': 'lease:1', 'room': '客廳', 'name': '桌子'}).status_code, 404)
        landlord_view = self.ok(self.call('GET', '/api/landlord/contracts/1/inspection'))['items']
        self.assertEqual([entry['name'] for entry in landlord_view], ['沙發'])
        self.assertEqual(self.call('GET', '/api/landlord/contracts/1/inspection', user=OUTSIDER).status_code, 404)

    def test_overview_tasks_come_from_data(self):
        items = self.ok(self.call('GET', '/api/landlord/overview/tasks'))['items']
        self.assertTrue(items)
        self.assertTrue(all(item['kind'] in ('rent', 'utility', 'contract', 'maintenance') for item in items))
        self.assertTrue(any('王小明' in item['title'] for item in items))


if __name__ == '__main__':
    unittest.main()
