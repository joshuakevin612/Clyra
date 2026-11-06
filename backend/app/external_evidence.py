"""EI-1.0: immutable synthetic evidence and explicit patient association."""
from datetime import date
from uuid import UUID
from typing import Literal
from fastapi import Depends, File, Form, Request, UploadFile
from pydantic import Field
from sqlalchemy.exc import IntegrityError
from .core import *
from .domain import extract
from .schemas import Version
from .responses import Identity, Output, ExtractedFields, Page

class ConfirmImport(Version):
    model_config = {'extra':'forbid','json_schema_extra':{'examples':[
        {'ifVersion':1,'patientId':'pat_001','patientIfVersion':1,'confirmAssociation':True}]}}
    patientId: str = Field(min_length=1, max_length=100)
    patientIfVersion: int = Field(ge=1)
    confirmAssociation: Literal[True]

class ExternalImportOutput(Identity):
    contractVersion: Literal['EI-1.0']
    patientId: str
    status: Literal['PENDING_ASSOCIATION','CONFIRMED']
    sourceLabel: str
    visitDate: str
    sha256: str
    createdAt: str
    confirmedAt: str | None
    visitId: str | None
    documentId: str | None
    jobId: str | None

class ExternalSource(Output):
    importId: str
    sha256: str
    rawText: str
    entries: list[ExtractedFields]

def view(row):
    return {'id':row.id,'version':row.version,'contractVersion':'EI-1.0',
            'patientId':row.patient_id, **{key:row.data[key] for key in (
            'status','sourceLabel','visitDate','createdAt','confirmedAt','visitId','documentId','jobId')},
            'sha256':row.content_hash}

def visible(db, actor, row, write=False):
    role(actor,'CLINICIAN')
    if row.org_id != actor.org_id:
        fail('NOT_FOUND',404)
    patient_access(db,actor,row.patient_id,write=write,allow_patient=False)
    return row

def register(router):
    @router.post('/external-imports', status_code=201, response_model=ExternalImportOutput,
                 tags=['External evidence EI-1.0'])
    async def stage(patientId: str=Form(...,min_length=1,max_length=100),
                    sourceLabel: str=Form(...,min_length=1,max_length=200),
                    visitDate: date=Form(...), requestId: UUID=Form(...), file: UploadFile=File(...),
                    actor=Depends(current_user), db=Depends(db_session)):
        role(actor,'CLINICIAN')
        patient=patient_access(db,actor,patientId,write=True)
        if not sourceLabel.strip():
            fail('VALIDATION_FAILED',422)
        payload=await file.read(2_000_001)
        if len(payload)>2_000_000:
            fail('VALIDATION_FAILED',422,'Document limit is 2 MB.')
        try:
            raw=payload.decode('utf-8')
            extract(raw,'pending')
        except (UnicodeDecodeError,ValueError):
            fail('VALIDATION_FAILED',422,'Upload valid UTF-8 SYN-RX-V1 synthetic evidence.')
        content_hash=digest(raw)
        previous=db.scalar(select(ExternalImport).where(ExternalImport.org_id==actor.org_id,
                           ExternalImport.request_id==str(requestId)))
        if previous:
            if (previous.patient_id!=patient.id or previous.content_hash!=content_hash or
                previous.data['visitDate']!=visitDate.isoformat() or previous.data['sourceLabel']!=sourceLabel):
                fail('VERSION_CONFLICT',409,'Request ID already used for different evidence.')
            return view(previous)
        if db.scalar(select(ExternalImport).where(ExternalImport.org_id==actor.org_id,
                     ExternalImport.patient_id==patient.id,ExternalImport.content_hash==content_hash)):
            fail('VERSION_CONFLICT',409,'This evidence is already staged for this patient.')
        row=ExternalImport(id=uid('imp'),patient_id=patient.id,org_id=actor.org_id,
            request_id=str(requestId),content_hash=content_hash,
            data={'rawText':raw,'status':'PENDING_ASSOCIATION','sourceLabel':sourceLabel,
                  'visitDate':visitDate.isoformat(),'createdAt':stamp(),'createdBy':actor.id,
                  'confirmedAt':None,'visitId':None,'documentId':None,'jobId':None})
        db.add(row)
        try:
            db.flush()
        except IntegrityError:
            fail('VERSION_CONFLICT',409)
        audit(db,actor,'EXTERNAL_EVIDENCE_STAGED',row.id,patient.id)
        return view(row)

    @router.get('/patients/{patientId}/external-imports', response_model=Page[ExternalImportOutput],tags=['External evidence EI-1.0'])
    def listing(patientId: str, request: Request, actor=Depends(current_user), db=Depends(db_session)):
        role(actor,'CLINICIAN')
        patient_access(db,actor,patientId,allow_patient=False)
        access(db,actor,'EXTERNAL_IMPORTS',patientId,patientId)
        return page(request,[view(row) for row in db.scalars(select(ExternalImport).where(
            ExternalImport.patient_id==patientId,ExternalImport.org_id==actor.org_id))])

    @router.get('/external-imports/{importId}', response_model=ExternalImportOutput,tags=['External evidence EI-1.0'])
    def detail(importId: str, actor=Depends(current_user), db=Depends(db_session)):
        row=visible(db,actor,get(db,ExternalImport,importId))
        access(db,actor,'EXTERNAL_IMPORT',row.id,row.patient_id)
        return view(row)

    @router.get('/external-imports/{importId}/source', response_model=ExternalSource,tags=['External evidence EI-1.0'])
    def source(importId: str, actor=Depends(current_user), db=Depends(db_session)):
        row=visible(db,actor,get(db,ExternalImport,importId))
        access(db,actor,'EXTERNAL_IMPORT_SOURCE',row.id,row.patient_id)
        source_id=row.data['documentId'] or row.id
        return {'importId':row.id,'sha256':row.content_hash,'rawText':row.data['rawText'],
                'entries':extract(row.data['rawText'],source_id)}

    @router.post('/external-imports/{importId}/confirm', response_model=ExternalImportOutput,tags=['External evidence EI-1.0'])
    async def confirm(importId: str, body: ConfirmImport, actor=Depends(current_user), db=Depends(db_session)):
        row=visible(db,actor,get(db,ExternalImport,importId),write=True)
        if body.patientId!=row.patient_id:
            fail('VERSION_CONFLICT',409,'Association must match the staged patient.')
        check_version(row,body.ifVersion)
        if row.data['status']!='PENDING_ASSOCIATION':
            fail('VERSION_CONFLICT',409)
        patient=get(db,Patient,row.patient_id)
        check_version(patient,body.patientIfVersion)
        visit=Visit(id=uid('vis'),patient_id=patient.id,org_id=actor.org_id,data={'visitDate':row.data['visitDate']})
        db.add(visit); db.flush()
        # Reuse clinical extraction and discrepancy rules in this same transaction.
        from io import BytesIO
        from .main import upload
        result=await upload(patientId=patient.id,visitId=visit.id,ifVersion=patient.version,
            file=UploadFile(filename='synthetic-external.txt',file=BytesIO(row.data['rawText'].encode('utf-8'))),
            supersedesId=None,supersedesIfVersion=None,u=actor,db=db)
        if result['status']!='COMPLETED':
            fail('VALIDATION_FAILED',422)
        update(row,{'status':'CONFIRMED','confirmedAt':stamp(),'visitId':visit.id,
                    'documentId':result['documentId'],'jobId':result['jobId']})
        audit(db,actor,'EXTERNAL_EVIDENCE_CONFIRMED',row.id,patient.id)
        return view(row)
