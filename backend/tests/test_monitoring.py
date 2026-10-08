import os
import tempfile
import unittest
from unittest.mock import patch

import httpx

from tests.admin_store import AdminStoreTestCase
from admin import monitoring_service as monitor

T0 = 1_790_000_000.0  # 固定起點，事件時間好比對


class MonitoringTests(AdminStoreTestCase):
    """監控、排程佇列、通知中心現在都在同一個資料庫裡（2026-10-02 起）。

    AdminStoreTestCase 會把 database.engine 換成每個測試自己的記憶體資料庫 ——
    不換的話服務斷線通知會寫進真的開發資料庫。
    """

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
        monitor.record_check('ocr', False, '連線逾時', now=T0 + 300)
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

    def test_rag_probe_skips_when_not_in_order(self):
        with patch.dict(os.environ, {'EMBEDDING_PROVIDER': 'nvidia', 'LOCAL_EMBEDDING_URL': 'http://rag:8000'}), \
             patch('httpx.get') as get:
            self.assertIsNone(monitor.probe_rag())
        get.assert_not_called()

    def test_rag_probe_skips_when_url_is_unset(self):
        with patch.dict(os.environ, {'EMBEDDING_PROVIDER': 'local'}, clear=True), patch('httpx.get') as get:
            self.assertIsNone(monitor.probe_rag())
        get.assert_not_called()

    def test_rag_probe_requires_a_ready_model_and_sends_no_headers(self):
        for payload, expected in [
            ({'embeddingReady': True}, (True, None)),
            ({'embeddingReady': False}, (False, 'embedding 模型未就緒')),
            ({}, (False, 'embedding 模型未就緒')),
            ({'embeddingReady': 'true'}, (False, 'embedding 模型未就緒')),
        ]:
            with self.subTest(payload=payload), \
                 patch.dict(os.environ, {'EMBEDDING_PROVIDER': 'local', 'LOCAL_EMBEDDING_URL': ' http://rag:8000/ '}), \
                 patch('httpx.get', return_value=httpx.Response(200, json=payload)) as get:
                self.assertEqual(monitor.probe_rag(), expected)
            get.assert_called_once_with('http://rag:8000/health', timeout=monitor.PROBE_TIMEOUT_SECONDS)

    def test_container_probes_report_http_errors(self):
        for probe in (monitor.probe_rag,):
            with self.subTest(probe=probe.__name__), patch.dict(os.environ, {
                'LLM_PROVIDER_ORDER': 'ollama', 'OLLAMA_URL': 'http://ollama:11434',
                'EMBEDDING_PROVIDER': 'local', 'LOCAL_EMBEDDING_URL': 'http://rag:8000',
            }), patch('httpx.get', return_value=httpx.Response(503)):
                self.assertEqual(probe(), (False, 'HTTP 503'))

    def test_container_probes_describe_connection_errors_and_timeouts(self):
        for probe in (monitor.probe_rag,):
            for error, detail in [
                (httpx.ConnectError('private-address'), '連不上'),
                (httpx.ReadTimeout('private-address'), '連線逾時'),
            ]:
                with self.subTest(probe=probe.__name__, error=type(error).__name__), patch.dict(os.environ, {
                    'LLM_PROVIDER_ORDER': 'ollama', 'OLLAMA_URL': 'http://ollama:11434',
                    'EMBEDDING_PROVIDER': 'local', 'LOCAL_EMBEDDING_URL': 'http://rag:8000',
                }), patch('httpx.get', side_effect=error):
                    self.assertEqual(probe(), (False, detail))

    def test_one_crashing_probe_does_not_stop_the_others(self):
        with patch.dict(monitor.PROBES, {
            'database': lambda: (_ for _ in ()).throw(RuntimeError('boom')),
            'ocr': lambda: (True, None),
        }, clear=True):
            monitor.run_checks(now=T0)
        states = {s['service']: s for s in monitor.service_states()}
        self.assertEqual(states['database']['status'], 'down')
        self.assertEqual(states['database']['detail'], '檢查程式出錯')
        self.assertEqual(states['ocr']['status'], 'up')
        self.assertNotIn('llm-ollama', states)

    def test_retired_service_state_is_removed_without_events_or_alerts(self):
        monitor.record_check('llm-desktop', False, '連不上', now=T0)
        events = monitor.list_events()
        self.assertEqual(monitor.summary(now=T0)['down'], 1)
        with patch.dict(monitor.PROBES, {}, clear=True), patch.object(monitor, '_alert_transition') as alert:
            monitor.run_checks(now=T0 + 60)
        self.assertEqual(monitor.service_states(), [])
        self.assertEqual(monitor.summary(now=T0 + 60)['down'], 0)
        self.assertEqual(monitor.list_events(), events)
        alert.assert_not_called()

    def test_unconfigured_probe_removes_existing_state_without_events_or_alerts(self):
        for service in ('rag', 'ocr', 'database'):
            for ok in (False, True):
                with self.subTest(service=service, ok=ok):
                    monitor.record_check(service, ok, now=T0)
                    events = monitor.list_events()
                    self.assertEqual(monitor.summary(now=T0)['down'], 0 if ok else 1)
                    with patch.dict(monitor.PROBES, {service: lambda: None}, clear=True), \
                         patch.object(monitor, '_alert_transition') as alert:
                        monitor.run_checks(now=T0 + 60)
                    self.assertEqual(monitor.service_states(), [])
                    self.assertEqual(monitor.summary(now=T0 + 60)['down'], 0)
                    self.assertEqual(monitor.list_events(), events)
                    alert.assert_not_called()

    def test_state_cleanup_leaves_non_probe_services_untouched(self):
        for service in ('backend', 'scheduled-notification'):
            monitor.record_check(service, False, '連不上', now=T0)
        states = monitor.service_states()
        monitor.record_check('llm-desktop', False, '連不上', now=T0)
        monitor.record_check('rag', False, '連不上', now=T0)
        events = monitor.list_events()
        with patch.dict(monitor.PROBES, {'rag': lambda: None}, clear=True), \
             patch.object(monitor, '_alert_transition') as alert:
            monitor.run_checks(now=T0 + 60)
        self.assertEqual(monitor.service_states(), states)
        self.assertEqual(monitor.summary(now=T0 + 60)['down'], 2)
        self.assertEqual(monitor.list_events(), events)
        alert.assert_not_called()

    # -------------------- 佇列與設定 --------------------

    def test_queue_status_reads_real_queues(self):
        status = monitor.queue_status(now=T0)
        for key in ('scheduledNotifications', 'garbageReminders'):
            self.assertEqual(
                set(status[key]),
                {'pending', 'overdue', 'stuck', 'failed7d', 'missed7d', 'lastIssueAt', 'nextDue'},
            )

    def schedule(self, id, due, status):
        from notifications import scheduled_notification_service as scheduled

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
        from notifications import garbage_service

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

    def test_container_services_have_the_expected_labels_and_probes(self):
        self.assertEqual(monitor.SERVICE_LABELS['rag'], 'RAG 檢索服務')
        self.assertIs(monitor.PROBES['rag'], monitor.probe_rag)

    def test_config_checklist_has_nvidia_and_rag_but_no_ollama(self):
        with patch.dict(os.environ, {
            'LLM_PROVIDER_ORDER': 'nvidia,ollama', 'OLLAMA_URL': 'http://ollama:11434',
            'NVIDIA_API_KEY': 'test-key', 'LOCAL_EMBEDDING_URL': 'http://rag:8000',
        }, clear=True):
            items = {item['key']: item for item in monitor.config_status()}
        self.assertNotIn('llm-ollama', items)
        self.assertTrue(items['nvidia']['ok'])
        self.assertTrue(items['rag']['ok'])
        self.assertIn('503', items['nvidia']['hint'])
        self.assertIn('LOCAL_EMBEDDING_URL', items['rag']['hint'])

    def test_retired_ollama_state_is_removed_and_event_keeps_label(self):
        monitor.record_check('llm-ollama', False, '連不上', now=T0)
        event = monitor.list_events()[0]
        self.assertEqual(event['serviceLabel'], 'LLM 備援（Ollama，已移除）')
        with patch.dict(monitor.PROBES, {}, clear=True):
            monitor.run_checks(now=T0 + 60)
        self.assertFalse(any(row['service'] == 'llm-ollama' for row in monitor.service_states()))
        self.assertEqual(monitor.list_events()[0]['serviceLabel'], 'LLM 備援（Ollama，已移除）')

    def test_retired_service_alert_uses_its_retired_label(self):
        with patch('admin.admin_notifications.record_alert') as alert:
            monitor._alert_transition('llm-desktop', 'down', '連不上')
        self.assertEqual(alert.call_args.args[0], 'AI 模型（桌機，已移除）連不上')

    def test_unknown_service_keys_fall_back_to_raw_labels(self):
        monitor.record_check('unknown-service', False, '連不上', now=T0)
        self.assertEqual(monitor.list_events()[0]['serviceLabel'], 'unknown-service')
        self.assertEqual(monitor.service_states()[0]['label'], 'unknown-service')


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

        from admin import metrics

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

        from admin import metrics

        request = SimpleNamespace(method='GET', url=SimpleNamespace(path='/api/x', query=''))

        async def not_found(_request):
            return SimpleNamespace(status_code=404)

        asyncio.run(metrics.count_requests(request, not_found))
        self.assertEqual(monitor.list_events(), [])


if __name__ == '__main__':
    unittest.main()
