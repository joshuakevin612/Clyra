"""Read-only checks of the recovered Neon runtime connection."""
from sqlalchemy import text
from dotenv import dotenv_values
from pathlib import Path
from app.db import make_engine

def main():
    engine=make_engine()
    with engine.connect() as conn:
        assert conn.connection.driver_connection.pgconn.ssl_in_use
        assert conn.scalar(text('SELECT current_user'))=='clyra_app'
        assert not conn.scalar(text("SELECT has_schema_privilege(current_user,'public','CREATE')"))
        for table in ('audit_events','access_events'):
            for privilege in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE'):
                actual=conn.scalar(text('SELECT has_table_privilege(current_user,:table,:privilege)'),{'table':table,'privilege':privilege})
                assert actual==(privilege in ('SELECT','INSERT'))
        print('Verified client TLS, restricted clyra_app role and append-only event privileges.')
        for table in ('organisations','users','patients','medication_entries'):
            print(table,conn.scalar(text(f'SELECT count(*) FROM {table}')))
    engine.dispose()
    owner=make_engine(dotenv_values(Path(__file__).resolve().parents[1]/'.env.migrations')['MIGRATION_DATABASE_URL'])
    with owner.connect() as conn:
        conn.execute(text('SET TRANSACTION READ ONLY'))
        print('Migration revision:',conn.scalar(text('SELECT version_num FROM alembic_version')))
    owner.dispose()
if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('Neon connection check failed:',type(exc).__name__,getattr(getattr(exc,'orig',None),'sqlstate',''),'(details withheld)')
        raise SystemExit(1)
