from pathlib import Path
from sqlalchemy import select
from app.db import factory, Session, Audit, Document
from app.core import update

def test_health_and_authentication_cache_policy(client, auth, engine):
    health = client.get('/health')
    assert health.json() == {'status':'ok'}
    assert health.headers['cache-control'] == 'no-store, private'
    assert client.get('/api/v1/patients').status_code == 401
    headers = auth()
    assert client.get('/api/v1/auth/me', headers=headers).json()['role'] == 'CLINICIAN'
    assert client.get('/api/v1/patients', headers=headers).status_code == 200
    assert client.post('/api/v1/auth/logout', headers=headers).json() == {'revoked':True}
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401
    headers = auth()
    with factory(engine).begin() as db:
        for session in db.scalars(select(Session)):
            update(session, {'expiresAt':'2000-01-01T00:00:00Z'})
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401

def test_tenant_and_role_isolation(client, auth):
    north, riverside, admin, patient = auth(), auth('dr.riverside'), auth('admin.north'), auth('alex.example')
    assert client.get('/api/v1/patients/pat_002', headers=north).status_code == 404
    assert client.get('/api/v1/documents/doc_001a', headers=admin).status_code == 403
    assert client.get('/api/v1/documents/doc_001a', headers=patient).status_code == 403
    assert client.get('/api/v1/patients/pat_001', headers=riverside).status_code == 200
    response = client.post('/api/v1/documents', headers=riverside,
        data={'patientId':'pat_001','visitId':'vis_001','ifVersion':'1'}, files={'file':('rx.txt',b'SYN-RX-V1\n','text/plain')})
    assert response.status_code == 403

def test_validation_does_not_echo_sensitive_input(client):
    response = client.post('/api/v1/auth/login', json={'username':'x','password':'sensitive-value','unexpected':'clinical evidence'})
    assert response.status_code == 422
    assert 'sensitive-value' not in response.text and 'clinical evidence' not in response.text
    assert response.headers['cache-control'] == 'no-store, private'

def test_internal_failure_is_private_and_redacted(client,auth,monkeypatch):
    headers=auth()
    def unavailable():
        raise RuntimeError('sensitive-driver-detail')
    monkeypatch.setattr(client.app.state,'sessions',unavailable)
    response=client.get('/api/v1/patients',headers=headers)
    assert response.status_code==500
    assert response.headers['cache-control']=='no-store, private'
    assert response.json()['error']['code']=='INTERNAL_ERROR'
    assert 'sensitive-driver-detail' not in response.text

def test_upload_evidence_comparison_and_audit(client, auth, engine):
    headers = auth()
    patient = client.get('/api/v1/patients/pat_001', headers=headers).json()
    visits = client.get('/api/v1/patients/pat_001/visits', headers=headers).json()['items']
    visit_id = visits[0]['id']
    raw = (Path(__file__).resolve().parents[2]/'fixtures/documents/doc_001a.txt').read_text(encoding='utf-8')
    payload = {'patientId':patient['id'],'visitId':visit_id,'ifVersion':patient['version']}
    response = client.post('/api/v1/documents', headers=headers, data=payload, files={'file':('synthetic.txt',raw,'text/plain')})
    assert response.status_code == 202, response.text
    assert response.json()['status'] == 'COMPLETED'
    doc_id = response.json()['documentId']
    document = client.get('/api/v1/documents/'+doc_id, headers=headers)
    assert document.status_code == 200 and document.json()['rawText'] == raw
    extracted = client.get('/api/v1/documents/'+doc_id+'/extraction', headers=headers)
    assert extracted.status_code == 200, extracted.text
    for item in extracted.json()['items']:
        for span in item['fieldSources'].values():
            assert raw[span['charStart']:span['charEnd']] == span['quote']
    comparison = client.get('/api/v1/patients/pat_001/comparison',headers=headers,
        params={'leftVisitId':visit_id,'rightVisitId':visits[-1]['id']})
    assert comparison.status_code == 200, comparison.text
    assert any(row['sourceDocumentId'] == doc_id for row in comparison.json()['left'])
    stale = client.post('/api/v1/documents', headers=headers, data=payload, files={'file':('synthetic.txt',raw,'text/plain')})
    assert stale.status_code == 409
    with factory(engine)() as db:
        assert db.get(Document, doc_id)
        events = list(db.scalars(select(Audit).where(Audit.patient_id == patient['id'])))
        assert any(event.data['action'] == 'DOCUMENT_UPLOADED' for event in events)
        assert all(event.data.get('after') is None for event in events if event.data['action']=='DOCUMENT_UPLOADED')

def test_failed_extraction_keeps_source(client, auth):
    headers = auth()
    patient = client.get('/api/v1/patients/pat_001', headers=headers).json()
    visit = client.get('/api/v1/patients/pat_001/visits', headers=headers).json()['items'][0]
    response = client.post('/api/v1/documents', headers=headers,
        data={'patientId':patient['id'],'visitId':visit['id'],'ifVersion':patient['version']},
        files={'file':('invalid.txt',b'unsupported synthetic evidence','text/plain')})
    assert response.status_code == 202 and response.json()['status'] == 'FAILED'
    doc = client.get('/api/v1/documents/'+response.json()['documentId'], headers=headers)
    assert doc.json()['rawText'] == 'unsupported synthetic evidence'

def test_patient_instructions_withheld_until_verified(client, auth):
    response = client.get('/api/v1/patients/pat_001/medications/patient-view', headers=auth('alex.example'))
    assert response.status_code == 200, response.text
    assert response.json()['notice']
    assert all(row['instructionText'] is None for row in response.json()['items'])
