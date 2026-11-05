from pathlib import Path
from sqlalchemy import select, func
from app.db import User, Medication, Document, Audit
from app.core import create_user
from app.schemas import Account
from .conftest import PASSWORD

def test_create_visit_and_source_backed_replacement(setup,login):
    client,sessions=setup; clinician=login('dr.north')
    old=client.get('/api/v1/patients/pat_003/medications',headers=clinician).json()['items'][0]
    visit=client.post('/api/v1/patients/pat_003/visits',headers=clinician,json={'visitDate':'2026-11-05','ifVersion':1})
    assert visit.status_code==201,visit.text
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_003a.txt').read_text()
    replacement=raw.replace('strength: 5 MG','strength: 10 MG')
    response=client.post('/api/v1/documents',headers=clinician,data={
        'patientId':'pat_003','visitId':visit.json()['id'],'ifVersion':2,
        'supersedesId':old['id'],'supersedesIfVersion':old['version']},files={'file':('replacement.txt',replacement.encode(),'text/plain')})
    assert response.status_code==202,response.text
    meds=client.get('/api/v1/patients/pat_003/medications',headers=clinician).json()['items']
    assert len(meds)==2
    new=next(m for m in meds if m['supersedesId']==old['id'])
    assert new['verificationStatus']=='UNVERIFIED' and new['strength']['value']==10
    assert next(m for m in meds if m['id']==old['id'])==old
    assert new['instructionText']==old['instructionText']
    discrepancies=client.get('/api/v1/patients/pat_003/discrepancies',headers=clinician).json()['items']
    assert len(discrepancies)==1 and discrepancies[0]['type']=='CONFLICT'
    assert discrepancies[0]['field']=='strength'
    assert client.post('/api/v1/documents',headers=clinician,data={
        'patientId':'pat_003','visitId':visit.json()['id'],'ifVersion':3,
        'supersedesId':old['id'],'supersedesIfVersion':old['version']},files={'file':('x.txt',replacement.encode(),'text/plain')}).status_code==409

def test_replacement_failure_rolls_back_upload(setup,login):
    client,sessions=setup; clinician=login('dr.north')
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_003a.txt').read_text().replace('Example medicine','Different medicine')
    with sessions() as db:
        before=db.scalar(select(func.count()).select_from(Document))
    response=client.post('/api/v1/documents',headers=clinician,data={
        'patientId':'pat_003','visitId':'vis_003a','ifVersion':1,
        'supersedesId':'med_003a_0','supersedesIfVersion':1},files={'file':('wrong.txt',raw.encode(),'text/plain')})
    assert response.status_code==422,response.text
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(Document))==before

def test_visit_access_and_pending_migration_cancellation(setup,login):
    client,_=setup; riverside=login('dr.riverside'); alex=login('alex.example')
    assert client.post('/api/v1/patients/pat_001/visits',headers=riverside,json={'visitDate':'2026-11-05','ifVersion':1}).status_code==403
    response=client.post('/api/v1/migrations/mig_001/cancel',headers=alex,json={'ifVersion':1})
    assert response.status_code==200,response.text
    assert response.json()['status']=='CANCELLED'
    response=client.post('/api/v1/migrations/mig_001/decision',headers=alex,json={'decision':'APPROVE_FULL','ifVersion':2})
    assert response.status_code==409
    assert response.json()['error']['code']=='MIGRATION_NOT_PENDING'
    assert len(client.get('/api/v1/organisations',headers=alex).json()['items'])==2

def test_admin_management_protects_last_active_admin(setup,login):
    client,sessions=setup
    with sessions.begin() as db:
        create_user(db,Account(username='owner',displayName='Owner',password=PASSWORD),'SUPER_ADMIN',force=False)
    owner=login('owner')
    path='/api/v1/superadmin/organisations/org_north/admins'
    response=client.patch(path+'/usr_admin_north',headers=owner,json={'ifVersion':1,'status':'DISABLED'})
    assert response.status_code==409,response.text
    assert response.json()['error']['code']=='LAST_ADMIN_PROTECTED'
    new=client.post(path,headers=owner,json={'username':'admin.second','displayName':'Second','password':PASSWORD})
    assert new.status_code==201
    assert len(client.get(path,headers=owner).json()['items'])==2
    assert client.patch(path+'/usr_admin_north',headers=owner,json={'ifVersion':1,'status':'DISABLED'}).status_code==200
    response=client.patch(path+'/'+new.json()['id'],headers=owner,json={'ifVersion':1,'status':'DISABLED'})
    assert response.json()['error']['code']=='LAST_ADMIN_PROTECTED'

