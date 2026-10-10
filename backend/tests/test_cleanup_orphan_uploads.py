"""孤兒上傳檔清理：預覽不刪檔，實際清理保留引用、未知檔案與符號連結。"""
import io
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from db import models
from db.database import Base

# 匯入路由會載入驗證模組；獨立測試不依賴開發機的 .env。
with patch.dict(os.environ, {'JWT_SECRET': os.environ.get('JWT_SECRET') or 'cleanup-test-secret'}):
    from scripts import cleanup_orphan_uploads as cleanup


class CleanupOrphanUploadsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.directories = {kind: self.root / kind for kind in cleanup.KINDS}
        for path in self.directories.values():
            path.mkdir()
        env = patch.dict(os.environ, {
            'INSPECTION_UPLOAD_DIR': str(self.directories['inspection']),
            'REPAIR_UPLOAD_DIR': str(self.directories['repairs']),
            'LEASE_FILE_DIR': str(self.directories['contracts']),
        })
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.out = io.StringIO()
        self.referenced = 'a' * 32 + '.jpg'
        self.orphan = 'b' * 32 + '.jpg'
        # 只測引用欄位，SQLite 不啟用外鍵，無須建立租約與工單的整套資料。
        with Session(self.engine) as db:
            db.add_all([
                models.InspectionRecord(type='check_in', photo_url=self.referenced),
                models.RepairTicketPhoto(ticket_id=1, photo_url=self.referenced),
                models.LandlordLeaseFile(lease_id=1, stored_name=self.referenced,
                                        original_name='照片.jpg', content_type='image/jpeg', size_bytes=4),
            ])
            db.commit()

    def write(self, kind, name, data=b'test'):
        path = self.directories[kind] / name
        path.write_bytes(data)
        old = time.time() - 7200
        os.utime(path, (old, old))
        return path

    def run_cleanup(self, kinds=None, apply=False):
        return cleanup.run(kinds=kinds, apply=apply, engine=self.engine, out=self.out)

    def test_dry_run_deletes_nothing_and_reports_sizes(self):
        paths = []
        for kind in cleanup.KINDS:
            paths.extend([self.write(kind, self.referenced), self.write(kind, self.orphan, b'x' * 2048)])
        with patch.object(Path, 'unlink', side_effect=AssertionError('預覽不可呼叫刪檔')):
            self.assertEqual(self.run_cleanup(), 0)
        self.assertTrue(all(path.exists() for path in paths))
        output = self.out.getvalue()
        for directory in self.directories.values():
            self.assertIn(str(directory), output)
        self.assertEqual(output.count('檔案總數：2；已引用：1；孤兒檔：1（2.0 KiB）；未知：0'), 3)
        self.assertEqual(output.count(f'孤兒檔：{self.orphan}（2.0 KiB）'), 3)

    def test_apply_deletes_only_orphans_for_all_kinds(self):
        kept = []
        removed = []
        for kind in cleanup.KINDS:
            kept.extend([self.write(kind, self.referenced), self.write(kind, '備註.txt')])
            removed.append(self.write(kind, self.orphan))
        self.assertEqual(self.run_cleanup(apply=True), 0)
        self.assertTrue(all(path.exists() for path in kept))
        self.assertTrue(all(not path.exists() for path in removed))
        self.assertEqual(self.out.getvalue().count('已刪除：1；失敗：0'), 3)

    def test_recent_orphans_are_kept_then_deleted_after_two_hours(self):
        now = time.time()
        paths = [self.write(kind, self.orphan) for kind in cleanup.KINDS]
        for path in paths:
            os.utime(path, (now, now))
        with patch.object(cleanup.time, 'time', return_value=now):
            self.assertEqual(self.run_cleanup(apply=True), 0)
            self.assertTrue(all(path.exists() for path in paths))
            self.assertEqual(self.out.getvalue().count('近期檔案：1'), 3)
            self.assertEqual(self.out.getvalue().count('孤兒檔：0（0.0 B）'), 3)
            self.out.seek(0)
            self.out.truncate()
            for path in paths:
                os.utime(path, (now - 7200, now - 7200))
            self.assertEqual(self.run_cleanup(apply=True), 0)
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertEqual(self.out.getvalue().count('近期檔案：0'), 3)
        self.assertEqual(self.out.getvalue().count('已刪除：1；失敗：0'), 3)

    def test_grace_period_starts_before_reference_queries(self):
        started = time.time()
        path = self.write('inspection', self.orphan)
        os.utime(path, (started - 1800, started - 1800))
        with patch.object(cleanup, 'time') as clock:
            clock.time.return_value = started
            def after_query(conn, cursor, statement, params, context, many):
                clock.time.return_value = started + 7200
            event.listen(self.engine, 'after_cursor_execute', after_query)
            self.assertEqual(self.run_cleanup(['inspection'], apply=True), 0)
        self.assertTrue(path.exists())
        self.assertIn('近期檔案：1', self.out.getvalue())

    def test_recent_parts_are_kept_and_reported_as_recent(self):
        now = time.time()
        path = self.write('inspection', 'recent.part')
        os.utime(path, (now, now))
        with patch.object(cleanup.time, 'time', return_value=now):
            self.assertEqual(self.run_cleanup(['inspection'], apply=True), 0)
        self.assertTrue(path.exists())
        self.assertIn('保留暫存檔：0；近期檔案：1', self.out.getvalue())

    def test_old_parts_are_orphans_and_fresh_parts_are_kept(self):
        now = time.time()
        paths = []
        for kind in cleanup.KINDS:
            old = self.write(kind, 'unfinished.part')
            fresh = self.write(kind, 'fresh.part')
            boundary = self.write(kind, 'boundary.part')
            os.utime(old, (now - 86401, now - 86401))
            os.utime(fresh, (now - 3600, now - 3600))
            os.utime(boundary, (now - 86400, now - 86400))
            paths.append((old, fresh, boundary))
        with patch.object(cleanup.time, 'time', return_value=now):
            self.assertEqual(self.run_cleanup(), 0)
            self.assertTrue(all(path.exists() for group in paths for path in group))
            self.assertEqual(self.out.getvalue().count('保留暫存檔：2'), 3)
            self.assertEqual(self.run_cleanup(apply=True), 0)
        for old, fresh, boundary in paths:
            self.assertFalse(old.exists())
            self.assertTrue(fresh.exists())
            self.assertTrue(boundary.exists())

    def test_referenced_old_part_is_kept(self):
        path = self.write('inspection', 'referenced.part')
        old = time.time() - 90000
        os.utime(path, (old, old))
        with Session(self.engine) as db:
            db.add(models.InspectionRecord(type='check_in', photo_url=path.name))
            db.commit()
        self.assertEqual(self.run_cleanup(['inspection'], apply=True), 0)
        self.assertTrue(path.exists())

    def test_patterns_use_each_routers_allowed_extensions(self):
        cases = {
            'inspection': (['jpg'], ['pdf', 'png']),
            'repairs': (['jpg', 'pdf'], ['png']),
            'contracts': (['jpg', 'pdf', 'png'], ['txt']),
        }
        removed = []
        kept = []
        for kind, (allowed, unknown) in cases.items():
            removed.extend(self.write(kind, 'c' * 32 + '.' + ext) for ext in allowed)
            kept.extend(self.write(kind, 'd' * 32 + '.' + ext) for ext in unknown)
            kept.extend(self.write(kind, name) for name in (
                'e' * 31 + '.jpg', 'F' * 32 + '.jpg', 'f' * 32 + '.jpg.bak', '照片.jpg',
            ))
        self.assertEqual(self.run_cleanup(apply=True), 0)
        self.assertTrue(all(path.exists() for path in kept))
        self.assertTrue(all(not path.exists() for path in removed))

    def test_symlinks_are_unknown_and_never_followed_or_deleted(self):
        outside = self.root / 'outside.jpg'
        outside.write_bytes(b'outside')
        old = time.time() - 90000
        os.utime(outside, (old, old))
        links = []
        for name, target in ((self.orphan, outside), ('old.part', outside),
                             ('broken.jpg', self.root / 'missing'), ('directory', self.root)):
            link = self.directories['inspection'] / name
            link.symlink_to(target)
            links.append(link)
        self.assertEqual(self.run_cleanup(['inspection'], apply=True), 0)
        self.assertTrue(all(link.is_symlink() for link in links))
        self.assertEqual(outside.read_bytes(), b'outside')
        self.assertIn('檔案總數：4；已引用：0；孤兒檔：0（0.0 B）；未知：4', self.out.getvalue())

    def test_subdirectories_are_not_scanned(self):
        nested = self.directories['inspection'] / 'nested'
        nested.mkdir()
        path = nested / self.orphan
        path.write_bytes(b'nested')
        self.assertEqual(self.run_cleanup(['inspection'], apply=True), 0)
        self.assertTrue(path.exists())
        self.assertIn('檔案總數：0', self.out.getvalue())

    def test_main_supports_repeated_kind_and_apply_flags(self):
        paths = {kind: self.write(kind, self.orphan) for kind in cleanup.KINDS}
        self.assertEqual(cleanup.main(['--kind', 'repairs', '--kind', 'contracts', '--apply'],
                                      engine=self.engine, out=self.out), 0)
        self.assertTrue(paths['inspection'].exists())
        self.assertFalse(paths['repairs'].exists())
        self.assertFalse(paths['contracts'].exists())

    def test_main_defaults_to_dry_run_for_all_kinds(self):
        paths = [self.write(kind, self.orphan) for kind in cleanup.KINDS]
        self.assertEqual(cleanup.main([], engine=self.engine, out=self.out), 0)
        self.assertTrue(all(path.exists() for path in paths))

    def test_one_reference_query_per_kind_even_with_many_files_and_repeated_kinds(self):
        queries = []
        event.listen(self.engine, 'before_cursor_execute',
                     lambda conn, cursor, statement, params, context, many: queries.append(statement))
        for kind in cleanup.KINDS:
            for i in range(20):
                self.write(kind, f'{i:032x}.jpg')
        self.assertEqual(self.run_cleanup(['inspection', 'repairs', 'contracts', 'inspection']), 0)
        self.assertEqual(len(queries), 3)
        self.assertTrue(all(query.startswith('SELECT ') for query in queries))

    def test_missing_directory_is_skipped_and_other_kinds_are_processed(self):
        self.directories['contracts'].rmdir()
        path = self.write('inspection', self.orphan)
        for apply in (False, True):
            with self.subTest(apply=apply):
                self.out.seek(0)
                self.out.truncate()
                self.assertEqual(self.run_cleanup(['contracts', 'inspection'], apply=apply), 0)
                self.assertIn(f"[contracts] 目錄：{self.directories['contracts']}（不存在，略過）",
                              self.out.getvalue())
                self.assertNotIn('目錄無法讀取', self.out.getvalue())
                self.assertEqual(path.exists(), not apply)

    def test_unreadable_directory_does_not_delete_files(self):
        path = self.write('inspection', self.orphan)
        with patch.object(Path, 'iterdir', side_effect=PermissionError(13, '拒絕存取')):
            self.assertEqual(self.run_cleanup(['inspection'], apply=True), 1)
        self.assertTrue(path.exists())
        self.assertIn('目錄無法讀取：拒絕存取', self.out.getvalue())

    def test_database_failure_prevents_all_deletions(self):
        path = self.write('inspection', self.orphan)
        models.RepairTicketPhoto.__table__.drop(self.engine)
        self.assertEqual(self.run_cleanup(apply=True), 1)
        self.assertTrue(path.exists())
        self.assertIn('資料庫無法連線或讀取引用資料', self.out.getvalue())
        self.assertNotIn('Traceback', self.out.getvalue())

    def test_missing_database_configuration_returns_error(self):
        with patch.object(cleanup, 'default_engine', None):
            self.assertEqual(cleanup.run(out=self.out), 1)
        self.assertIn('尚未設定 DATABASE_URL', self.out.getvalue())

    def test_deletion_failure_is_reported_and_returns_error(self):
        path = self.write('inspection', self.orphan)
        with patch.object(Path, 'unlink', side_effect=PermissionError(13, '拒絕存取')):
            self.assertEqual(self.run_cleanup(['inspection'], apply=True), 1)
        self.assertTrue(path.exists())
        self.assertIn(f'刪除失敗：{self.orphan}', self.out.getvalue())
        self.assertIn('已刪除：0；失敗：1', self.out.getvalue())


if __name__ == '__main__':
    unittest.main()
