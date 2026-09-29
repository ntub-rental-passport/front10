import unittest

from sqlalchemy import create_engine, inspect, text

from migrations.create_admin_sessions import upgrade


class AdminSessionsMigrationTests(unittest.TestCase):
    def test_adds_sessions_preserves_accounts_and_can_be_repeated(self):
        engine = create_engine('sqlite:///:memory:')
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)'))
            connection.execute(text("INSERT INTO users VALUES (1, 'existing@example.com')"))

        upgrade(engine)
        with engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO admin_sessions VALUES ('existing-session', 1, "
                "'2026-09-28 00:00:00', '2026-09-28 00:00:00')"
            ))
        upgrade(engine)

        self.assertEqual(set(inspect(engine).get_table_names()), {'users', 'admin_sessions'})
        with engine.connect() as connection:
            self.assertEqual(connection.execute(text('SELECT email FROM users')).scalar_one(),
                             'existing@example.com')
            self.assertEqual(connection.execute(text('SELECT id FROM admin_sessions')).scalar_one(),
                             'existing-session')
