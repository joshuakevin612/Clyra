from pathlib import Path
from uuid import uuid4
from sqlalchemy import select, func
from app.db import factory, Medication, ExternalImport, Document

def test_stage_confirm_and_compare(client, auth, engine):
    headers=auth()
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_001a.txt').read_bytes()
    raw=raw.replace(b'Synthetic source instruction.',('Synthetic source instruction. '+str(uuid4())).encode())
    request={'patientId':'pat_001','sourceLabel':'Synthetic external source','visitDate':'2026-11-06','requestId':str(uuid4())}
    with factory(engine)() as db:
        count=db.scalar(select(func.count()).select_from(Medication))
    stage=client.post('/api/v1/external-imports',headers=headers,data=request,files={'file':('external.txt',raw,'text/plain')})
    assert stage.status_code==201,stage.text
    staged=stage.json()
    assert staged['status']=='PENDING_ASSOCIATION' and staged['documentId'] is None
    with factory(engine)() as db:
        assert db.scalar(select(func.count()).select_from(Medication))==count
    retry=client.post('/api/v1/external-imports',headers=headers,data=request,files={'file':('external.txt',raw,'text/plain')})
    assert retry.status_code==201 and retry.json()['id']==staged['id']
    source=client.get('/api/v1/external-imports/'+staged['id']+'/source',headers=headers)
    assert source.status_code==200 and source.json()['rawText']==raw.decode()
    patient=client.get('/api/v1/patients/pat_001',headers=headers).json()
    body={'ifVersion':staged['version'],'patientId':patient['id'],'patientIfVersion':patient['version'],'confirmAssociation':True}
    wrong=client.post('/api/v1/external-imports/'+staged['id']+'/confirm',headers=headers,json={**body,'patientId':'pat_003'})
    assert wrong.status_code==409
    stale=client.post('/api/v1/external-imports/'+staged['id']+'/confirm',headers=headers,json={**body,'patientIfVersion':999})
    assert stale.status_code==409
    confirmed=client.post('/api/v1/external-imports/'+staged['id']+'/confirm',headers=headers,json=body)
    assert confirmed.status_code==200,confirmed.text
    item=confirmed.json()
    assert item['status']=='CONFIRMED' and item['documentId']
    repeated=client.post('/api/v1/external-imports/'+staged['id']+'/confirm',headers=headers,json=body)
    assert repeated.status_code==409
    with factory(engine)() as db:
        assert db.scalar(select(func.count()).select_from(Medication))==count+2
        assert db.get(Document,item['documentId']).data['rawText']==raw.decode()
    source=client.get('/api/v1/external-imports/'+staged['id']+'/source',headers=headers).json()
    for entry in source['entries']:
        assert entry['source']['documentId']==item['documentId']
    other=auth('dr.riverside')
    assert client.get('/api/v1/external-imports/'+staged['id'],headers=other).status_code==404
    assert client.get('/api/v1/external-imports/'+staged['id'],headers=auth('alex.example')).status_code==403

def test_import_validation_and_idempotency_collision(client,auth):
    headers=auth()
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_001a.txt').read_bytes()+b'\n'
    raw=raw.replace(b'Synthetic source instruction.',('Synthetic source instruction. '+str(uuid4())).encode())
    request={'patientId':'pat_001','sourceLabel':'Synthetic source','visitDate':'2026-11-06','requestId':str(uuid4())}
    bad=client.post('/api/v1/external-imports',headers=headers,data=request,files={'file':('bad.txt',b'not supported','text/plain')})
    assert bad.status_code==422
    staged=client.post('/api/v1/external-imports',headers=headers,data=request,files={'file':('rx.txt',raw,'text/plain')})
    assert staged.status_code==201
    for changed in ({**request,'sourceLabel':'different'},{**request,'requestId':str(uuid4())}):
        response=client.post('/api/v1/external-imports',headers=headers,data=changed,files={'file':('rx.txt',raw,'text/plain')})
        assert response.status_code==409
