from datetime import datetime, timezone, timedelta
import hashlib
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Depends, Request
from fastapi.security import HTTPBearer
from sqlalchemy import select
from .db import *

passwords = PasswordHasher()
NOTICE = 'If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine.'

def now():
    return datetime.now(timezone.utc)

def stamp():
    return now().isoformat().replace('+00:00', 'Z')

def uid(prefix):
    return prefix + '_' + secrets.token_hex(12)

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()

class ApiError(Exception):
    def __init__(self, code, status=400, message=None, details=None):
        self.status = status
        self.body = {'error': {'code': code, 'message': message or code.replace('_', ' ').capitalize() + '.', 'details': details or []}}

def fail(code, status=400, message=None):
    raise ApiError(code, status, message)

def db_session(request: Request):
    # The route owns the transaction and commits before returning its response.
    return request.state.db

def get(db, cls, identifier):
    row = db.scalar(select(cls).where(cls.id == identifier).with_for_update())
    if row is None:
        fail('NOT_FOUND', 404)
    return row

def public(row):
    return {'id': row.id, 'version': row.version, **row.data}

USER_FIELDS = ('username','displayName','role','status','orgId','patientId','mustChangePassword')
def user_view(user):
    return {'id': user.id, 'version': user.version, **{k: user.data.get(k) for k in USER_FIELDS}}

def update(row, data):
    row.data = {**row.data, **data}
    row.version += 1

def check_version(row, version):
    if row.version != version:
        fail('VERSION_CONFLICT', 409)

def role(user, *roles):
    if user.data['role'] not in roles:
        fail('FORBIDDEN', 403)

bearer = HTTPBearer(auto_error=False)

def current_user(request: Request, db=Depends(db_session, scope='function'), credentials=Depends(bearer)):
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        fail('UNAUTHENTICATED', 401)
    session = db.get(Session, digest(auth[7:]))
    if not session or session.data['revoked'] or session.data['expiresAt'] <= stamp():
        fail('UNAUTHENTICATED', 401)
    user = get(db, User, session.user_id)
    if user.data['status'] != 'ACTIVE':
        fail('ACCOUNT_DISABLED', 403)
    if user.org_id and get(db, Organisation, user.org_id).data['status'] != 'ACTIVE':
        fail('ACCOUNT_DISABLED', 403)
    if user.data['mustChangePassword'] and request.url.path not in ['/api/v1/auth/change-password','/api/v1/auth/me','/api/v1/auth/logout']:
        fail('FORBIDDEN', 403, 'Change your password before continuing.')
    request.state.session = session
    return user

def patient_access(db, user, patient_id, write=False, allow_patient=True, metadata=False):
    p = get(db, Patient, patient_id)
    r = user.data['role']
    if r == 'PATIENT':
        if user.data.get('patientId') != p.id:
            fail('NOT_FOUND', 404)
        if not allow_patient or write:
            fail('FORBIDDEN', 403)
    elif r == 'CLINICIAN':
        grant = db.scalar(select(Grant).where(Grant.patient_id == p.id, Grant.org_id == user.org_id))
        if not grant or grant.data['level'] == 'NONE':
            fail('NOT_FOUND', 404)
        if write and grant.data['level'] != 'FULL':
            fail('FORBIDDEN', 403)
    elif r == 'ADMIN' and metadata:
        if p.org_id != user.org_id:
            fail('NOT_FOUND', 404)
    else:
        fail('FORBIDDEN', 403)
    return p

def audit(db, user, action, target, patient_id=None, org_id=None, before=None, after=None, note=None):
    allowed = action.startswith(('USER_', 'ORGANISATION_', 'PATIENT_LOGIN_', 'LINK_', 'MIGRATION_'))
    row = Audit(id=uid('aud'), org_id=org_id if org_id is not None else user.org_id, patient_id=patient_id,
        data=dict(actorId=user.id, actorRole=user.data['role'], action=action, targetId=target,
                  occurredAt=stamp(), before=before if allowed else None, after=after if allowed else None,
                  note=note if allowed else None))
    db.add(row)
    db.flush()

def access(db, user, resource, resource_id=None, patient_id=None):
    db.add(Access(id=uid('acc'), org_id=user.org_id, patient_id=patient_id,
        data=dict(actorId=user.id, actorRole=user.data['role'], resource=resource,
                  resourceId=resource_id, occurredAt=stamp())))
    db.flush()

def revoke(db, user_id):
    for s in db.scalars(select(Session).where(Session.user_id == user_id)):
        update(s, {'revoked': True})

def create_user(db, body, r, org_id=None, patient_id=None, force=True, identifier=None):
    if db.scalar(select(User).where(User.username == body.username)):
        fail('VALIDATION_FAILED', 422, 'Username is unavailable.')
    u = User(id=identifier or uid('usr'), username=body.username, org_id=org_id,
        data=dict(username=body.username, displayName=body.displayName, role=r, status='ACTIVE',
                  orgId=org_id, patientId=patient_id, mustChangePassword=force,
                  passwordHash=passwords.hash(body.password), lockedUntil=None))
    db.add(u)
    db.flush()
    return u

def verify_password(hash_value, password):
    try:
        return passwords.verify(hash_value, password)
    except (VerificationError, InvalidHashError):
        return False

def set_grant(db, patient_id, org_id, level):
    grant = db.scalar(select(Grant).where(Grant.patient_id == patient_id, Grant.org_id == org_id).with_for_update())
    if grant:
        update(grant, {'level': level})
    else:
        grant = Grant(id=uid('acc'), patient_id=patient_id, org_id=org_id, data={'level': level})
        db.add(grant)
        db.flush()
    return grant

def page(request, rows):
    try:
        limit = int(request.query_params.get('limit', 50))
        if not 1 <= limit <= 200:
            raise ValueError()
    except ValueError:
        fail('VALIDATION_FAILED', 422, 'limit must be between 1 and 200.')
    rows = sorted(rows, key=lambda row: row['id'])
    cursor = request.query_params.get('cursor')
    if cursor:
        rows = [row for row in rows if row['id'] > cursor]
    return {'items': rows[:limit], 'nextCursor': rows[limit-1]['id'] if len(rows) > limit else None}
