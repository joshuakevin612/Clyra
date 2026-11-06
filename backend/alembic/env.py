from alembic import context
from app.db import Base, make_engine
from dotenv import load_dotenv
from pathlib import Path
import os

def run_migrations():
    load_dotenv(Path(__file__).resolve().parents[1]/'.env.migrations')
    url=os.getenv('MIGRATION_DATABASE_URL')
    if not url:
        raise RuntimeError('Set separate MIGRATION_DATABASE_URL; runtime credentials cannot run migrations.')
    from sqlalchemy.engine import make_url
    if url and '-pooler.' in (make_url(url).host or ''):
        raise RuntimeError('Migrations require a direct connection, not a pooled host.')
    # Migration credentials are direct and privileged; never apply runtime URL policy.
    from sqlalchemy import create_engine
    parsed=make_url(url)
    if parsed.drivername in ('postgres', 'postgresql'):
        parsed=parsed.set(drivername='postgresql+psycopg')
    if parsed.drivername != 'sqlite' and (parsed.drivername != 'postgresql+psycopg' or parsed.query.get('sslmode') not in ('require','verify-full')):
        raise RuntimeError('Migrations require PostgreSQL with TLS.')
    if parsed.drivername == 'sqlite' and os.getenv('ENVIRONMENT') != 'test':
        raise RuntimeError('SQLite migrations are test-only.')
    engine=create_engine(parsed,connect_args={'connect_timeout':15,'prepare_threshold':None} if parsed.drivername=='postgresql+psycopg' else {})
    with engine.connect() as connection:
        context.configure(connection=connection,target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()

run_migrations()
