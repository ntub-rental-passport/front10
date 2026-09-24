"""Read-only compatibility check; application startup never migrates a database."""
from sqlalchemy import inspect, UniqueConstraint
from database import Base
import models  # Register all 27 tables.


def schema_problems(engine) -> list[str]:
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    problems = []
    for name, table in Base.metadata.tables.items():
        if name not in existing:
            problems.append(f"Missing table: {name}")
            continue
        columns = {column['name']: column for column in inspector.get_columns(name)}
        if name in {'users', 'user_identities', 'pending_registrations'}:
            expected = {frozenset(c.name for c in constraint.columns)
                        for constraint in table.constraints if isinstance(constraint, UniqueConstraint)}
            actual_unique = {frozenset(item['column_names']) for item in inspector.get_unique_constraints(name)}
            actual_unique.update(frozenset(item['column_names']) for item in inspector.get_indexes(name) if item.get('unique'))
            if actual_unique != expected:
                problems.append(f'Incompatible account uniqueness: {name}; email must be scoped by role')
        for column in table.columns:
            if column.name not in columns:
                problems.append(f"Missing column: {name}.{column.name}")
                continue
            actual = columns[column.name]
            expected_type = column.type.dialect_impl(engine.dialect)
            if actual['type']._type_affinity is not expected_type._type_affinity:
                problems.append(f"Incompatible type: {name}.{column.name}")
        for column_name in columns.keys() - table.columns.keys():
            column = columns[column_name]
            if not column.get('nullable') and column.get('default') is None and not column.get('autoincrement'):
                problems.append(f"Unmapped required column: {name}.{column_name}")
    return problems


def require_current_schema(engine) -> None:
    problems = schema_problems(engine)
    if problems:
        raise RuntimeError("Database schema v3 is required. No database changes were made.\n" + "\n".join(problems))


if __name__ == '__main__':
    from database import engine
    if engine is None:
        raise SystemExit('DATABASE_URL is not configured')
    issues = schema_problems(engine)
    print('\n'.join(issues) if issues else 'Schema v3 table, column and type checks passed')
    raise SystemExit(1 if issues else 0)
