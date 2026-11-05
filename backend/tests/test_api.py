import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, event, func
from app.db import *
from app.core import create_user, passwords, digest, NOTICE
from app.schemas import Account
from scripts.seed import seed
from .conftest import PASSWORD

def code(response, status, expected):
    assert response.status_code==status,response.text
    assert response.json()['error']['code']==expected
    assert set(response.json()['error'])=={'code','message','details'}

def test_tenant_and_role_isolation(setup,login):
    client,_=setup
    clinician=login('dr.north'); admin=login('admin.north'); patient=login('alex.example')
    code(client.get('/api/v1/patients/pat_002',headers=clinician),404,'NOT_FOUND')
    code(client.get('/api/v1/patients/pat_002/audit',headers=admin),404,'NOT_FOUND')
    code(client.get('/api/v1/patients/pat_002',headers=patient),404,'NOT_FOUND')
    for path in ('medications','discrepancies'):
        code(client.get('/api/v1/patients/pat_001/'+path,headers=patient),403,'FORBIDDEN')
    code(client.get('/api/v1/documents/doc_001a',headers=admin),403,'FORBIDDEN')
    code(client.post('/api/v1/admin/users',headers=clinician,json={
        'username':'bad','displayName':'Bad','password':PASSWORD}),403,'FORBIDDEN')

def test_access_levels(setup,login):
    client,session=setup
    headers=login('dr.riverside')
    assert client.get('/api/v1/patients/pat_001',headers=headers).status_code==200
    code(client.patch('/api/v1/patients/pat_001',headers=headers,json={
        'displayName':'Modified','dateOfBirth':'1980-01-01','ifVersion':1}),403,'FORBIDDEN')
    with session.begin() as db:
        grant=db.scalar(select(Grant).where(Grant.patient_id=='pat_001',Grant.org_id=='org_riverside'))
        grant.data={'level':'NONE'}
    code(client.get('/api/v1/patients/pat_001',headers=headers),404,'NOT_FOUND')
    assert all(p['id']!='pat_001' for p in client.get('/api/v1/patients',headers=headers).json()['items'])

def test_audit_rollback(setup,login):
    client,sessions=setup
    headers=login('dr.north')
    def reject(*args):
        raise RuntimeError('Simulated audit failure')
    event.listen(Audit,'before_insert',reject)
    try:
        code(client.patch('/api/v1/patients/pat_001',headers=headers,json={
            'displayName':'Must roll back','dateOfBirth':'1980-01-01','ifVersion':1}),500,'INTERNAL_ERROR')
    finally:
        event.remove(Audit,'before_insert',reject)
    with sessions() as db:
        assert db.get(Patient,'pat_001').data['displayName']=='Alex Example'
        assert db.get(Patient,'pat_001').version==1

def test_commit_failure_precedes_response(setup,login):
    client,sessions=setup; headers=login('dr.north')
    def reject(*args):
        raise RuntimeError('Simulated commit failure after flush')
    event.listen(sessions.class_,'before_commit',reject)
    try:
        code(client.patch('/api/v1/patients/pat_001',headers=headers,json={
            'displayName':'Must roll back','dateOfBirth':'1980-01-01','ifVersion':1}),500,'INTERNAL_ERROR')
    finally:
        event.remove(sessions.class_,'before_commit',reject)
    with sessions() as db:
        assert db.get(Patient,'pat_001').data['displayName']=='Alex Example'
        assert not [a for a in db.scalars(select(Audit)) if a.data['action']=='PATIENT_UPDATED']

def test_access_failure_fails_closed(setup,login):
    client,_=setup; headers=login('dr.north')
    def reject(*args):
        raise RuntimeError('Simulated access failure')
    event.listen(Access,'before_insert',reject)
    try:
        for path in ('/patients/pat_001','/patients/pat_001/medications','/documents/doc_001a'):
            code(client.get('/api/v1'+path,headers=headers),500,'INTERNAL_ERROR')
    finally:
        event.remove(Access,'before_insert',reject)