def test_unfilled_visit_is_not_a_missing_medication_list(setup,login):
    client,_=setup; clinician=login('dr.north')
    response=client.post('/api/v1/patients/pat_003/visits',headers=clinician,json={'visitDate':'2026-12-01','ifVersion':1})
    assert response.status_code==201
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_003a.txt').read_bytes()
    response=client.post('/api/v1/documents',headers=clinician,data={'patientId':'pat_003','visitId':'vis_003a','ifVersion':2},files={'file':('x.txt',raw,'text/plain')})
    assert response.status_code==202,response.text
    discrepancies=client.get('/api/v1/patients/pat_003/discrepancies',headers=clinician).json()['items']
    assert not any(d['type']=='MISSING' for d in discrepancies)

def test_patient_handover_end_to_end(setup,login):
    client,_=setup; north=login('dr.north'); riverside=login('dr.riverside')
    base='/api/v1'
    def success(response,status=200):
        assert response.status_code==status,response.text
        return response.json()
    p=success(client.post(base+'/patients',headers=north,json={
        'displayName':'Taylor Synthetic','dateOfBirth':'1990-01-01'}),201)
    patient_path=base+'/patients/'+p['id']
    success(client.post(base+'/auth/signup',json={
        'username':'taylor.synthetic','displayName':'Taylor Synthetic','dateOfBirth':'1990-01-01','password':PASSWORD}),201)
    patient=login('taylor.synthetic')
    invitation=success(client.post(patient_path+'/link-request',headers=north,json={'username':'taylor.synthetic'}),201)
    discovered=success(client.get(base+'/link-requests',headers=patient))['items']
    assert discovered[0]['id']==invitation['id']
    success(client.post(base+'/link-requests/'+invitation['id']+'/decision',headers=patient,json={'decision':'CONFIRM','ifVersion':invitation['version']}))
    p=success(client.get(patient_path,headers=north))
    visit=success(client.post(patient_path+'/visits',headers=north,json={'visitDate':'2026-11-05','ifVersion':p['version']}),201)
    raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_003a.txt').read_bytes()
    p=success(client.get(patient_path,headers=north))
    success(client.post(base+'/documents',headers=north,data={
        'patientId':p['id'],'visitId':visit['id'],'ifVersion':p['version']},files={'file':('source.txt',raw,'text/plain')}),202)
    original=success(client.get(patient_path+'/medications',headers=north))['items'][0]
    original=success(client.patch(base+'/medications/'+original['id']+'/verification',headers=north,json={
        'verificationStatus':'VERIFIED','ifVersion':original['version']}))
    assert success(client.get(patient_path+'/medications/patient-view',headers=patient))['items'][0]['instructionText']==original['instructionText']
    p=success(client.get(patient_path,headers=north))
    success(client.post(base+'/documents',headers=north,data={
        'patientId':p['id'],'visitId':visit['id'],'ifVersion':p['version'],
        'supersedesId':original['id'],'supersedesIfVersion':original['version']},files={'file':('replacement.txt',raw.replace(b'strength: 5 MG',b'strength: 10 MG'),'text/plain')}),202)
    medications=success(client.get(patient_path+'/medications',headers=north))['items']
    replacement=next(m for m in medications if m['supersedesId']==original['id'])
    assert next(m for m in medications if m['id']==original['id'])==original
    assert replacement['verificationStatus']=='UNVERIFIED'
    assert success(client.get(patient_path+'/discrepancies',headers=north))['items']==[]
    success(client.patch(base+'/medications/'+replacement['id']+'/verification',headers=north,json={
        'verificationStatus':'VERIFIED','ifVersion':replacement['version']}))
    view=success(client.get(patient_path+'/medications/patient-view',headers=patient))
    assert len(view['items'])==1 and view['items'][0]['strength']['value']==10
    p=success(client.get(patient_path,headers=patient))
    migration=success(client.post(patient_path+'/migrations',headers=patient,json={
        'destinationOrgId':'org_riverside','ifVersion':p['version']}),201)
    success(client.post(base+'/migrations/'+migration['id']+'/decision',headers=patient,json={
        'decision':'APPROVE_FULL','ifVersion':migration['version']}))
    assert client.get(patient_path,headers=north).status_code==404
    assert success(client.get(patient_path,headers=riverside))['id']==p['id']
    grants=success(client.get(patient_path+'/access-grants',headers=patient))['items']
    destination=next(g for g in grants if g['orgId']=='org_riverside')
    success(client.post(patient_path+'/access-grants/org_riverside',headers=patient,json={'level':'NONE','ifVersion':destination['version']}))
    assert client.get(patient_path,headers=riverside).status_code==404
    assert success(client.get(patient_path+'/medications/patient-view',headers=patient))['items'][0]['strength']['value']==10
