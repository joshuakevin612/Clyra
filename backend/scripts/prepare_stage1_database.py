"""Create and retain a fresh synthetic test database on the isolated Neon branch.

Requires the locally prepared ignored .env.stage1 owner URL. Never seeds the
canonical database. Writes test credentials only to an ignored environment file.
"""
from datetime import datetime,timezone
from pathlib import Path
import os
import secrets
from dotenv import dotenv_values
from sqlalchemy import create_engine,text
from sqlalchemy.engine import make_url
from alembic import command
from alembic.config import Config
from app.db import factory
from scripts.seed import seed

def main():
    backend=Path(__file__).resolve().parents[1]
    isolated=dotenv_values(backend/'.env.stage1')
    canonical=dotenv_values(backend/'.env')
    owner=make_url(isolated['MIGRATION_DATABASE_URL']).set(drivername='postgresql+psycopg')
    original=make_url(canonical['DATABASE_URL'])
    if (owner.host or '').replace('-pooler.','.')==(original.host or '').replace('-pooler.','.'):
        raise RuntimeError('Preparation cannot target the canonical branch.')
    name='clyra_stage1_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')+'_'+secrets.token_hex(3)
    engine=create_engine(owner,isolation_level='AUTOCOMMIT',connect_args={'connect_timeout':15})
    with engine.connect() as db:
        # Identifier consists exclusively of a fixed prefix, digits and hex.
        db.execute(text(f'CREATE DATABASE "{name}"'))
    engine.dispose()
    test_owner=owner.set(database=name)
    host=owner.host.replace('-pooler.','.')
    pooled_host=host.replace('.', '-pooler.',1)
    runtime=original.set(host=pooled_host,database=name)
    os.environ.update(ENVIRONMENT='test',MIGRATION_DATABASE_URL=test_owner.render_as_string(hide_password=False),APPLICATION_DB_ROLE='clyra_app')
    command.upgrade(Config(str(backend/'alembic.ini')),'head')
    engine=create_engine(test_owner,connect_args={'connect_timeout':15})
    with factory(engine).begin() as db:
        seed(db,'Clyra-test-2026')
    engine.dispose()
    values={'CLYRA_POSTGRES_TEST_URL':runtime.render_as_string(hide_password=False),
            'DATABASE_URL':runtime.render_as_string(hide_password=False),
            'MIGRATION_DATABASE_URL':test_owner.render_as_string(hide_password=False),
            'BACKUP_DATABASE_URL':test_owner.render_as_string(hide_password=False),
            'ENVIRONMENT':'test','APPLICATION_DB_ROLE':'clyra_app'}
    (backend/'.env.stage1-tests').write_text(''.join(f'{k}={v}\n' for k,v in values.items()),encoding='utf-8')
    print('Fresh isolated PostgreSQL test database prepared:',name)

if __name__=='__main__':
    main()
