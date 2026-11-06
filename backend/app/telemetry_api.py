"""TR-1.0 routes registered on the existing atomic transaction router."""
from datetime import timedelta
from fastapi import Depends, Response
from sqlalchemy import select
from . import core
from .core import ApiError, db_session, fail, role, patient_access, check_version, uid, get, audit, access
from .db import TelemetrySession, TelemetryObservation
from .telemetry_engine import evaluate, instant, iso
from .telemetry_schemas import (TelemetryCreate, TelemetryStop, TelemetryReadings,
    TelemetrySessionOutput, TelemetrySnapshot, TelemetryIngested)

def telemetry_user(request: core.Request, db=Depends(db_session), credentials=Depends(core.bearer)):
    try:
        return core.current_user(request, db, credentials)
    except ApiError as exc:
        if exc.body['error']['code'] == 'ACCOUNT_DISABLED':
            fail('FORBIDDEN', 403)
        raise

def authorize(db, user, patient_id, write=False):
    role(user, 'CLINICIAN')
    # patient_access locks the patient row. Every telemetry route takes this lock
    # before session locks, serializing creates, ingestion, stops and snapshots
    # against each other and existing grant/migration writes in PostgreSQL.
    return patient_access(db, user, patient_id, write=write, allow_patient=False)

def session_view(row, time):
    status = row.data['status']
    if status == 'ACTIVE' and instant(row.data['expiresAt']) <= time:
        status = 'EXPIRED'
    return {**row.data, 'id':row.id, 'patientId':row.patient_id, 'version':row.version,
        'status':status, 'startedAt':row.started_at,
        'metric':'HEART_RATE', 'unit':'BPM', 'expectedIntervalSeconds':2,
        'sources':[{'id':'SENSOR_A','label':'Synthetic sensor A'}, {'id':'SENSOR_B','label':'Synthetic sensor B'}]}

def owned_session(db, patient_id, session_id):
    row = get(db, TelemetrySession, session_id)
    if row.patient_id != patient_id:
        fail('NOT_FOUND', 404)
    return row

def raw_rows(db, session_id):
    return [dict(id=r.id, eventId=r.event_id, sessionId=r.session_id, sourceId=r.source_id,
                 measuredAt=r.measured_at, **r.data)
            for r in db.scalars(select(TelemetryObservation).where(TelemetryObservation.session_id == session_id))]

def register(router):
    @router.post('/patients/{patientId}/telemetry/sessions', status_code=201, response_model=TelemetrySessionOutput,
                 responses={200: {'model': TelemetrySessionOutput, 'description': 'Idempotent creation replay'}})
    def create(patientId: str, body: TelemetryCreate, response: Response, u=Depends(telemetry_user), db=Depends(db_session)):
        authorize(db, u, patientId, True)
        time = core.now()
        replay = db.scalar(select(TelemetrySession).where(TelemetrySession.patient_id == patientId,
            TelemetrySession.actor_id == u.id, TelemetrySession.request_id == str(body.requestId)))
        if replay:
            response.status_code = 200
            access(db, u, 'TELEMETRY', replay.id, patientId)
            return session_view(replay, time)
        sessions = db.scalars(select(TelemetrySession).where(TelemetrySession.patient_id == patientId))
        if any(session_view(s, time)['status'] == 'ACTIVE' for s in sessions):
            fail('VERSION_CONFLICT', 409, 'An active telemetry session already exists.')
        row = TelemetrySession(id=uid('tel'), patient_id=patientId, actor_id=u.id,
            request_id=str(body.requestId), started_at=iso(time),
            data={'status':'ACTIVE', 'expiresAt':iso(time+timedelta(minutes=15)), 'stoppedAt':None})
        db.add(row)
        db.flush()
        audit(db, u, 'TELEMETRY_SESSION_CREATED', row.id, patientId)
        return session_view(row, time)

    @router.post('/patients/{patientId}/telemetry/sessions/{sessionId}/readings', response_model=TelemetryIngested)
    def ingest(patientId: str, sessionId: str, body: TelemetryReadings, u=Depends(telemetry_user), db=Depends(db_session)):
        authorize(db, u, patientId, True)
        row = owned_session(db, patientId, sessionId)
        time = core.now()
        existing = {r['eventId']:r for r in raw_rows(db, row.id)}
        new = {}
        duplicates = 0
        for reading in body.readings:
            payload = reading.model_dump(mode='json')
            payload['measuredAt'] = iso(instant(payload['measuredAt']))
            event_id = payload['eventId']
            previous = existing.get(event_id) or new.get(event_id)
            if previous:
                if any(previous[k] != payload[k] for k in ('sourceId','measuredAt','value')):
                    fail('VERSION_CONFLICT', 409, 'eventId was reused with a different reading.')
                duplicates += 1
                continue
            measured = instant(payload['measuredAt'])
            if measured < instant(row.started_at) or measured > time+timedelta(seconds=5):
                fail('VALIDATION_FAILED', 422, 'Measurement must be within the session and at most five seconds ahead of receipt.')
            new[event_id] = payload
        if new and session_view(row, time)['status'] != 'ACTIVE':
            fail('VERSION_CONFLICT', 409, 'New readings require an active session.')
        if len(existing)+len(new) > 1000:
            fail('VALIDATION_FAILED', 422, 'Session observation limit is 1000.')
        for payload in new.values():
            db.add(TelemetryObservation(id=uid('obs'), session_id=row.id, event_id=payload['eventId'],
                source_id=payload['sourceId'], measured_at=payload['measuredAt'],
                data={'value':payload['value'], 'receivedAt':iso(time)}))
        db.flush()
        audit(db, u, 'TELEMETRY_READINGS_INGESTED', row.id, patientId,
              after={'acceptedCount':len(new), 'duplicateCount':duplicates})
        return {'acceptedCount':len(new), 'duplicateCount':duplicates, 'serverTime':iso(time)}

    @router.post('/patients/{patientId}/telemetry/sessions/{sessionId}/stop', response_model=TelemetrySessionOutput)
    def stop(patientId: str, sessionId: str, body: TelemetryStop, u=Depends(telemetry_user), db=Depends(db_session)):
        authorize(db, u, patientId, True)
        row = owned_session(db, patientId, sessionId)
        check_version(row, body.ifVersion)
        time = core.now()
        if session_view(row, time)['status'] == 'ACTIVE':
            row.data = {**row.data, 'status':'STOPPED', 'stoppedAt':iso(time)}
            row.version += 1
            audit(db, u, 'TELEMETRY_SESSION_STOPPED', row.id, patientId)
        else:
            access(db, u, 'TELEMETRY', row.id, patientId)
        return session_view(row, time)

    @router.get('/patients/{patientId}/telemetry/snapshot', response_model=TelemetrySnapshot)
    def snapshot(patientId: str, sessionId: str | None = None, u=Depends(telemetry_user), db=Depends(db_session)):
        authorize(db, u, patientId)
        if sessionId is not None:
            row = owned_session(db, patientId, sessionId)
        else:
            row = db.scalar(select(TelemetrySession).where(TelemetrySession.patient_id == patientId)
                .order_by(TelemetrySession.started_at.desc(), TelemetrySession.id.desc()).limit(1))
        time = core.now()
        result = evaluate(session_view(row, time) if row else None, raw_rows(db, row.id) if row else [], iso(time))
        access(db, u, 'TELEMETRY', row.id if row else patientId, patientId)
        return result
