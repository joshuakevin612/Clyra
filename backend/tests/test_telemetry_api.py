from datetime import timedelta
from uuid import uuid4
from sqlalchemy import select, func, event
import pytest
from app import core
from app.db import TelemetrySession, TelemetryObservation, Patient, Grant, Audit, Access, User
from app.telemetry_engine import instant, iso
from app.telemetry_schemas import TelemetrySnapshot
from .test_api import code

BASE='/api/v1/patients/pat_001/telemetry'

def start(client, headers, request_id=None):
    return client.post(BASE+'/sessions',headers=headers,json={'requestId':request_id or str(uuid4())})

def reading(session, value=80, source='SENSOR_A', event_id=None, measured=None):
    return dict(eventId=event_id or str(uuid4()), sourceId=source,
        measuredAt=measured or session['startedAt'], value=value)

def send(client, headers, session, rows):
    return client.post(BASE+'/sessions/'+session['id']+'/readings',headers=headers,json={'readings':rows})

def stop(client, headers, session, version=1):
    return client.post(BASE+'/sessions/'+session['id']+'/stop',headers=headers,json={'ifVersion':version})

def test_lifecycle_replays_and_historical_selection(setup,login):
    c,dbs=setup; h=login('dr.north')
    empty=c.get(BASE+'/snapshot',headers=h)
    assert empty.status_code==200
    assert empty.json()['session'] is None
    TelemetrySnapshot.model_validate(empty.json())
    request_id=str(uuid4()); response=start(c,h,request_id)
    assert response.status_code==201,response.text
    session=response.json()
    assert session['id'].startswith('tel_') and session['version']==1
    assert instant(session['expiresAt'])-instant(session['startedAt'])==timedelta(minutes=15)
    assert start(c,h,request_id).json()==session
    code(start(c,h),409,'VERSION_CONFLICT')
    item=reading(session)
    response=send(c,h,session,[item,item])
    assert response.status_code==200,response.text
    assert response.json()['acceptedCount']==1 and response.json()['duplicateCount']==1
    assert send(c,h,session,[item]).json()['duplicateCount']==1
    code(stop(c,h,session,2),409,'VERSION_CONFLICT')
    ended=stop(c,h,session).json()
    assert ended['status']=='STOPPED' and ended['version']==2
    assert stop(c,h,session,2).json()==ended
    assert send(c,h,session,[item]).json()['duplicateCount']==1
    code(send(c,h,session,[item,reading(session)]),409,'VERSION_CONFLICT')
    next_session=start(c,h).json()
    assert c.get(BASE+'/snapshot',headers=h).json()['session']['id']==next_session['id']
    historical=c.get(BASE+'/snapshot',headers=h,params={'sessionId':session['id']}).json()
    assert len(historical['observations'])==1
    assert historical['sources'][0]['status']=='ENDED'
    with dbs() as db:
        assert db.get(Patient,'pat_001').version==1
        assert db.scalar(select(func.count()).select_from(Access).where(Access.patient_id=='pat_001'))>0

def test_conflicting_duplicates_are_atomic(setup,login):
    c,_=setup; h=login('dr.north'); s=start(c,h).json()
    item=reading(s); assert send(c,h,s,[item]).status_code==200
    for changed in (dict(item,value=81),dict(item,sourceId='SENSOR_B'),
                    dict(item,measuredAt=iso(instant(s['startedAt'])+timedelta(seconds=1)))):
        code(send(c,h,s,[reading(s),changed]),409,'VERSION_CONFLICT')
    new=reading(s)
    code(send(c,h,s,[new,dict(new,value=None)]),409,'VERSION_CONFLICT')
    assert len(c.get(BASE+'/snapshot',headers=h).json()['observations'])==1

@pytest.mark.parametrize('patch', [dict(value=-1),dict(value=1001),dict(value='80'),dict(value=True),
    dict(sourceId='UNKNOWN'),dict(eventId='bad'),dict(measuredAt='2026-11-05T00:00:00'),
    dict(measuredAt='2026-11-05T00:00:00+00:00'),dict(extra=1)])
