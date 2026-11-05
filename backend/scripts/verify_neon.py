"""Live PostgreSQL checks on the synthetic development database; no secrets output."""
from pathlib import Path
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import text, event, select, func
from sqlalchemy.exc import DBAPIError
from app.db import make_engine, factory, Audit, Patient, Base
from app.main import create_app
from app.core import NOTICE

def verify():
    engine=make_engine()
    if engine.dialect.name!='postgresql':
        raise RuntimeError('This verification requires PostgreSQL.')
    sessions=factory(engine)
    with engine.connect() as conn:
        # On a pooled URL pg_stat_ssl describes the pooler-to-Postgres hop.
        # libpq reports TLS on the actual client connection to Neon.
        assert conn.connection.driver_connection.pgconn.ssl_in_use, 'Client SSL is required'
        assert conn.scalar(text('SELECT current_user'))=='clyra_app', 'Use the restricted runtime role'
        assert not conn.scalar(text("SELECT has_schema_privilege(current_user,'public','CREATE')"))
        for table in ('audit_events','access_events'):
            for privilege in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE'):
                actual=conn.scalar(text('SELECT has_table_privilege(current_user,:table,:privilege)'),{'table':table,'privilege':privilege})
                assert actual == (privilege in ('SELECT','INSERT')), (table,privilege)
            for command in (f'UPDATE {table} SET version=version WHERE false',f'DELETE FROM {table} WHERE false',f'TRUNCATE {table}'):
                try:
                    with conn.begin_nested():
                        conn.execute(text(command))
                except DBAPIError as exc:
                    assert exc.orig.sqlstate=='42501'
                else:
                    raise AssertionError('Runtime event mutation unexpectedly permitted')
        try:
            with conn.begin_nested():
                conn.execute(text("UPDATE medication_entries SET data=jsonb_set(data::jsonb,'{instructionText}','\"tampered\"')::json WHERE id='med_003a_0'"))
        except DBAPIError as exc:
            assert exc.orig.sqlstate=='P0001'
        else:
            raise AssertionError('Medication immutability trigger did not run')
        counts={table.name:conn.scalar(select(func.count()).select_from(table)) for table in Base.metadata.sorted_tables if table.name!='alembic_version'}
    credentials=dotenv_values(Path(__file__).resolve().parents[1]/'.env.development-logins')
    app=create_app(engine); app.state.sessions=sessions
    with TestClient(app,raise_server_exceptions=False) as client:
        headers={}
        for username in ('dr.north','admin.north','alex.example'):
            response=client.post('/api/v1/auth/login',json={'username':username,'password':credentials['FIXTURE_PASSWORD']})
            assert response.status_code==200,(username,response.status_code)
            headers[username]={'Authorization':'Bearer '+response.json()['accessToken']}
        assert client.get('/api/v1/patients/pat_002',headers=headers['dr.north']).status_code==404
        assert client.get('/api/v1/patients/pat_001/audit',headers=headers['admin.north']).status_code==200
        view=client.get('/api/v1/patients/pat_001/medications/patient-view',headers=headers['alex.example'])
        assert view.status_code==200 and view.json()['notice']==NOTICE
        def reject(*args):
            raise RuntimeError('Intentional live audit rollback check')
        with sessions() as db:
            p=db.get(Patient,'pat_003'); name=p.data['displayName']; version=p.version
        event.listen(Audit,'before_insert',reject)
        try:
            response=client.patch('/api/v1/patients/pat_003',headers=headers['dr.north'],json={
                'displayName':'Must roll back','dateOfBirth':'1990-03-03','ifVersion':version})
            assert response.status_code==500
        finally:
            event.remove(Audit,'before_insert',reject)
        with sessions() as db:
            assert db.get(Patient,'pat_003').data['displayName']==name
            assert db.get(Patient,'pat_003').version==version
        for h in headers.values():
            assert client.post('/api/v1/auth/logout',headers=h).status_code==200
    engine.dispose()
    print('Verified PostgreSQL SSL, restricted role, append-only event privileges, immutable medication trigger, HTTP login/tenant/patient-view flows, and audit rollback.')
    print('Seeded table counts: '+', '.join(f'{name}={count}' for name,count in sorted(counts.items())))

if __name__=='__main__':
    try:
        verify()
    except Exception as exc:
        if isinstance(exc,AssertionError):
            print('Live verification assertion failed:',str(exc) or '(see assertion location in script)')
        else:
            print('Live verification failed:',type(exc).__name__,getattr(getattr(exc,'orig',None),'sqlstate',''))
        print('Database exception text withheld to protect credentials.')
        raise SystemExit(1)
