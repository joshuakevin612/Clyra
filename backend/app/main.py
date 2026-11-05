from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
import os
import secrets
from fastapi import FastAPI, APIRouter, Depends, Request, UploadFile, File, Form
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException
from sqlalchemy.exc import IntegrityError
from .core import *
from .schemas import *
from .responses import *
from .domain import extract, detect_discrepancies

def create_app(engine=None):
    @asynccontextmanager
    async def lifespan(app):
        if not hasattr(app.state, 'sessions'):
            app.state.sessions = factory(make_engine())
        yield

    app = FastAPI(title='Medication Continuity API', version='1.3.1', lifespan=lifespan)
    origins=[value.strip() for value in os.getenv('CORS_ORIGINS','').split(',') if value.strip()]
    if origins:
        if '*' in origins:
            raise RuntimeError('CORS_ORIGINS must list explicit frontend origins.')
        app.add_middleware(CORSMiddleware,allow_origins=origins,
                           allow_methods=['GET','POST','PATCH'],allow_headers=['Authorization','Content-Type'])
    if engine is not None:
        app.state.sessions = factory(engine)
    @app.exception_handler(ApiError)
    async def api_error(request, exc):
        return JSONResponse(exc.body, status_code=exc.status)
    @app.exception_handler(RequestValidationError)
    async def validation(request, exc):
        # Never echo Pydantic input: it may contain a password or clinical text.
        details = [{'field': '.'.join(map(str, e['loc'][1:])), 'issue': e['msg']} for e in exc.errors()]
        return JSONResponse({'error': {'code': 'VALIDATION_FAILED', 'message': 'One or more fields are invalid.', 'details': details}}, status_code=422)
    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(ApiError('NOT_FOUND' if exc.status_code == 404 else 'VALIDATION_FAILED', exc.status_code).body, status_code=exc.status_code)
    @app.exception_handler(Exception)
    async def internal(request, exc):
        return JSONResponse(ApiError('INTERNAL_ERROR', 500).body, status_code=500)
    app.include_router(router, prefix='/api/v1')
    return app

class TransactionRoute(APIRoute):
    def get_route_handler(self):
        handler=super().get_route_handler()
        async def transactional(request):
            with request.app.state.sessions() as db:
                request.state.db=db
                try:
                    response=await handler(request)
                    db.commit()
                    return response
                except Exception:
                    db.rollback()
                    raise
        return transactional

router = APIRouter(route_class=TransactionRoute, responses={status: {'model': ErrorOutput} for status in (400,401,403,404,409,422,429,500)})

@router.post('/auth/login', response_model=LoginOutput, response_model_exclude_unset=True)
def login(body: LoginBody, db=Depends(db_session, scope='function')):
    u = db.scalar(select(User).where(User.username == body.username).with_for_update())
    if not u:
        # Constant expensive hash check also for unknown usernames.
        verify_password(DUMMY_HASH, body.password)
        fail('INVALID_CREDENTIALS', 401)
    if u.data['status'] != 'ACTIVE' or (u.org_id and get(db, Organisation, u.org_id).data['status'] != 'ACTIVE'):
        fail('ACCOUNT_DISABLED', 403)
    if u.data.get('lockedUntil') and u.data['lockedUntil'] > stamp():
        fail('RATE_LIMITED', 429)
    if not verify_password(u.data['passwordHash'], body.password):
        recent = (now() - timedelta(minutes=15)).isoformat().replace('+00:00','Z')
        db.add(Attempt(id=uid('attempt'), key=u.id, data={'occurredAt': stamp()}))
        db.flush()
        count = sum(a.data['occurredAt'] > recent for a in db.scalars(select(Attempt).where(Attempt.key == u.id)))
        if count >= 5:
            update(u, {'lockedUntil': (now() + timedelta(minutes=15)).isoformat().replace('+00:00','Z')})
        db.commit()  # Failed logins must survive the error response rollback.
        fail('RATE_LIMITED' if count >= 5 else 'INVALID_CREDENTIALS', 429 if count >= 5 else 401)
    token = secrets.token_hex(32)
    expires = (now() + timedelta(hours=8)).isoformat().replace('+00:00','Z')
    db.add(Session(id=digest(token), user_id=u.id, data={'expiresAt': expires, 'revoked': False}))
    return {'accessToken': token, 'tokenType': 'Bearer', 'expiresAt': expires, 'user': user_view(u)}

DUMMY_HASH = passwords.hash(secrets.token_hex(32))

@router.post('/auth/logout', response_model=LogoutOutput, response_model_exclude_unset=True)
def logout(request: Request, u=Depends(current_user)):
    update(request.state.session, {'revoked': True})
    return {'revoked': True}

@router.get('/auth/me', response_model=UserOutput, response_model_exclude_unset=True)
def me(u=Depends(current_user)):
    return user_view(u)

