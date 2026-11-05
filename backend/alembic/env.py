from alembic import context
from app.db import Base, make_engine
from dotenv import load_dotenv
from pathlib import Path
import os

def run_migrations():
    load_dotenv(Path(__file__).resolve().parents[1]/'.env.migrations')
    url=os.getenv('MIGRATION_DATABASE_URL') or os.getenv('DATABASE_URL')
    from sqlalchemy.engine import make_url
    if url and '-pooler.' in (make_url(url).host or ''):
        raise RuntimeError('Migrations require a direct connection, not a pooled host.')
    engine=make_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection,target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()

run_migrations()