def test_clinical_read_logging_and_shape(setup,login):
    client,sessions=setup; headers=login('dr.north')
    with sessions() as db:
        before=db.scalar(select(func.count()).select_from(Access))
    for path in ('/patients/pat_001','/patients/pat_001/visits','/patients/pat_001/medications',
                 '/patients/pat_001/discrepancies','/documents/doc_001a','/documents/doc_001a/extraction',
                 '/patients/pat_001/comparison?leftVisitId=vis_001a&rightVisitId=vis_001b'):
        response=client.get('/api/v1'+path,headers=headers)
        assert response.status_code==200,response.text
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(Access))==before+7
    meds=client.get('/api/v1/patients/pat_001/medications',headers=headers).json()
    assert set(meds)=={'items','nextCursor'}
    m=meds['items'][0]
    assert {'id','version','patientId','visitId','sourceDocumentId','supersedesId','medicineName','medicineKey','strength','form','instructionText','startDate','endDate','prescriberName','source','verificationStatus','createdAt'} <= set(m)
    raw=client.get('/api/v1/documents/'+m['sourceDocumentId'],headers=headers).json()['rawText']
    s=m['source']
    assert s['quote']==raw[s['charStart']:s['charEnd']]==m['instructionText']

def test_metadata_allowlists(setup,login):
    client,sessions=setup
    with sessions.begin() as db:
        create_user(db,Account(username='owner',displayName='Owner',password=PASSWORD),'SUPER_ADMIN',force=False)
        db.add(Audit(id='aud_poison',org_id='org_north',patient_id='pat_001',data={
            'actorId':'usr_dr_north','actorRole':'CLINICIAN','action':'MEDICATION_CREATED','targetId':'med_001a_0',
            'occurredAt':'2026-01-01T00:00:00Z','before':{'instructionText':'SECRET_CLINICAL'},'after':{'rawText':'SECRET_CLINICAL'},'note':'SECRET_CLINICAL','medicineName':'SECRET_CLINICAL'}))
    for username,paths in [('admin.north',['/admin/users','/admin/audit','/admin/access-log','/patients/pat_001/audit','/patients/pat_001/access-log','/patients/pat_001/migrations']),('owner',['/superadmin/organisations','/superadmin/audit','/superadmin/access-log'])]:
        headers=login(username)
        for path in paths:
            response=client.get('/api/v1'+path,headers=headers)
            assert response.status_code==200,response.text
            for forbidden in ('SECRET_CLINICAL','instructionText','rawText','extractedFields','medicineName','passwordHash','reason'):
                assert forbidden not in response.text
            for row in response.json()['items']:
                if 'occurredAt' in row:
                    assert row['occurredAt'].endswith('Z')

def test_verification_block_review_and_patient_view(setup,login):
    client,_=setup; clinician=login('dr.north'); patient=login('alex.example')
    path='/api/v1/medications/med_001a_0/verification'
    code(client.patch(path,headers=clinician,json={'ifVersion':1,'verificationStatus':'VERIFIED'}),409,'VERSION_CONFLICT')
    discrepancies=client.get('/api/v1/patients/pat_001/discrepancies',headers=clinician).json()['items']
    assert len(discrepancies)==4
    for d in discrepancies:
        if d['medicineKey']=='amlodipine':
            response=client.post('/api/v1/discrepancies/'+d['id']+'/decisions',headers=clinician,json={
                'decision':'KEEP_BOTH_FLAGGED','note':'Reviewed synthetic source','ifVersion':d['version']})
            assert response.status_code==201,response.text
    response=client.patch(path,headers=clinician,json={'ifVersion':1,'verificationStatus':'VERIFIED'})
    assert response.status_code==200,response.text
    view=client.get('/api/v1/patients/pat_001/medications/patient-view',headers=patient).json()
    assert view['notice']==NOTICE
    verified=[m for m in view['items'] if m['status']=='VERIFIED']
    assert len(verified)==1
    assert verified[0]['instructionText']==response.json()['instructionText']
    assert all(m['instructionText'] is None for m in view['items'] if m['status']=='AWAITING_REVIEW')

def test_migration_approval(setup,login):
    client,sessions=setup; patient=login('alex.example'); north=login('dr.north')
    response=client.post('/api/v1/migrations/mig_001/decision',headers=patient,json={'decision':'APPROVE_VIEW_ONLY','ifVersion':1})
    assert response.status_code==200,response.text
    assert response.json()['status']=='COMPLETED'
    with sessions() as db:
        assert db.get(Patient,'pat_001').org_id=='org_riverside'
        grants={g.org_id:g.data['level'] for g in db.scalars(select(Grant).where(Grant.patient_id=='pat_001'))}
        assert grants=={'org_north':'VIEW_ONLY','org_riverside':'FULL'}
        audits=list(db.scalars(select(Audit)))
        assert {a.org_id for a in audits if a.data['action']=='MIGRATION_COMPLETED'}=={'org_north','org_riverside'}
        assert db.scalar(select(func.count()).select_from(Medication))==7
    code(client.patch('/api/v1/patients/pat_001',headers=north,json={'displayName':'No','dateOfBirth':'1980-01-01','ifVersion':2}),403,'FORBIDDEN')
    code(client.post('/api/v1/migrations/mig_001/decision',headers=patient,json={'decision':'DECLINE','ifVersion':2}),409,'MIGRATION_NOT_PENDING')

