"""Add the synthetic Meadowbrook organisation without altering existing records."""
import json
import os
import secrets
from pathlib import Path
from dotenv import dotenv_values
from sqlalchemy import select
from app.core import create_user, set_grant, audit
from app.db import make_engine, factory, Organisation, User, Patient, Grant, Visit, Document, Medication
from app.schemas import Account
from app.domain import extract

ROOT = Path(__file__).resolve().parents[2]


def seed_meadowbrook(db, password):
    if os.getenv('ENVIRONMENT', 'development').lower() == 'production':
        raise RuntimeError('Demo seed is forbidden in production.')
    data = json.loads((ROOT / 'fixtures/meadowbrook.json').read_text(encoding='utf-8'))
    org = data['organisations'][0]
    if not db.get(Organisation, org['id']):
        db.add(Organisation(id=org['id'], data=dict(name=org['name'], status='ACTIVE')))
    db.flush()
    for p in data['patients']:
        if not db.get(Patient, p['id']):
            db.add(Patient(id=p['id'], org_id=p['orgId'], data={k:v for k,v in p.items() if k not in ('id','orgId')}))
    db.flush()
    for u in data['users']:
        if not db.get(User, u['id']):
            create_user(db, Account(username=u['username'], displayName=u['displayName'], password=password),
                        u['role'], u['orgId'], u['patientId'], force=False, identifier=u['id'])
    actor = db.get(User, 'usr_meadow_maya')
    for p in data['patients']:
        if not db.scalar(select(Grant).where(Grant.patient_id == p['id'], Grant.org_id == org['id'])):
            set_grant(db, p['id'], org['id'], 'FULL')
            audit(db, actor, 'PATIENT_CREATED', p['id'], p['id'])
    for v in data['visits']:
        if not db.get(Visit, v['id']):
            db.add(Visit(id=v['id'], patient_id=v['patientId'], org_id=v['orgId'], data={'visitDate':v['visitDate']}))
    db.flush()
    for d in data['documents']:
        raw = (ROOT / 'fixtures/documents' / (d['id'] + '.txt')).read_text(encoding='utf-8')
        fields = extract(raw, d['id'])
        date = next(v['visitDate'] for v in data['visits'] if v['id'] == d['visitId']) + 'T00:00:00Z'
        if not db.get(Document, d['id']):
            db.add(Document(id=d['id'], patient_id=d['patientId'], org_id=d['orgId'], data=dict(
                visitId=d['visitId'], rawText=raw, createdAt=date, extractedFields=fields)))
        for i, medicine in enumerate(fields):
            identifier = f"med_{d['id'][4:]}_{i}"
            if not db.get(Medication, identifier):
                db.add(Medication(id=identifier, patient_id=d['patientId'], org_id=d['orgId'], data={
                    **medicine, 'visitId':d['visitId'], 'sourceDocumentId':d['id'], 'supersedesId':None,
                    'verificationStatus':'UNVERIFIED', 'createdAt':date, 'verifiedAt':None}))
    db.flush()


def main():
    if os.getenv('ENVIRONMENT', 'development').lower() == 'production':
        raise RuntimeError('Demo seed is forbidden in production.')
    target = ROOT / 'backend/.env.development-logins'
    values = dotenv_values(target) if target.exists() else {}
    password = values.get('MEADOW_PASSWORD') or secrets.token_urlsafe(18)
    if not values.get('MEADOW_PASSWORD'):
        with target.open('a', encoding='utf-8') as file:
            file.write('\nMEADOW_PASSWORD=' + password + '\n')
    with factory(make_engine()).begin() as db:
        seed_meadowbrook(db, password)
    data = json.loads((ROOT / 'fixtures/meadowbrook.json').read_text())
    lines = ['# Meadowbrook Demo Clinic — synthetic logins', '',
             'Persistent development app: http://127.0.0.1:5177', '',
             'Shared password for the ten NEW Meadowbrook demo accounts: `' + password + '`', '',
             'Mock / isolated demo password: `Clyra-demo-2026`.', '',
             'These demo accounts are ready to sign in without a forced password change. Existing superadmin credentials and its first-login rule were preserved.', '',
             '| Role | Username | Demo patient responsibility |', '| --- | --- | --- |']
    for u in data['users']:
        assigned = [p['displayName'] for a in data['assignments'] if a['clinicianUsername'] == u['username'] for p in data['patients'] if p['id'] == a['patientId']]
        lines.append(f"| {u['role']} | {u['username']} | {', '.join(assigned) or '—'} |")
    lines += ['', 'Responsibility is a demo pairing. Access is organisation-wide, so each clinician can see all six clinic patients. Each patient login can see only their own patient view. Clinical entries remain unverified synthetic examples.']
    (ROOT / 'output').mkdir(exist_ok=True)
    (ROOT / 'output/meadowbrook-logins.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('Meadowbrook seeded: 1 admin, 3 clinicians, 6 linked patients, 12 visits, 12 source documents, 24 unverified medication entries. Private credentials: output/meadowbrook-logins.md')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Meadowbrook seed failed:', type(exc).__name__, '(details withheld)')
        raise SystemExit(1)