@router.post('/auth/change-password', response_model=UserOutput, response_model_exclude_unset=True)
def change_password(body: PasswordBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    check_version(u, body.ifVersion)
    if not verify_password(u.data['passwordHash'], body.currentPassword):
        fail('INVALID_CREDENTIALS', 401)
    update(u, {'passwordHash': passwords.hash(body.newPassword), 'mustChangePassword': False})
    revoke(db, u.id)
    audit(db, u, 'USER_PASSWORD_RESET', u.id)
    return user_view(u)

@router.post('/auth/signup', status_code=201, response_model=UserOutput, response_model_exclude_unset=True)
def signup(body: Signup, request: Request, db=Depends(db_session, scope='function')):
    key = 'signup:' + digest(request.client.host if request.client else 'unknown')
    # PostgreSQL advisory lock serializes signup rate-limit checks by client.
    if db.bind.dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': int(digest(key)[:15], 16)})
    recent = (now() - timedelta(minutes=15)).isoformat().replace('+00:00','Z')
    if sum(a.data['occurredAt'] > recent for a in db.scalars(select(Attempt).where(Attempt.key == key))) >= 5:
        fail('RATE_LIMITED', 429)
    db.add(Attempt(id=uid('attempt'), key=key, data={'occurredAt': stamp()}))
    db.commit()  # Count failed/duplicate signups as well.
    u = create_user(db, body, 'PATIENT', force=False)
    audit(db, u, 'USER_CREATED', u.id, after=user_view(u))
    return user_view(u)

def organisation_view(o):
    return {'id':o.id,'version':o.version,'name':o.data['name'],'status':o.data['status']}

@router.get('/superadmin/organisations', response_model=Page[OrganisationOutput], response_model_exclude_unset=True)
def organisations(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'SUPER_ADMIN')
    return page(request, [organisation_view(o) for o in db.scalars(select(Organisation))])

@router.post('/superadmin/organisations', status_code=201, response_model=OrganisationCreated, response_model_exclude_unset=True)
def create_org(body: OrgBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'SUPER_ADMIN')
    o = Organisation(id=uid('org'), data={'name': body.name, 'status': 'ACTIVE'})
    db.add(o); db.flush()
    admin = create_user(db, Account(username=body.adminUsername, displayName=body.adminDisplayName, password=body.adminPassword), 'ADMIN', o.id)
    audit(db, u, 'ORGANISATION_CREATED', o.id, org_id=o.id, after=organisation_view(o))
    audit(db, u, 'USER_CREATED', admin.id, org_id=o.id, after=user_view(admin))
    return {**organisation_view(o), 'admin': user_view(admin)}

@router.patch('/superadmin/organisations/{orgId}', response_model=OrganisationOutput, response_model_exclude_unset=True)
def patch_org(orgId: str, body: OrgPatch, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'SUPER_ADMIN')
    o = get(db, Organisation, orgId); check_version(o, body.ifVersion)
    before = organisation_view(o); update(o, {'status': body.status})
    if body.status == 'SUSPENDED':
        for member in db.scalars(select(User).where(User.org_id == o.id)):
            revoke(db, member.id)
    audit(db, u, 'ORGANISATION_STATUS_CHANGED', o.id, org_id=o.id, before=before, after=organisation_view(o))
    return organisation_view(o)

@router.post('/superadmin/organisations/{orgId}/admins', status_code=201, response_model=UserOutput, response_model_exclude_unset=True)
def add_admin(orgId: str, body: Account, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'SUPER_ADMIN'); get(db, Organisation, orgId)
    member = create_user(db, body, 'ADMIN', orgId)
    audit(db, u, 'USER_CREATED', member.id, org_id=orgId, after=user_view(member))
    return user_view(member)

@router.get('/admin/users', response_model=Page[UserOutput], response_model_exclude_unset=True)
def users(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'ADMIN')
    return page(request, [user_view(x) for x in db.scalars(select(User).where(User.org_id == u.org_id)) if x.data['role'] == 'CLINICIAN'])

@router.post('/admin/users', status_code=201, response_model=UserOutput, response_model_exclude_unset=True)
def add_clinician(body: Account, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'ADMIN'); member = create_user(db, body, 'CLINICIAN', u.org_id)
    audit(db, u, 'USER_CREATED', member.id, after=user_view(member))
    return user_view(member)

def account_patch(db, actor, member, body, patient=None):
    check_version(member, body.ifVersion)
    if body.status is None and body.password is None:
        fail('VALIDATION_FAILED', 422)
    before = user_view(member)
    prefix = 'PATIENT_LOGIN_' if patient else 'USER_'
    if body.status == 'DISABLED' and member.data['role'] == 'ADMIN' and member.data['status']=='ACTIVE':
        admins = [x for x in db.scalars(select(User).where(User.org_id == member.org_id).with_for_update()) if x.data['role'] == 'ADMIN' and x.data['status'] == 'ACTIVE']
        if len(admins) <= 1:
            fail('LAST_ADMIN_PROTECTED', 409)
    if patient and body.status == 'ACTIVE' and member.org_id != actor.org_id:
        fail('FORBIDDEN', 403)
    changes = {}
    if body.status:
        changes['status'] = body.status
    if body.password:
        changes.update(passwordHash=passwords.hash(body.password), mustChangePassword=True)
    update(member, changes)
    if body.status == 'DISABLED' or body.password:
        revoke(db, member.id)
    for action in ([prefix + ('DISABLED' if body.status == 'DISABLED' else 'ENABLED')] if body.status else []) + ([prefix + 'PASSWORD_RESET'] if body.password else []):
        audit(db, actor, action, member.id, patient_id=patient.id if patient else None, org_id=member.org_id, before=before, after=user_view(member))
    return user_view(member)

@router.get('/superadmin/organisations/{orgId}/admins', response_model=Page[UserOutput])
def list_admins(orgId: str, request: Request, u=Depends(current_user), db=Depends(db_session)):
    role(u,'SUPER_ADMIN'); get(db,Organisation,orgId)
    return page(request,[user_view(x) for x in db.scalars(select(User).where(User.org_id==orgId)) if x.data['role']=='ADMIN'])

@router.patch('/superadmin/organisations/{orgId}/admins/{userId}', response_model=UserOutput)
def patch_admin(orgId: str, userId: str, body: AccountPatch, u=Depends(current_user), db=Depends(db_session)):
    role(u,'SUPER_ADMIN')
    get(db,Organisation,orgId)  # Serialize last-admin checks per organisation.
    member=get(db,User,userId)
    if member.org_id!=orgId or member.data['role']!='ADMIN':
        fail('NOT_FOUND',404)
    return account_patch(db,u,member,body)

@router.get('/organisations', response_model=Page[OrganisationOutput])
def organisation_directory(request: Request, u=Depends(current_user), db=Depends(db_session)):
    role(u,'PATIENT','CLINICIAN')
    return page(request,[organisation_view(o) for o in db.scalars(select(Organisation)) if o.data['status']=='ACTIVE'])

@router.patch('/admin/users/{userId}', response_model=UserOutput, response_model_exclude_unset=True)
def patch_user(userId: str, body: AccountPatch, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u, 'ADMIN'); member = get(db, User, userId)
    if member.org_id != u.org_id or member.data['role'] != 'CLINICIAN':
        fail('NOT_FOUND', 404)
    return account_patch(db, u, member, body)

def event_view(row, audit_event=False):
    fields = ('actorId','actorRole','action','targetId','occurredAt','before','after','note') if audit_event else ('actorId','actorRole','resource','resourceId','occurredAt')
    result = {'id': row.id, 'orgId': row.org_id, 'patientId': row.patient_id, **{k: row.data.get(k) for k in fields}}
    if audit_event:
        action = result['action'] or ''
        if not action.startswith(('USER_','ORGANISATION_','PATIENT_LOGIN_','LINK_','MIGRATION_')):
            result.update(before=None, after=None, note=None)
        else:
            # Defense in depth: no arbitrary nested dictionaries in metadata responses.
            safe = {'id','version','username','displayName','role','status','orgId','patientId','mustChangePassword','name','sourceOrgId','destinationOrgId','decision'}
            for key in ('before','after'):
                if isinstance(result[key], dict):
                    result[key] = {k:v for k,v in result[key].items() if k in safe and (v is None or isinstance(v,(str,int,bool)))}
                else:
                    result[key] = None
            result['note'] = None
    return result

def logs(request, db, u, cls, patient_id=None):
    query = select(cls)
    if u.data['role'] != 'SUPER_ADMIN':
        if u.data['role'] == 'PATIENT':
            query = query.where(cls.patient_id == patient_id)
        else:
            query = query.where(cls.org_id == u.org_id)
    if patient_id:
        query = query.where(cls.patient_id == patient_id)
    rows = []
    for row in db.scalars(query):
        data = event_view(row, cls == Audit)
        params = request.query_params
        if any(params.get(k) and (data.get(k) if k != 'action' else data.get('action', data.get('resource'))) != params[k] for k in ('orgId','actorId','action')):
            continue
        if params.get('from') and data['occurredAt'] < params['from']:
            continue
        if params.get('to') and data['occurredAt'] > params['to']:
            continue
        rows.append(data)
    access(db, u, 'AUDIT' if cls == Audit else 'ACCESS_LOG', patient_id, patient_id)
    return page(request, rows)

@router.get('/superadmin/audit', response_model=Page[AuditOutput], response_model_exclude_unset=True)
def platform_audit(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'SUPER_ADMIN'); return logs(request, db, u, Audit)

@router.get('/superadmin/access-log', response_model=Page[AccessOutput], response_model_exclude_unset=True)
def platform_access(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'SUPER_ADMIN'); return logs(request, db, u, Access)

@router.get('/admin/audit', response_model=Page[AuditOutput], response_model_exclude_unset=True)
def org_audit(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'ADMIN'); return logs(request, db, u, Audit)

@router.get('/admin/access-log', response_model=Page[AccessOutput], response_model_exclude_unset=True)
def org_access(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'ADMIN'); return logs(request, db, u, Access)

def patient_view(db, p, u):
    result = {**public(p), 'orgId': p.org_id}
    if u.data['role'] == 'CLINICIAN':
        result['accessLevel'] = db.scalar(select(Grant).where(Grant.patient_id == p.id, Grant.org_id == u.org_id)).data['level']
    return result

@router.get('/patients', response_model=Page[PatientOutput], response_model_exclude_unset=True)
def patients(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'CLINICIAN','PATIENT')
    if u.data['role'] == 'PATIENT':
        rows = [db.get(Patient, u.data.get('patientId'))] if u.data.get('patientId') else []
    else:
        rows = list(db.scalars(select(Patient).join(Grant, Grant.patient_id == Patient.id).where(Grant.org_id == u.org_id)))
        rows = [p for p in rows if db.scalar(select(Grant).where(Grant.patient_id == p.id, Grant.org_id == u.org_id)).data['level'] != 'NONE']
    access(db, u, 'PATIENT', patient_id=u.data.get('patientId'))
    return page(request, [patient_view(db,p,u) for p in rows if p])

@router.post('/patients', status_code=201, response_model=PatientOutput, response_model_exclude_unset=True)
def add_patient(body: PatientBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'CLINICIAN')
    p = Patient(id=uid('pat'), org_id=u.org_id, data=body.model_dump(mode='json'))
    db.add(p); db.flush(); set_grant(db,p.id,u.org_id,'FULL')
    audit(db,u,'PATIENT_CREATED',p.id,p.id)
    return patient_view(db,p,u)

@router.get('/patients/{patientId}', response_model=PatientOutput, response_model_exclude_unset=True)
def read_patient(patientId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId)
    access(db,u,'PATIENT',p.id,p.id)
    return patient_view(db,p,u)

@router.patch('/patients/{patientId}', response_model=PatientOutput, response_model_exclude_unset=True)
def patch_patient(patientId: str, body: PatientPatch, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId,write=True); check_version(p,body.ifVersion)
    update(p,body.model_dump(mode='json',exclude={'ifVersion'}))
    audit(db,u,'PATIENT_UPDATED',p.id,p.id)
    return patient_view(db,p,u)

@router.post('/patients/{patientId}/login', status_code=201, response_model=UserOutput, response_model_exclude_unset=True)
def patient_login(patientId: str, body: Account, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId,write=True)
    if any(x.data.get('patientId') == p.id for x in db.scalars(select(User))):
        fail('VERSION_CONFLICT',409,'A login already exists.')
    member = create_user(db,body,'PATIENT',p.org_id,p.id)
    update(p, {'linkedUserId': member.id})
    audit(db,u,'PATIENT_LOGIN_CREATED',member.id,p.id,after=user_view(member))
    return user_view(member)

@router.get('/patients/{patientId}/login', response_model=UserOutput, response_model_exclude_unset=True)
def read_patient_login(patientId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId,write=True)
    member = next((x for x in db.scalars(select(User)) if x.data.get('patientId') == p.id), None)
    if not member:
        fail('NOT_FOUND',404)
    access(db,u,'PATIENT_LOGIN',member.id,p.id)
    return user_view(member)

@router.patch('/patients/{patientId}/login', response_model=UserOutput, response_model_exclude_unset=True)
def patch_login(patientId: str, body: AccountPatch, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId,write=True)
    member = next((x for x in db.scalars(select(User).with_for_update()) if x.data.get('patientId') == p.id), None)
    if not member:
        fail('NOT_FOUND',404)
    return account_patch(db,u,member,body,p)

@router.post('/patients/{patientId}/link-request', status_code=201, response_model=LinkOutput, response_model_exclude_unset=True)
def request_link(patientId: str, body: LinkBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p = patient_access(db,u,patientId,write=True)
    member = db.scalar(select(User).where(User.username == body.username).with_for_update())
    if not member or member.data['role'] != 'PATIENT' or member.data['status'] != 'ACTIVE' or member.data.get('patientId'):
        fail('NOT_FOUND',404)
    if p.data.get('linkedUserId'):
        fail('VERSION_CONFLICT',409)
    link = Link(id=uid('lnk'),patient_id=p.id,org_id=u.org_id,
        data={'userId':member.id,'status':'PENDING','displayName':p.data['displayName'],'dateOfBirth':p.data['dateOfBirth']})
    db.add(link); db.flush(); audit(db,u,'LINK_REQUESTED',link.id,p.id)
    return public(link)

@router.get('/link-requests', response_model=Page[LinkOutput], response_model_exclude_unset=True)
def pending_links(request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'PATIENT')
    access(db,u,'LINK_REQUEST',patient_id=u.data.get('patientId'))
    return page(request,[public(x) for x in db.scalars(select(Link)) if x.data['userId']==u.id])

@router.post('/link-requests/{linkId}/decision', response_model=LinkOutput, response_model_exclude_unset=True)
def decide_link(linkId: str, body: LinkDecision, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'PATIENT'); link=get(db,Link,linkId)
    if link.data['userId'] != u.id:
        fail('NOT_FOUND',404)
    check_version(link,body.ifVersion)
    if link.data['status'] != 'PENDING':
        fail('VERSION_CONFLICT',409)
    p=get(db,Patient,link.patient_id)
    if body.decision == 'CONFIRM':
        if p.data.get('linkedUserId') or u.data.get('patientId'):
            fail('VERSION_CONFLICT',409)
        update(p,{'linkedUserId':u.id}); update(u,{'patientId':p.id,'orgId':p.org_id}); u.org_id=p.org_id
    update(link,{'status':body.decision})
    audit(db,u,'LINK_CONFIRMED' if body.decision=='CONFIRM' else 'LINK_DECLINED',link.id,p.id,org_id=link.org_id)
    return public(link)

@router.get('/patients/{patientId}/visits', response_model=Page[VisitOutput], response_model_exclude_unset=True)
def visits(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId); access(db,u,'VISITS',p.id,p.id)
    return page(request,[{**public(v),'patientId':p.id,'orgId':v.org_id} for v in db.scalars(select(Visit).where(Visit.patient_id==p.id))])

@router.post('/patients/{patientId}/visits', status_code=201, response_model=VisitOutput)
def create_visit(patientId: str, body: VisitBody, u=Depends(current_user), db=Depends(db_session)):
    p=patient_access(db,u,patientId,write=True); check_version(p,body.ifVersion)
    visit=Visit(id=uid('vis'),patient_id=p.id,org_id=u.org_id,data={'visitDate':body.visitDate.isoformat()})
    db.add(visit); update(p,{})
    db.flush(); audit(db,u,'VISIT_CREATED',visit.id,p.id)
    return {**public(visit),'patientId':p.id,'orgId':u.org_id}

def medication_view(m):
    return {'id':m.id,'version':m.version,'patientId':m.patient_id,**{k:v for k,v in m.data.items() if k != 'fieldSources'}}

@router.get('/patients/{patientId}/medications', response_model=Page[MedicationOutput], response_model_exclude_unset=True)
def medications(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId,allow_patient=False); access(db,u,'MEDICATIONS',p.id,p.id)
    return page(request,[medication_view(m) for m in db.scalars(select(Medication).where(Medication.patient_id==p.id))])

@router.get('/patients/{patientId}/medications/patient-view', response_model=PatientMedications, response_model_exclude_unset=True)
def verified_view(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId); access(db,u,'PATIENT_VIEW',p.id,p.id)
    groups={}
    for m in db.scalars(select(Medication).where(Medication.patient_id==p.id)):
        if m.data['verificationStatus'] != 'REJECTED':
            groups.setdefault(m.data['medicineKey'],[]).append(m)
    rows=[]
    for key, entries in sorted(groups.items()):
        verified=[m for m in entries if m.data['verificationStatus']=='VERIFIED']
        m=max(verified or entries,key=lambda m:(m.data['createdAt'],m.id))
        v=get(db,Visit,m.data['visitId'])
        row={k:m.data.get(k) for k in ('medicineName','strength','form','startDate','prescriberName')}
        row.update(status='VERIFIED' if verified else 'AWAITING_REVIEW',instructionText=m.data['instructionText'] if verified else None,
                   verifiedAt=m.data.get('verifiedAt') if verified else None,sourceVisitDate=v.data['visitDate'])
        rows.append({'id':m.id,**row})
    result=page(request,rows)
    for row in result['items']:
        row.pop('id')
    return {**result,'notice':NOTICE}

@router.get('/patients/{patientId}/comparison', response_model=ComparisonOutput, response_model_exclude_unset=True)
def comparison(patientId: str, leftVisitId: str, rightVisitId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId,allow_patient=False)
    for identifier in (leftVisitId,rightVisitId):
        if get(db,Visit,identifier).patient_id != p.id:
            fail('NOT_FOUND',404)
    entries=list(db.scalars(select(Medication).where(Medication.patient_id==p.id)))
    access(db,u,'COMPARISON',p.id,p.id)
    return {'leftVisitId':leftVisitId,'rightVisitId':rightVisitId,
            'left':[medication_view(m) for m in entries if m.data['visitId']==leftVisitId],
            'right':[medication_view(m) for m in entries if m.data['visitId']==rightVisitId]}

@router.get('/patients/{patientId}/discrepancies', response_model=Page[DiscrepancyOutput], response_model_exclude_unset=True)
def discrepancies(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId,allow_patient=False)
    status=request.query_params.get('status')
    if status and status not in ('OPEN','RESOLVED'):
        fail('VALIDATION_FAILED',422)
    access(db,u,'DISCREPANCIES',p.id,p.id)
    return page(request,[{**public(d),'patientId':p.id} for d in db.scalars(select(Discrepancy).where(Discrepancy.patient_id==p.id)) if not status or d.data['status']==status])

@router.post('/discrepancies/{discrepancyId}/decisions', status_code=201, response_model=DecisionOutput, response_model_exclude_unset=True)
def review(discrepancyId: str, body: Review, u=Depends(current_user), db=Depends(db_session, scope='function')):
    d=get(db,Discrepancy,discrepancyId); patient_access(db,u,d.patient_id,write=True); check_version(d,body.ifVersion)
    if len(body.note.strip()) < 3:
        fail('VALIDATION_FAILED',422)
    decision=Decision(id=uid('disc'),patient_id=d.patient_id,org_id=u.org_id,
        data={'discrepancyId':d.id,'decision':body.decision,'note':body.note,'createdAt':stamp(),'actorId':u.id})
    db.add(decision); update(d,{'status':'RESOLVED' if body.decision in ('ACCEPT_LEFT','ACCEPT_RIGHT') else 'OPEN','hasDecision':True})
    db.flush(); audit(db,u,'DISCREPANCY_DECIDED',d.id,d.patient_id)
    return public(decision)

@router.patch('/medications/{medicationId}/verification', response_model=MedicationOutput, response_model_exclude_unset=True)
def verify(medicationId: str, body: Verification, u=Depends(current_user), db=Depends(db_session, scope='function')):
    m=get(db,Medication,medicationId); patient_access(db,u,m.patient_id,write=True); check_version(m,body.ifVersion)
    if body.verificationStatus=='VERIFIED':
        for d in db.scalars(select(Discrepancy).where(Discrepancy.patient_id==m.patient_id)):
            if d.data['medicineKey']==m.data['medicineKey'] and d.data['status']=='OPEN' and d.data['type'] in ('CONFLICT','MISSING') and not d.data.get('hasDecision'):
                fail('VERSION_CONFLICT',409,'Review the open discrepancy before verification.')
    update(m,{'verificationStatus':body.verificationStatus,'verifiedAt':stamp() if body.verificationStatus=='VERIFIED' else None})
    audit(db,u,'MEDICATION_'+body.verificationStatus,m.id,m.patient_id)
    return medication_view(m)

def detect_and_store(db, p, actor):
    visits=[{**public(v)} for v in db.scalars(select(Visit).where(Visit.patient_id==p.id))]
    entries=[medication_view(m) for m in db.scalars(select(Medication).where(Medication.patient_id==p.id))]
    completed={d.data['visitId'] for d in db.scalars(select(Document).where(Document.patient_id==p.id)) if 'extractedFields' in d.data}
    visits=[v for v in visits if v['id'] in completed]
    existing=[d.data for d in db.scalars(select(Discrepancy).where(Discrepancy.patient_id==p.id))]
    keys=('type','field','medicineKey','leftEntryId','rightEntryId','visitId')
    for item in detect_discrepancies(visits,entries):
        if any(all(x.get(k)==item.get(k) for k in keys) for x in existing):
            continue
        d=Discrepancy(id=uid('disc'),patient_id=p.id,org_id=p.org_id,
            data={**item,'summary':item['type'].capitalize()+' detected for '+item['medicineKey']+'.',
                  'status':'OPEN','detectedAt':stamp()})
        db.add(d); db.flush(); audit(db,actor,'DISCREPANCY_DETECTED',d.id,p.id)

@router.post('/documents', status_code=202, response_model=UploadOutput, response_model_exclude_unset=True)
async def upload(patientId: str=Form(...), visitId: str=Form(...), ifVersion: int=Form(...), file: UploadFile=File(...),
                 supersedesId: str | None=Form(None), supersedesIfVersion: int | None=Form(None),
                 u=Depends(current_user), db=Depends(db_session, scope='function')):
    p=patient_access(db,u,patientId,write=True); check_version(p,ifVersion)
    v=get(db,Visit,visitId)
    if v.patient_id != p.id:
        fail('NOT_FOUND',404)
    if bool(supersedesId) != (supersedesIfVersion is not None):
        fail('VALIDATION_FAILED',422,'Provide both supersedesId and supersedesIfVersion.')
    previous=None
    if supersedesId:
        previous=get(db,Medication,supersedesId)
        if previous.patient_id!=p.id:
            fail('NOT_FOUND',404)
        check_version(previous,supersedesIfVersion)
        if any(m.data.get('supersedesId')==previous.id for m in db.scalars(select(Medication).where(Medication.patient_id==p.id))):
            fail('VERSION_CONFLICT',409,'This entry already has a replacement.')
    payload=await file.read(2_000_001)
    if len(payload)>2_000_000:
        fail('VALIDATION_FAILED',422,'Document limit is 2 MB.')
    try:
        raw=payload.decode('utf-8')
    except UnicodeDecodeError:
        fail('VALIDATION_FAILED',422,'Upload a UTF-8 SYN-RX-V1 text document.')
    doc=Document(id=uid('doc'),patient_id=p.id,org_id=u.org_id,data={'visitId':v.id,'rawText':raw,'createdAt':stamp()})
    job=Job(id=uid('job'),patient_id=p.id,org_id=u.org_id,data={'documentId':doc.id,'status':'PENDING','reason':None})
    db.add_all([doc,job]); db.flush(); audit(db,u,'DOCUMENT_UPLOADED',doc.id,p.id)
    # Deterministic bounded extraction completes in the same transaction; 202 still supplies a pollable job.
    try:
        extracted=extract(raw,doc.id)
    except ValueError as exc:
        update(job,{'status':'FAILED','reason':str(exc)})
    else:
        if previous and (len(extracted)!=1 or extracted[0]['medicineKey']!=previous.data['medicineKey']):
            fail('VALIDATION_FAILED',422,'A replacement document must contain exactly one entry for the same medicine key.')
        for item in extracted:
            m=Medication(id=uid('med'),patient_id=p.id,org_id=u.org_id,data={**item,'visitId':v.id,
                'sourceDocumentId':doc.id,'supersedesId':previous.id if previous else None,'verificationStatus':'UNVERIFIED','createdAt':stamp(),'verifiedAt':None})
            db.add(m); db.flush(); audit(db,u,'MEDICATION_CREATED',m.id,p.id)
        update(doc,{'extractedFields':extracted}); update(job,{'status':'COMPLETED'})
        detect_and_store(db,p,u)
    update(p,{})
    return {'documentId':doc.id,'jobId':job.id,'status':job.data['status']}

@router.get('/documents/{documentId}', response_model=DocumentOutput, response_model_exclude_unset=True)
def document(documentId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    doc=get(db,Document,documentId); patient_access(db,u,doc.patient_id,allow_patient=False)
    access(db,u,'DOCUMENT',doc.id,doc.patient_id)
    return {'id':doc.id,'version':doc.version,'patientId':doc.patient_id,**{k:v for k,v in doc.data.items() if k!='extractedFields'}}

@router.get('/documents/{documentId}/extraction', response_model=ExtractionOutput, response_model_exclude_unset=True)
def extraction(documentId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    doc=get(db,Document,documentId); patient_access(db,u,doc.patient_id,allow_patient=False)
    access(db,u,'EXTRACTION',doc.id,doc.patient_id)
    if 'extractedFields' not in doc.data:
        jobs=[j for j in db.scalars(select(Job).where(Job.patient_id==doc.patient_id)) if j.data['documentId']==doc.id]
        if jobs and jobs[0].data['status']=='FAILED':
            return {'documentId':doc.id,'status':'FAILED','reason':jobs[0].data['reason'],'items':[],'nextCursor':None}
        db.commit()  # The attempted clinical read remains logged on a 409.
        fail('EXTRACTION_PENDING',409)
    return {'documentId':doc.id,'status':'COMPLETED','items':doc.data['extractedFields'],'nextCursor':None}

@router.get('/extraction-jobs/{jobId}', response_model=JobOutput, response_model_exclude_unset=True)
def job_status(jobId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    job=get(db,Job,jobId); patient_access(db,u,job.patient_id,allow_patient=False)
    return public(job)

@router.get('/patients/{patientId}/audit', response_model=Page[AuditOutput], response_model_exclude_unset=True)
def patient_audit(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'ADMIN'); patient_access(db,u,patientId,metadata=True)
    return logs(request,db,u,Audit,patientId)

@router.get('/patients/{patientId}/access-log', response_model=Page[AccessOutput], response_model_exclude_unset=True)
def patient_access_log(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'ADMIN','PATIENT'); patient_access(db,u,patientId,metadata=True)
    return logs(request,db,u,Access,patientId)

def migration_visible(db,u,m):
    r=u.data['role']
    if r=='PATIENT':
        if u.data.get('patientId')!=m.patient_id:
            fail('NOT_FOUND',404)
    elif r in ('CLINICIAN','ADMIN'):
        if u.org_id not in (m.data['sourceOrgId'],m.data['destinationOrgId']):
            fail('NOT_FOUND',404)
    else:
        fail('FORBIDDEN',403)

def migration_view(m,u):
    fields=('sourceOrgId','destinationOrgId','createdAt','completedAt')
    if u.data['role']!='ADMIN':
        fields+=('reason',)
    return {'id':m.id,'version':m.version,'patientId':m.patient_id,'status':m.status,**{k:m.data.get(k) for k in fields}}

@router.post('/patients/{patientId}/migrations',status_code=201, response_model=MigrationOutput, response_model_exclude_unset=True)
def request_migration(patientId: str, body: MigrationBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'CLINICIAN','PATIENT')
    p=get(db,Patient,patientId)
    if u.data['role']=='PATIENT':
        patient_access(db,u,p.id)
        destination=body.destinationOrgId
        if not destination:
            fail('VALIDATION_FAILED',422,'destinationOrgId is required for patient-initiated requests.')
    else:
        destination=u.org_id
        if body.destinationOrgId and destination!=body.destinationOrgId:
            fail('FORBIDDEN',403)
        # Known-ID destination requests are the contract's explicit exception to existing grants.
    check_version(p,body.ifVersion)
    org=get(db,Organisation,destination)
    if org.data['status']!='ACTIVE' or destination==p.org_id:
        fail('VALIDATION_FAILED',422)
    linked=db.get(User,p.data.get('linkedUserId')) if p.data.get('linkedUserId') else None
    if not linked or linked.data['status']!='ACTIVE' or linked.data.get('patientId')!=p.id:
        fail('VALIDATION_FAILED',422,'A linked active patient login is required.')
    if db.scalar(select(Migration).where(Migration.patient_id==p.id,Migration.status=='PENDING_PATIENT_APPROVAL')):
        fail('VERSION_CONFLICT',409,'A migration is already pending.')
    m=Migration(id=uid('mig'),patient_id=p.id,org_id=p.org_id,status='PENDING_PATIENT_APPROVAL',
        data={'sourceOrgId':p.org_id,'destinationOrgId':destination,'reason':body.reason,'createdAt':stamp()})
    db.add(m); update(p,{}); db.flush()
    audit(db,u,'MIGRATION_REQUESTED',m.id,p.id,org_id=p.org_id,after=migration_view(m,u))
    return migration_view(m,u)

@router.get('/patients/{patientId}/migrations', response_model=Page[MigrationOutput], response_model_exclude_unset=True)
def migrations(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'CLINICIAN','PATIENT','ADMIN')
    rows=list(db.scalars(select(Migration).where(Migration.patient_id==patientId)))
    visible=[]
    for m in rows:
        if u.data['role']=='PATIENT' and u.data.get('patientId')==patientId or u.data['role'] in ('CLINICIAN','ADMIN') and u.org_id in (m.data['sourceOrgId'],m.data['destinationOrgId']):
            visible.append(migration_view(m,u))
    if not visible:
        patient_access(db,u,patientId,metadata=u.data['role']=='ADMIN')
    return page(request,visible)

@router.get('/migrations/{migrationId}', response_model=MigrationOutput, response_model_exclude_unset=True)
def migration_status(migrationId: str, u=Depends(current_user), db=Depends(db_session, scope='function')):
    m=get(db,Migration,migrationId); migration_visible(db,u,m)
    return migration_view(m,u)

@router.post('/migrations/{migrationId}/decision', response_model=MigrationOutput, response_model_exclude_unset=True)
def decide_migration(migrationId: str, body: MigrationDecision, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'PATIENT'); m=get(db,Migration,migrationId); migration_visible(db,u,m)
    if m.status!='PENDING_PATIENT_APPROVAL':
        fail('MIGRATION_NOT_PENDING',409)
    check_version(m,body.ifVersion); p=patient_access(db,u,m.patient_id)
    if p.org_id!=m.data['sourceOrgId']:
        fail('VERSION_CONFLICT',409)
    before=migration_view(m,u)
    if body.decision=='DECLINE':
        m.status='DECLINED'; update(m,{})
        audit(db,u,'MIGRATION_DECLINED',m.id,p.id,org_id=p.org_id,before=before,after=migration_view(m,u))
    else:
        destination=get(db,Organisation,m.data['destinationOrgId'])
        if destination.data['status']!='ACTIVE':
            fail('ACCOUNT_DISABLED',403)
        source=p.org_id
        set_grant(db,p.id,destination.id,'FULL')
        set_grant(db,p.id,source,'VIEW_ONLY' if body.decision=='APPROVE_VIEW_ONLY' else 'NONE')
        p.org_id=destination.id; update(p,{})
        u.org_id=destination.id; update(u,{'orgId':destination.id})
        m.status='COMPLETED'; update(m,{'completedAt':stamp()})
        for org_id in (source,destination.id):
            audit(db,u,'MIGRATION_APPROVED',m.id,p.id,org_id=org_id,before=before,after=migration_view(m,u))
            audit(db,u,'MIGRATION_COMPLETED',m.id,p.id,org_id=org_id,before=before,after=migration_view(m,u))
    return migration_view(m,u)

@router.post('/migrations/{migrationId}/cancel', response_model=MigrationOutput)
def cancel_migration(migrationId: str, body: Version, u=Depends(current_user), db=Depends(db_session)):
    role(u,'PATIENT'); m=get(db,Migration,migrationId); migration_visible(db,u,m)
    if m.status!='PENDING_PATIENT_APPROVAL':
        fail('MIGRATION_NOT_PENDING',409)
    check_version(m,body.ifVersion); p=patient_access(db,u,m.patient_id)
    before=migration_view(m,u)
    m.status='CANCELLED'; update(m,{}); update(p,{})
    for org_id in (m.data['sourceOrgId'],m.data['destinationOrgId']):
        audit(db,u,'MIGRATION_CANCELLED',m.id,p.id,org_id=org_id,before=before,after=migration_view(m,u))
    return migration_view(m,u)

@router.get('/patients/{patientId}/access-grants', response_model=Page[GrantOutput], response_model_exclude_unset=True)
def grants(patientId: str, request: Request, u=Depends(current_user), db=Depends(db_session, scope='function')):
    patient_access(db,u,patientId)
    return page(request,[{'id':g.id,'version':g.version,'orgId':g.org_id,'patientId':g.patient_id,'level':g.data['level']} for g in db.scalars(select(Grant).where(Grant.patient_id==patientId))])

@router.post('/patients/{patientId}/access-grants/{orgId}', response_model=GrantOutput, response_model_exclude_unset=True)
def grant_access(patientId: str, orgId: str, body: GrantBody, u=Depends(current_user), db=Depends(db_session, scope='function')):
    role(u,'PATIENT'); p=patient_access(db,u,patientId); get(db,Organisation,orgId)
    grant=db.scalar(select(Grant).where(Grant.patient_id==p.id,Grant.org_id==orgId).with_for_update())
    if grant:
        check_version(grant,body.ifVersion)
    else:
        check_version(p,body.ifVersion)
    result=set_grant(db,p.id,orgId,body.level)
    update(p,{})
    audit(db,u,'ACCESS_GRANT_CHANGED',result.id,p.id,org_id=orgId)
    return {'id':result.id,'version':result.version,'patientId':p.id,'orgId':orgId,'level':body.level}

app=create_app()