def test_migration_failure_atomic(setup,login):
    client,sessions=setup; patient=login('alex.example')
    def reject(mapper,connection,target):
        if target.org_id=='org_riverside':
            raise RuntimeError('Second org audit failed')
    event.listen(Audit,'before_insert',reject)
    try:
        code(client.post('/api/v1/migrations/mig_001/decision',headers=patient,json={'decision':'APPROVE_FULL','ifVersion':1}),500,'INTERNAL_ERROR')
    finally:
        event.remove(Audit,'before_insert',reject)
    with sessions() as db:
        assert db.get(Patient,'pat_001').org_id=='org_north'
        assert db.get(Migration,'mig_001').status=='PENDING_PATIENT_APPROVAL'
        assert db.get(User,'usr_alex').org_id=='org_north'
        assert {g.org_id:g.data['level'] for g in db.scalars(select(Grant).where(Grant.patient_id=='pat_001'))}=={'org_north':'FULL','org_riverside':'VIEW_ONLY'}
        assert not [a for a in db.scalars(select(Audit)) if a.data['action']=='MIGRATION_APPROVED']

def test_login_security_and_revocation(setup,login):
    client,sessions=setup
    response=client.post('/api/v1/auth/login',json={'username':'dr.north','password':PASSWORD})
    data=response.json(); assert data['tokenType']=='Bearer'
    assert len(bytes.fromhex(data['accessToken']))==32
    expires=datetime.fromisoformat(data['expiresAt'].replace('Z','+00:00'))
    assert timedelta(hours=7,minutes=59)<expires-datetime.now(timezone.utc)<=timedelta(hours=8)
    with sessions() as db:
        assert db.get(Session,digest(data['accessToken']))
        assert db.get(User,'usr_dr_north').data['passwordHash'].startswith('$argon2id$')
        assert data['accessToken'] not in str([s.data for s in db.scalars(select(Session))])
    headers={'Authorization':'Bearer '+data['accessToken']}
    assert client.post('/api/v1/auth/logout',headers=headers).status_code==200
    code(client.get('/api/v1/auth/me',headers=headers),401,'UNAUTHENTICATED')
    for i in range(5):
        code(client.post('/api/v1/auth/login',json={'username':'dr.north','password':'wrong'}),429 if i==4 else 401,'RATE_LIMITED' if i==4 else 'INVALID_CREDENTIALS')
    code(client.post('/api/v1/auth/login',json={'username':'dr.north','password':PASSWORD}),429,'RATE_LIMITED')

def test_disable_reset_and_force_change(setup,login):
    client,_=setup; clinician=login('dr.north'); admin=login('admin.north')
    response=client.patch('/api/v1/admin/users/usr_dr_north',headers=admin,json={'ifVersion':1,'status':'DISABLED'})
    assert response.status_code==200,response.text
    code(client.get('/api/v1/auth/me',headers=clinician),401,'UNAUTHENTICATED')
    code(client.post('/api/v1/auth/login',json={'username':'dr.north','password':PASSWORD}),403,'ACCOUNT_DISABLED')
    assert client.patch('/api/v1/admin/users/usr_dr_north',headers=admin,json={'ifVersion':2,'status':'ACTIVE','password':PASSWORD}).status_code==200
    headers=login('dr.north')
    code(client.get('/api/v1/patients',headers=headers),403,'FORBIDDEN')
    response=client.post('/api/v1/auth/change-password',headers=headers,json={'currentPassword':PASSWORD,'newPassword':'Another-synthetic-password!','ifVersion':3})
    assert response.status_code==200,response.text
    assert response.json()['mustChangePassword'] is False
    code(client.get('/api/v1/auth/me',headers=headers),401,'UNAUTHENTICATED')

def test_signup_limit_and_validation(setup):
    client,_=setup
    for i in range(5):
        response=client.post('/api/v1/auth/signup',json={'username':f'patient{i}','displayName':'Synthetic Signup','password':PASSWORD,'dateOfBirth':'1990-01-01'})
        assert response.status_code==201,response.text
        assert response.json()['role']=='PATIENT'
    code(client.post('/api/v1/auth/signup',json={'username':'extra','displayName':'Extra','password':PASSWORD,'dateOfBirth':'1990-01-01'}),429,'RATE_LIMITED')
    response=client.post('/api/v1/auth/signup',json={'username':'x','displayName':'X','password':'secret','dateOfBirth':'invalid'})
    code(response,422,'VALIDATION_FAILED'); assert 'secret' not in response.text
    code(client.get('/api/v1/unknown'),404,'NOT_FOUND')

