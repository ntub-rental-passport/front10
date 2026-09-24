"""Retired migration: historical password-credential splitting is unsupported.

The current schema uses user_roles but keeps passwords in users.
See docs/multi-role-auth.md before migrating existing data.
"""
import sys


def main(apply: bool = False) -> int:
    print("Retired: this tool does not upgrade to the current schema. See docs/multi-role-auth.md.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