def test_invalid_readings(setup,login,patch):
    c,_=setup; h=login('dr.north'); s=start(c,h).json()
    code(send(c,h,s,[dict(reading(s),**patch)]),422,'VALIDATION_FAILED')

def test_times_expiry_capacity_and_null(setup,login,monkeypatch):
    c,dbs=setup; h=login('dr.north'); time=core.now()
    monkeypatch.setattr(core,'now',lambda:time)
    s=start(c,h).json()
    item=reading(s,value=None)
    assert send(c,h,s,[item]).status_code==200
    assert send(c,h,s,[reading(s,measured=iso(time+timedelta(seconds=5)))]).status_code==200
    for seconds in (-0.001,5.001):
        code(send(c,h,s,[reading(s,measured=iso(time+timedelta(seconds=seconds)))]),422,'VALIDATION_FAILED')
    code(send(c,h,s,[]),422,'VALIDATION_FAILED')
    code(send(c,h,s,[reading(s) for _ in range(101)]),422,'VALIDATION_FAILED')
    for _ in range(9):
        assert send(c,h,s,[reading(s) for _ in range(100)]).status_code==200
    assert send(c,h,s,[reading(s) for _ in range(98)]).status_code==200
    assert send(c,h,s,[item]).json()['duplicateCount']==1
    code(send(c,h,s,[reading(s),item]),422,'VALIDATION_FAILED')
    monkeypatch.setattr(core,'now',lambda:time+timedelta(minutes=15))
    expired=c.get(BASE+'/snapshot',headers=h).json()
    assert expired['session']['status']=='EXPIRED' and expired['session']['version']==1
    assert send(c,h,s,[item]).json()['duplicateCount']==1
    code(send(c,h,s,[reading(s)]),409,'VERSION_CONFLICT')
    assert stop(c,h,s).json()['status']=='EXPIRED'
    assert start(c,h).status_code==201

def test_permissions_revocation_and_session_mismatch(setup,login):
    c,dbs=setup; north=login('dr.north'); view=login('dr.riverside')
    s=start(c,north).json()
    assert c.get(BASE+'/snapshot',headers=view).status_code==200
    code(start(c,view),403,'FORBIDDEN')
    code(send(c,view,s,[reading(s)]),403,'FORBIDDEN')
    code(stop(c,view,s),403,'FORBIDDEN')
    for username in ('admin.north','alex.example'):
        h=login(username)
        code(c.get(BASE+'/snapshot',headers=h),403,'FORBIDDEN')
        code(start(c,h),403,'FORBIDDEN')
    code(c.get(BASE+'/snapshot'),401,'UNAUTHENTICATED')
    code(c.get('/api/v1/patients/pat_002/telemetry/snapshot',headers=north),404,'NOT_FOUND')
    code(c.get('/api/v1/patients/pat_003/telemetry/snapshot',headers=north,params={'sessionId':s['id']}),404,'NOT_FOUND')
    for suffix,body in (('/readings',{'readings':[reading(s)]}),('/stop',{'ifVersion':1})):
        code(c.post('/api/v1/patients/pat_003/telemetry/sessions/'+s['id']+suffix,headers=north,json=body),404,'NOT_FOUND')
    with dbs.begin() as db:
        grant=db.scalar(select(Grant).where(Grant.patient_id=='pat_001',Grant.org_id=='org_north'))
        grant.data={'level':'NONE'}
    code(c.get(BASE+'/snapshot',headers=north),404,'NOT_FOUND')
    code(send(c,north,s,[reading(s)]),404,'NOT_FOUND')