def test_seed_idempotent_and_production_refusal(setup,monkeypatch):
    _,sessions=setup
    with sessions.begin() as db:
        before={t.name:db.scalar(select(func.count()).select_from(t)) for t in Base.metadata.sorted_tables}
        seed(db,PASSWORD)
        after={t.name:db.scalar(select(func.count()).select_from(t)) for t in Base.metadata.sorted_tables}
        assert before==after
    monkeypatch.setenv('ENVIRONMENT','production')
    with sessions() as db:
        import pytest
        with pytest.raises(RuntimeError,match='production'):
            seed(db,PASSWORD)

def test_upload_strict_template_and_job(setup,login):
    client,_=setup; headers=login('dr.north')
    response=client.post('/api/v1/documents',headers=headers,data={'patientId':'pat_003','visitId':'vis_003a','ifVersion':'1'},files={'file':('bad.txt',b'not a supported template','text/plain')})
    assert response.status_code==202,response.text
    job=client.get('/api/v1/extraction-jobs/'+response.json()['jobId'],headers=headers)
    assert job.json()['status']=='FAILED'
    response=client.post('/api/v1/documents',headers=headers,data={'patientId':'pat_003','visitId':'vis_003a','ifVersion':'2'},files={'file':('valid.txt',( __import__('pathlib').Path(__file__).resolve().parents[2]/'fixtures/documents/doc_003a.txt').read_bytes(),'text/plain')})
    assert response.status_code==202,response.text
    result=client.get('/api/v1/documents/'+response.json()['documentId']+'/extraction',headers=headers)
    assert result.status_code==200
    assert result.json()['status']=='COMPLETED'

def test_pagination_and_version_conflict(setup,login):
    client,_=setup; headers=login('dr.north')
    first=client.get('/api/v1/patients?limit=1',headers=headers).json()
    assert len(first['items'])==1 and first['nextCursor']
    second=client.get('/api/v1/patients?limit=1&cursor='+first['nextCursor'],headers=headers).json()
    assert second['items'][0]['id']!=first['items'][0]['id']
    code(client.get('/api/v1/patients?limit=201',headers=headers),422,'VALIDATION_FAILED')
    code(client.patch('/api/v1/patients/pat_001',headers=headers,json={'displayName':'Alex Example','dateOfBirth':'1980-01-01','ifVersion':99}),409,'VERSION_CONFLICT')

def test_full_migration_revokes_source(setup,login):
    client,_=setup; patient=login('alex.example'); north=login('dr.north')
    response=client.post('/api/v1/migrations/mig_001/decision',headers=patient,json={'decision':'APPROVE_FULL','ifVersion':1})
    assert response.status_code==200,response.text
    code(client.get('/api/v1/patients/pat_001',headers=north),404,'NOT_FOUND')
    assert client.get('/api/v1/patients/pat_001',headers=patient).json()['id']=='pat_001'

def test_decline_and_request_migration(setup,login):
    client,_=setup; patient=login('alex.example'); riverside=login('dr.riverside')
    assert client.post('/api/v1/migrations/mig_001/decision',headers=patient,json={'decision':'DECLINE','ifVersion':1}).json()['status']=='DECLINED'
    response=client.post('/api/v1/patients/pat_001/migrations',headers=riverside,json={'reason':'Synthetic transfer','ifVersion':1})
    assert response.status_code==201,response.text
    assert response.json()['destinationOrgId']=='org_riverside'
    code(client.post('/api/v1/patients/pat_001/migrations',headers=riverside,json={'ifVersion':2}),409,'VERSION_CONFLICT')
    status=client.get('/api/v1/migrations/'+response.json()['id'],headers=patient)
    assert status.status_code==200

