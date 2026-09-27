import os
import tempfile
import unittest
from unittest.mock import patch

import monitoring_service as monitor

T0 = 1_790_000_000.0  # 固定起點，事件時間好比對


class MonitoringTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'MONITOR_DB': self.temp.name + '/monitoring.db',
            'ADMIN_SCHEDULE_DB': self.temp.name + '/schedule.db',
            'GARBAGE_REMINDER_DB': self.temp.name + '/garbage.db',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def kinds(self):
        return [event['kind'] for event in reversed(monitor.list_events())]

    # -------------------- 狀態轉換 --------------------

    def test_first_healthy_check_records_no_event(self):
        self.assertIsNone(monitor.record_check('ocr', True, now=T0))
        self.assertEqual(monitor.list_events(), [])

    def test_first_check_already_down_is_worth_an_event(self):
        # 後端剛啟動就發現 OCR 不在，那是值得知道的事
        self.assertEqual(monitor.record_check('ocr', False, '連不上', now=T0), 'down')
        self.assertEqual(self.kinds(), ['down'])

    def test_only_transitions_are_recorded_not_every_check(self):
        monitor.record_check('ocr', True, now=T0)
        for i in range(5):
            monitor.record_check('ocr', True, now=T0 + 60 * (i + 1))
        self.assertEqual(monitor.list_events(), [])

    def test_down_then_recovered_records_how_long_it_was_down(self):
        monitor.record_check('ocr', True, now=T0)
        monitor.record_check('ocr', False, '連線逾時', now=T0 + 60)
        monitor.record_check('ocr', False, '連線逾時', now=T0 + 120)
        monitor.record_check('ocr', True, now=T0 + 360)
        events = list(reversed(monitor.list_events()))
        self.assertEqual([e['kind'] for e in events], ['down', 'recovered'])
        self.assertEqual(events[0]['detail'], '連線逾時')
        self.assertEqual(events[1]['durationSeconds'], 300)

    def test_reason_is_kept_up_to_date_while_still_down(self):
        monitor.record_check('ocr', False, '連線逾時', now=T0)
        monitor.record_check('ocr', False, 'HTTP 502', now=T0 + 60)
        state = next(s for s in monitor.service_states() if s['service'] == 'ocr')
        self.assertEqual(state['detail'], 'HTTP 502')
        # 原因換了不算新的一次停機
        self.assertEqual(self.kinds(), ['down'])

    def test_same_transition_seen_by_a_second_worker_is_not_recorded_twice(self):
        # 兩個 worker 各自檢查、都看到 OCR 掛了：第二個讀到的狀態已經是 down
        monitor.record_check('ocr', True, now=T0)
        monitor.record_check('ocr', False, '連不上', now=T0 + 60)
        monitor.record_check('ocr', False, '連不上', now=T0 + 61)
        self.assertEqual(self.kinds(), ['down'])

    # -------------------- 心跳 --------------------

    def test_first_heartbeat_records_nothing(self):
        self.assertIsNone(monitor.heartbeat(now=T0))
        self.assertEqual(monitor.list_events(), [])

    def test_normal_heartbeats_and_quick_restarts_are_not_downtime(self):
        monitor.heartbeat(now=T0)
        monitor.heartbeat(now=T0 + 20)
        # 重新部署：幾十秒內就回來
        self.assertIsNone(monitor.heartbeat(now=T0 + 20 + 45))
        self.assertEqual(monitor.list_events(), [])

    def test_long_gap_is_recorded_as_backend_downtime_from_the_last_heartbeat(self):
        monitor.heartbeat(now=T0)
        gap = monitor.heartbeat(now=T0 + 3600)
        self.assertEqual(gap, 3600)
        event = monitor.list_events()[0]
        self.assertEqual(event['kind'], 'backend-downtime')
        self.assertEqual(event['durationSeconds'], 3600)
        # 起點是「最後一次確認還活著」—— 寧可保守，不把沒發生的停機算進去
        self.assertTrue(event['at'].startswith('2026-09-21'))

    def test_downtime_is_recorded_once_even_if_two_workers_start_together(self):
        monitor.heartbeat(now=T0)
        monitor.heartbeat(now=T0 + 3600)       # 第一個 worker 補記
        monitor.heartbeat(now=T0 + 3600.5)     # 第二個 worker 看到的已經是新的心跳
        self.assertEqual(self.kinds(), ['backend-downtime'])

    # -------------------- 查詢與清理 --------------------

    def test_timestamps_carry_a_timezone(self):
        # 沒帶時區的話瀏覽器會當成本地時間，UTC+8 就差 8 小時
        monitor.record_check('ocr', False, '連不上', now=T0)
        self.assertRegex(monitor.list_events()[0]['at'], r'[+-]\d{2}:\d{2}$')

    def test_kind_filter_keeps_outages_visible_behind_a_burst_of_server_errors(self):
        monitor.record_check('ocr', False, '連不上', now=T0)
        for i in range(5):
            monitor.record_event('backend', 'server-error', f'GET /api/x{i} → 500', now=T0 + 10 + i)
        self.assertEqual([e['kind'] for e in monitor.list_events(limit=3)], ['server-error'] * 3)
        self.assertEqual([e['kind'] for e in monitor.list_events(limit=3, kinds=['down', 'recovered'])], ['down'])

    def test_prune_drops_events_older_than_retention(self):
        monitor.record_event('backend', 'server-error', 'GET /api/x → 500', now=T0)
        monitor.record_event('backend', 'server-error', 'GET /api/y → 500', now=T0 + 40 * 86400)
        removed = monitor.prune(now=T0 + 40 * 86400)
        self.assertEqual(removed, 1)
        self.assertEqual([e['detail'] for e in monitor.list_events()], ['GET /api/y → 500'])

    def test_summary_counts_current_downs_and_last_24h_without_double_counting_recoveries(self):
        now = T0 + 3600
        monitor.record_check('ocr', True, now=T0)
        monitor.record_check('ocr', False, '連不上', now=T0 + 100)
        monitor.record_check('ocr', True, now=T0 + 200)          # recovered 不另算一次
        monitor.record_check('llm-desktop', False, '連線逾時', now=T0 + 300)
        summary = monitor.summary(now=now)
        self.assertEqual(summary['down'], 1)
        self.assertEqual(summary['events24h'], 2)

    def test_summary_carries_server_time_for_staleness_checks(self):
        monitor.heartbeat(now=T0)
        summary = monitor.summary(now=T0 + 30)
        self.assertEqual(summary['serverTime'], monitor._iso(T0 + 30))
        self.assertEqual(summary['lastHeartbeat'], monitor._iso(T0))

    # -------------------- 探測 --------------------

    def test_probe_failure_detail_never_leaks_addresses_or_raw_errors(self):
        import httpx

        with patch.dict(os.environ, {'OCR_API_PORT': '8787'}), \
             patch('httpx.get', side_effect=httpx.ConnectError('[Errno 61] Connection refused to 10.0.0.5:8787')):
            ok, detail = monitor.probe_ocr()
        self.assertFalse(ok)
        self.assertEqual(detail, '連不上')

    def test_probe_timeout_is_described_as_timeout(self):
        import httpx

        with patch.dict(os.environ, {'OCR_API_PORT': '8787'}), \
             patch('httpx.get', side_effect=httpx.ReadTimeout('timed out')):
            self.assertEqual(monitor.probe_ocr(), (False, '連線逾時'))

    def test_unconfigured_services_are_skipped_not_reported_as_down(self):
        with patch.dict(os.environ, {'OCR_API_PORT': '', 'OCR_HEALTH_URL': ''}):
            self.assertIsNone(monitor.probe_ocr())

    def test_llm_probe_sends_the_same_credentials_as_real_requests(self):
        # 少帶一個標頭，Cloudflare Access 會在邊緣擋掉，監控就會誤報桌機連不上
        captured = {}

        class Response:
            status_code = 200

        def fake_get(url, headers, timeout):
            captured.update(headers)
            return Response()

        with patch.dict(os.environ, {
            'LLM_TUNNEL_URL': 'https://tunnel.example',
            'LLM_TUNNEL_API_KEY': 'k',
            'CF_ACCESS_CLIENT_ID': 'id',
            'CF_ACCESS_CLIENT_SECRET': 'secret',
            'LLM_PROVIDER_ORDER': 'ollama,nvidia',
        }), patch('httpx.get', side_effect=fake_get):
            self.assertEqual(monitor.probe_llm_desktop(), (True, None))
        self.assertEqual(captured.get('X-API-Key'), 'k')
        self.assertEqual(captured.get('CF-Access-Client-Id'), 'id')

    def test_one_crashing_probe_does_not_stop_the_others(self):
        with patch.dict(monitor.PROBES, {
            'database': lambda: (_ for _ in ()).throw(RuntimeError('boom')),
            'llm-desktop': lambda: None,
            'ocr': lambda: (True, None),
        }, clear=True):
            monitor.run_checks(now=T0)
        states = {s['service']: s for s in monitor.service_states()}
        self.assertEqual(states['database']['status'], 'down')
        self.assertEqual(states['database']['detail'], '檢查程式出錯')
        self.assertEqual(states['ocr']['status'], 'up')
        self.assertNotIn('llm-desktop', states)

    # -------------------- 佇列與設定 --------------------

    def test_queue_status_reads_real_queues(self):
        status = monitor.queue_status(now=T0)
        for key in ('scheduledNotifications', 'garbageReminders'):
            self.assertEqual(
                set(status[key]),
                {'pending', 'overdue', 'stuck', 'failed7d', 'missed7d', 'lastIssueAt', 'nextDue'},
            )

    def schedule(self, id, due, status):
        import scheduled_notification_service as scheduled

        with scheduled.connect() as db:
            db.execute(
                'INSERT INTO scheduled_notifications (id, created_by, title, body, category, channels,'
                ' recipient, recipient_label, source_label, due, created_at, status)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (id, 'admin', 't', 'b', 'system', '["email"]', 'all', '全體', '手動', due, due - 3600, status),
            )

    def test_pending_rows_long_past_due_mean_the_dispatcher_is_not_running(self):
        # 迴圈停掉的期間沒有人會把它們標成錯過 —— 只數「待送」會以為一切正常
        self.schedule('later', T0 + 3600, 'pending')
        self.schedule('just-due', T0 - 30, 'pending')      # 下一輪就會送出
        self.schedule('stale', T0 - 600, 'pending')        # 到期 10 分鐘還在待送
        queue = monitor.queue_status(now=T0)['scheduledNotifications']
        self.assertEqual(queue['pending'], 3)
        self.assertEqual(queue['overdue'], 1)

    def test_last_issue_is_the_most_recent_failure_or_miss(self):
        # 前端靠它判斷「最近才出事」還是「上週的舊帳」，後者不該一直亮警示
        self.schedule('failed', T0 - 5 * 86400, 'failed')
        self.schedule('missed', T0 - 2 * 86400, 'missed')
        self.schedule('sent', T0 - 3600, 'sent')
        queue = monitor.queue_status(now=T0)['scheduledNotifications']
        self.assertEqual((queue['failed7d'], queue['missed7d']), (1, 1))
        self.assertEqual(queue['lastIssueAt'], monitor._iso(T0 - 2 * 86400))

    def test_garbage_overdue_counts_either_channel_but_not_cancelled_reminders(self):
        import garbage_service

        with garbage_service.connect() as db:
            db.executemany(
                'INSERT INTO garbage_reminders (id, user_id, payload, due, active, email_status, push_status)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    ('push-stale', 1, '{}', T0 - 600, 1, 'sent', 'pending'),
                    ('cancelled', 1, '{}', T0 - 600, 0, 'pending', 'none'),
                    ('later', 1, '{}', T0 + 600, 1, 'pending', 'none'),
                ],
            )
        queue = monitor.queue_status(now=T0)['garbageReminders']
        self.assertEqual(queue['overdue'], 1)
        self.assertEqual(queue['pending'], 2)
        self.assertIsNone(queue['lastIssueAt'])

    def test_config_status_only_reports_booleans_never_values(self):
        with patch.dict(os.environ, {'SMTP_USERNAME': 'someone@gmail.com', 'SMTP_APP_PASSWORD': 'hunter2'}):
            items = monitor.config_status()
        blob = repr(items)
        self.assertNotIn('someone@gmail.com', blob)
        self.assertNotIn('hunter2', blob)
        self.assertTrue(next(i for i in items if i['key'] == 'smtp')['ok'])


    def vision_ok(self):
        return next(i for i in monitor.config_status() if i['key'] == 'vision')['ok']

    def ocr_reports(self, configured):
        class Response:
            status_code = 200

            def json(self):
                return {'ok': True, 'credentialsConfigured': configured}

        with patch.dict(os.environ, {'OCR_API_PORT': '8787'}), patch('httpx.get', return_value=Response()):
            self.assertEqual(monitor.probe_ocr(), (True, None))

    def test_vision_status_comes_from_the_ocr_service(self):
        # 正式環境金鑰只掛進 OCR 的容器：後端這邊看不到檔案，但 OCR 說它有
        with patch.dict(os.environ, {'GOOGLE_APPLICATION_CREDENTIALS': '/nowhere/vision-key.json'}):
            self.assertFalse(self.vision_ok())
            self.ocr_reports(True)
            self.assertTrue(self.vision_ok())

    def test_ocr_saying_no_wins_over_a_local_file(self):
        with tempfile.NamedTemporaryFile(suffix='.json') as key, \
             patch.dict(os.environ, {'GOOGLE_APPLICATION_CREDENTIALS': key.name}):
            self.assertTrue(self.vision_ok())    # 還沒回報：退回看本機檔案
            self.ocr_reports(False)
            self.assertFalse(self.vision_ok())

    def test_odd_health_payload_is_ignored_not_trusted(self):
        class Response:
            status_code = 200

            def json(self):
                return {'ok': True}              # 舊版 OCR 沒有這個欄位

        with patch.dict(os.environ, {'OCR_API_PORT': '8787', 'GOOGLE_APPLICATION_CREDENTIALS': ''}), \
             patch('httpx.get', return_value=Response()):
            monitor.probe_ocr()
            self.assertFalse(self.vision_ok())

    # -------------------- 5xx --------------------

    def test_server_errors_are_recorded_without_query_string_or_error_message(self):
        import asyncio
        from types import SimpleNamespace

        import metrics

        request = SimpleNamespace(
            method='POST',
            url=SimpleNamespace(path='/api/contract/analyze', query='token=secret'),
        )

        async def explode(_request):
            raise RuntimeError('mysql://root:pw@10.0.0.5/rentmate unreachable')

        with self.assertRaises(RuntimeError):
            asyncio.run(metrics.count_requests(request, explode))

        event = monitor.list_events()[0]
        self.assertEqual(event['kind'], 'server-error')
        self.assertEqual(event['detail'], 'POST /api/contract/analyze → 500（RuntimeError）')
        self.assertNotIn('secret', repr(event))
        self.assertNotIn('10.0.0.5', repr(event))

    def test_client_errors_are_not_recorded(self):
        import asyncio
        from types import SimpleNamespace

        import metrics

        request = SimpleNamespace(method='GET', url=SimpleNamespace(path='/api/x', query=''))

        async def not_found(_request):
            return SimpleNamespace(status_code=404)

        asyncio.run(metrics.count_requests(request, not_found))
        self.assertEqual(monitor.list_events(), [])


if __name__ == '__main__':
    unittest.main()
