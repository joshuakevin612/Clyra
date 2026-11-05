import os
os.environ['ENVIRONMENT']='test'
import pytest
from fastapi.testclient import TestClient
from app.db import Base, make_engine, factory, User
from app.main import create_app
from scripts.seed import seed

PASSWORD='Synthetic-test-password!'

@pytest.fixture
def setup():
    engine=make_engine('sqlite://')
    Base.metadata.create_all(engine)
    sessions=factory(engine)
    with sessions.begin() as db:
        seed(db,PASSWORD)
    app=create_app(engine)
    app.state.sessions=sessions
    with TestClient(app,raise_server_exceptions=False) as client:
        yield client,sessions
    engine.dispose()

@pytest.fixture
def login(setup):
    client,_=setup
    def authenticate(username):
        response=client.post('/api/v1/auth/login',json={'username':username,'password':PASSWORD})
        assert response.status_code==200,response.text
        return {'Authorization':'Bearer '+response.json()['accessToken']}
    return authenticate