def test_link_confirmation_and_grants(setup,login):
    client,_=setup; clinician=login('dr.north'); sam=login('sam.signup')
    response=client.post('/api/v1/patients/pat_003/link-request',headers=clinician,json={'username':'sam.signup'})
    assert response.status_code==201,response.text
    link=response.json()
    pending=client.get('/api/v1/link-requests',headers=sam).json()['items']
    assert pending[0]['displayName']=='Jordan Test' and pending[0]['dateOfBirth']=='1990-03-03'
    response=client.post('/api/v1/link-requests/'+link['id']+'/decision',headers=sam,json={'decision':'CONFIRM','ifVersion':1})
    assert response.status_code==200,response.text
    grants=client.get('/api/v1/patients/pat_003/access-grants',headers=sam).json()['items']
    grant=grants[0]
    response=client.post('/api/v1/patients/pat_003/access-grants/org_north',headers=sam,json={'ifVersion':grant['version'],'level':'NONE'})
    assert response.status_code==200,response.text
    code(client.get('/api/v1/patients/pat_003',headers=clinician),404,'NOT_FOUND')
    assert client.get('/api/v1/patients/pat_003',headers=sam).status_code==200

def test_organisation_and_user_management(setup,login):
    client,sessions=setup
    with sessions.begin() as db:
        create_user(db,Account(username='owner',displayName='Owner',password=PASSWORD),'SUPER_ADMIN',force=False)
    owner=login('owner'); clinician=login('dr.north')
    response=client.post('/api/v1/superadmin/organisations',headers=owner,json={
        'name':'Synthetic New Clinic','adminUsername':'admin.new','adminDisplayName':'New Admin','adminPassword':PASSWORD})
    assert response.status_code==201,response.text
    org=response.json()
    assert org['admin']['role']=='ADMIN' and org['admin']['mustChangePassword']
    assert client.post('/api/v1/superadmin/organisations/'+org['id']+'/admins',headers=owner,json={
        'username':'admin.second','displayName':'Second','password':PASSWORD}).status_code==201
    assert client.patch('/api/v1/superadmin/organisations/org_north',headers=owner,json={'status':'SUSPENDED','ifVersion':1}).status_code==200
    code(client.get('/api/v1/auth/me',headers=clinician),401,'UNAUTHENTICATED')
    code(client.post('/api/v1/auth/login',json={'username':'dr.north','password':PASSWORD}),403,'ACCOUNT_DISABLED')
    assert client.patch('/api/v1/superadmin/organisations/org_north',headers=owner,json={'status':'ACTIVE','ifVersion':2}).status_code==200
    admin=login('admin.north')
    response=client.post('/api/v1/admin/users',headers=admin,json={'username':'dr.new','displayName':'Synthetic New Clinician','password':PASSWORD})
    assert response.status_code==201,response.text
    assert response.json()['role']=='CLINICIAN'
    code(client.patch('/api/v1/admin/users/usr_admin_north',headers=admin,json={'status':'DISABLED','ifVersion':1}),404,'NOT_FOUND')

def test_create_patient_login_and_service_admin_protection(setup,login):
    from app.main import account_patch
    from app.schemas import AccountPatch
    from app.core import ApiError
    import pytest
    client,sessions=setup; clinician=login('dr.north')
    response=client.post('/api/v1/patients',headers=clinician,json={'displayName':'Synthetic New Patient','dateOfBirth':'2000-01-01'})
    assert response.status_code==201,response.text
    patient=response.json()
    response=client.post('/api/v1/patients/'+patient['id']+'/login',headers=clinician,json={'username':'patient.new','displayName':'Synthetic New Patient','password':PASSWORD})
    assert response.status_code==201,response.text
    response=client.patch('/api/v1/patients/'+patient['id']+'/login',headers=clinician,json={'status':'DISABLED','ifVersion':1})
    assert response.status_code==200,response.text
    assert client.patch('/api/v1/patients/'+patient['id']+'/login',headers=clinician,json={'status':'ACTIVE','ifVersion':2}).status_code==200
    with sessions.begin() as db:
        admin=db.get(User,'usr_admin_north')
        with pytest.raises(ApiError) as error:
            account_patch(db,admin,admin,AccountPatch(status='DISABLED',ifVersion=1))
        assert error.value.body['error']['code']=='LAST_ADMIN_PROTECTED'

def test_openapi_contract_coverage_and_response_models(setup):
    client,_=setup
    from pathlib import Path
    import re
    contract=(Path(__file__).resolve().parents[2]/'contract/CONTRACT.md').read_text(encoding='utf-8-sig')
    specified=re.findall(r'\| \d+ \| (GET|POST|PATCH) \| ([^ ]+) \|',contract)
    assert len(specified)==42
    schema=client.get('/openapi.json').json()
    for method,path in specified:
        operation=schema['paths']['/api/v1'+path][method.lower()]
        success=[v for k,v in operation['responses'].items() if k.startswith('2')]
        assert success and all('schema' in r['content']['application/json'] for r in success)
        assert operation['responses']['422']['content']['application/json']['schema']['$ref'].endswith('/ErrorOutput')
