"""Run from backend/: python -m scripts.seed --dev-password (prompted, never logged)."""
import argparse
import getpass
import json
import os
from pathlib import Path
from app.core import *
from app.schemas import Account
from app.domain import extract
from app.main import detect_and_store

ROOT=Path(__file__).resolve().parents[2]

def seed(db, dev_password=None):
    if os.getenv('ENVIRONMENT','development').lower()=='production':
        raise RuntimeError('Seed is forbidden in production.')
    if not dev_password:
        raise RuntimeError('An explicit development-only fixture password is required.')
    if not 12 <= len(dev_password) <= 256:
        raise RuntimeError('Development password must be 12 to 256 characters.')
    data=json.loads((ROOT/'fixtures/data.json').read_text())
    for item in data['organisations']:
        if not db.get(Organisation,item['id']):
            db.add(Organisation(id=item['id'],data={'name':item['name'],'status':'ACTIVE'}))
    db.flush()
    for item in data['patients']:
        if not db.get(Patient,item['id']):
            db.add(Patient(id=item['id'],org_id=item['orgId'],data={k:v for k,v in item.items() if k not in ('id','orgId')}))
    db.flush()
    for item in data['users']:
        if not db.get(User,item['id']):
            create_user(db,Account(username=item['username'],displayName=item['displayName'],password=dev_password),item['role'],item['orgId'],item['patientId'],False,item['id'])
    username,password=os.getenv('SUPER_ADMIN_USERNAME'),os.getenv('SUPER_ADMIN_PASSWORD')
    if bool(username)!=bool(password):
        raise RuntimeError('Provide both SUPER_ADMIN seed credentials or neither.')
    if username and not db.scalar(select(User).where(User.username==username)):
        create_user(db,Account(username=username,displayName='Platform owner (synthetic)',password=password),'SUPER_ADMIN',force=True)
    for item in data['patients']:
        if not db.scalar(select(Grant).where(Grant.patient_id==item['id'],Grant.org_id==item['orgId'])):
            set_grant(db,item['id'],item['orgId'],'FULL')
    if not db.scalar(select(Grant).where(Grant.patient_id=='pat_001',Grant.org_id=='org_riverside')):
        set_grant(db,'pat_001','org_riverside','VIEW_ONLY')
    p=db.get(Patient,'pat_001')
    if not p.data.get('linkedUserId'):
        p.data={**p.data,'linkedUserId':'usr_alex'}
    for item in data['visits']:
        if not db.get(Visit,item['id']):
            db.add(Visit(id=item['id'],patient_id=item['patientId'],org_id=item['orgId'],data={'visitDate':item['visitDate']}))
    db.flush()
    for item in data['documents']:
        raw=(ROOT/f"fixtures/documents/{item['id']}.txt").read_text(encoding='utf-8')
        fields=extract(raw,item['id'])
        if not db.get(Document,item['id']):
            db.add(Document(id=item['id'],patient_id=item['patientId'],org_id=item['orgId'],
                data={'visitId':item['visitId'],'rawText':raw,'createdAt':'2026-01-01T00:00:00Z','extractedFields':fields}))
        for i,m in enumerate(fields):
            identifier=f"med_{item['id'][4:]}_{i}"
            if not db.get(Medication,identifier):
                date=next(v['visitDate'] for v in data['visits'] if v['id']==item['visitId'])+'T00:00:00Z'
                db.add(Medication(id=identifier,patient_id=item['patientId'],org_id=item['orgId'],data={**m,
                    'visitId':item['visitId'],'sourceDocumentId':item['id'],'supersedesId':None,
                    'verificationStatus':'UNVERIFIED','createdAt':date,'verifiedAt':None}))
    db.flush()
    actor=db.get(User,'usr_dr_north')
    for p in db.scalars(select(Patient)):
        detect_and_store(db,p,actor)
    if not db.get(Migration,'mig_001'):
        db.add(Migration(id='mig_001',patient_id='pat_001',org_id='org_north',status='PENDING_PATIENT_APPROVAL',
            data={'sourceOrgId':'org_north','destinationOrgId':'org_riverside','reason':'Synthetic handover','createdAt':'2026-03-01T00:00:00Z'}))
    db.flush()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--dev-password',action='store_true',help='Prompt for the development fixture password.')
    args=parser.parse_args()
    if os.getenv('ENVIRONMENT','development').lower()=='production':
        parser.error('Seed is forbidden in production.')
    if not args.dev_password:
        parser.error('--dev-password is required for fixture accounts.')
    password=getpass.getpass('Development fixture password (12+ characters): ')
    with factory(make_engine())() as db:
        with db.begin():
            seed(db,password)
    print('Synthetic fixtures seeded successfully.')

if __name__=='__main__':
    main()