def test_audit_failure_rolls_back_all_telemetry_writes(setup,login):
    c,dbs=setup; h=login('dr.north'); s=start(c,h).json()
    def reject(mapper,connection,target):
        if target.data['action'].startswith('TELEMETRY_'):
            raise RuntimeError('synthetic audit failure')
    event.listen(Audit,'before_insert',reject)
    try:
        assert send(c,h,s,[reading(s)]).status_code==500
        assert stop(c,h,s).status_code==500
        assert c.post('/api/v1/patients/pat_003/telemetry/sessions',headers=h,json={'requestId':str(uuid4())}).status_code==500
    finally:
        event.remove(Audit,'before_insert',reject)
    with dbs() as db:
        assert db.scalar(select(func.count()).select_from(TelemetryObservation))==0
        assert db.get(TelemetrySession,s['id']).version==1
        assert db.scalar(select(func.count()).select_from(TelemetrySession))==1

def test_admin_logs_never_expose_telemetry_content(setup,login):
    c,_=setup; h=login('dr.north'); s=start(c,h).json()
    assert send(c,h,s,[reading(s,value=987.654)]).status_code==200
    assert c.get(BASE+'/snapshot',headers=h).status_code==200
    stop(c,h,s)
    admin=login('admin.north')
    for endpoint in ('audit','access-log'):
        response=c.get('/api/v1/patients/pat_001/'+endpoint,headers=admin)
        assert response.status_code==200,response.text
        assert '987.654' not in response.text
        assert 'explanation' not in response.text and 'summary' not in response.text
        if endpoint=='audit':
            ingestion=[r for r in response.json()['items'] if r['action']=='TELEMETRY_READINGS_INGESTED']
            assert ingestion[0]['after']=={'acceptedCount':1,'duplicateCount':0}

@pytest.mark.parametrize('number', ['NaN','Infinity','-Infinity'])
def test_nonfinite_numbers_rejected(setup,login,number):
    import json
    c,_=setup; h=login('dr.north'); s=start(c,h).json()
    raw=json.dumps({'readings':[reading(s)]}).replace('"value": 80','"value": '+number)
    response=c.post(BASE+'/sessions/'+s['id']+'/readings',headers={**h,'Content-Type':'application/json'},content=raw)
    code(response,422,'VALIDATION_FAILED')

def test_unknown_fields_and_authentication_changes(setup,login):
    c,dbs=setup; h=login('dr.north'); s=start(c,h).json()
    code(c.post(BASE+'/sessions',headers=h,json={'requestId':str(uuid4()),'extra':True}),422,'VALIDATION_FAILED')
    code(c.post(BASE+'/sessions/'+s['id']+'/stop',headers=h,json={'ifVersion':1,'extra':True}),422,'VALIDATION_FAILED')
    with dbs.begin() as db:
        user=db.get(User,'usr_dr_north'); user.data={**user.data,'mustChangePassword':True}
    code(c.get(BASE+'/snapshot',headers=h),403,'FORBIDDEN')
    with dbs.begin() as db:
        user=db.get(User,'usr_dr_north'); user.data={**user.data,'mustChangePassword':False,'status':'DISABLED'}
    code(c.get(BASE+'/snapshot',headers=h),403,'FORBIDDEN')

def test_migration_retains_patient_telemetry_and_uses_current_grants(setup,login):
    c,dbs=setup; north=login('dr.north'); south=login('dr.riverside'); patient=login('alex.example')
    s=start(c,north).json(); assert send(c,north,s,[reading(s)]).status_code==200
    with dbs() as db:
        from app.db import Migration
        version=db.get(Migration,'mig_001').version
    response=c.post('/api/v1/migrations/mig_001/decision',headers=patient,
        json={'ifVersion':version,'decision':'APPROVE_FULL'})
    assert response.status_code==200,response.text
    code(c.get(BASE+'/snapshot',headers=north),404,'NOT_FOUND')
    snapshot=c.get(BASE+'/snapshot',headers=south).json()
    assert snapshot['session']['id']==s['id'] and len(snapshot['observations'])==1
    assert send(c,south,s,[reading(s)]).status_code==200
