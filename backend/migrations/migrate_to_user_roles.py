"""Retired migration: schema v3 stores the single role and password in users.

Historical SQL migrations in this directory are not upgrades to schema v3.
See docs/database-v3-upgrade.md before migrating existing data.
"""
import sys


def main(apply: bool = False) -> int:
    print("Retired: do not migrate schema v3 back to user_roles/password credential tables.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
