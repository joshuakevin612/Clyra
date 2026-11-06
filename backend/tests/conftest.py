import os
import sys
from pathlib import Path
os.environ['ENVIRONMENT'] = 'test'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi.testclient import TestClient
from app.db import Base, make_engine, factory
from app.main import create_app
from scripts.seed import seed
from sqlalchemy.engine import make_url
from dotenv import dotenv_values

@pytest.fixture(scope='session')
def postgres_engine():
    url=os.getenv('CLYRA_POSTGRES_TEST_URL')
    if not url:
        yield None
        return
    parsed=make_url(url)
    canonical=dotenv_values(Path(__file__).resolve().parents[1]/'.env').get('DATABASE_URL')
    if not (parsed.database or '').startswith('clyra_stage1_'):
        raise RuntimeError('PostgreSQL tests require a dedicated clyra_stage1_* database.')
    if canonical and (parsed.host or '').replace('-pooler.','.')==(make_url(canonical).host or '').replace('-pooler.','.'):
        raise RuntimeError('Tests cannot use the canonical database host.')
    engine=make_engine(url)
    yield engine
    engine.dispose()

@pytest.fixture
def engine(postgres_engine):
    if postgres_engine is not None:
        yield postgres_engine
        return
    engine = make_engine('sqlite://')
    Base.metadata.create_all(engine)
    with factory(engine).begin() as db:
        seed(db, 'Clyra-test-2026')
    yield engine
    engine.dispose()

@pytest.fixture
def client(engine):
    with TestClient(create_app(engine), raise_server_exceptions=False) as client:
        yield client

@pytest.fixture
def auth(client):
    def headers(username='dr.north'):
        response = client.post('/api/v1/auth/login', json={'username':username, 'password':'Clyra-test-2026'})
        assert response.status_code == 200, response.text
        return {'Authorization':'Bearer '+response.json()['accessToken']}
    return headers
