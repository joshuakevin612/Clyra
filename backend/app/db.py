import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, String, Integer, JSON, ForeignKey, Index, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

load_dotenv(Path(__file__).resolve().parents[1] / '.env')

class Base(DeclarativeBase):
    pass

class Record:
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict] = mapped_column(JSON, default=dict)

class Organisation(Record, Base):
    __tablename__ = 'organisations'

class User(Record, Base):
    __tablename__ = 'users'
    org_id: Mapped[str | None] = mapped_column(ForeignKey('organisations.id'), index=True)
    username: Mapped[str] = mapped_column(String(200), unique=True)

class Session(Record, Base):
    __tablename__ = 'sessions'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)

class Patient(Record, Base):
    __tablename__ = 'patients'
    org_id: Mapped[str | None] = mapped_column(ForeignKey('organisations.id'), index=True)

class PatientRecord(Record):
    patient_id: Mapped[str] = mapped_column(ForeignKey('patients.id'), index=True)
    org_id: Mapped[str | None] = mapped_column(ForeignKey('organisations.id'), index=True)

class Visit(PatientRecord, Base):
    __tablename__ = 'visits'

class Grant(PatientRecord, Base):
    __tablename__ = 'organisation_patient_access'
    __table_args__ = (Index('uq_patient_org', 'patient_id', 'org_id', unique=True),)

class Link(PatientRecord, Base):
    __tablename__ = 'link_requests'

class Migration(PatientRecord, Base):
    __tablename__ = 'record_migrations'
    status: Mapped[str] = mapped_column(String(40))
    __table_args__ = (Index('uq_open_migration', 'patient_id', unique=True,
        postgresql_where=text("status = 'PENDING_PATIENT_APPROVAL'"),
        sqlite_where=text("status = 'PENDING_PATIENT_APPROVAL'")),)

class Document(PatientRecord, Base):
    __tablename__ = 'documents'

class Job(PatientRecord, Base):
    __tablename__ = 'extraction_jobs'

class Medication(PatientRecord, Base):
    __tablename__ = 'medication_entries'

class Discrepancy(PatientRecord, Base):
    __tablename__ = 'discrepancies'

class Decision(PatientRecord, Base):
    __tablename__ = 'discrepancy_decisions'

class Event(Record):
    org_id: Mapped[str | None] = mapped_column(ForeignKey('organisations.id'), index=True)
    patient_id: Mapped[str | None] = mapped_column(ForeignKey('patients.id'), index=True)

class Audit(Event, Base):
    __tablename__ = 'audit_events'

class Access(Event, Base):
    __tablename__ = 'access_events'

class Attempt(Record, Base):
    __tablename__ = 'login_attempts'
    key: Mapped[str] = mapped_column(String(200), index=True)

class TelemetrySession(Record, Base):
    __tablename__ = 'telemetry_sessions'
    patient_id: Mapped[str] = mapped_column(ForeignKey('patients.id'))
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    request_id: Mapped[str] = mapped_column(String(36))
    started_at: Mapped[str] = mapped_column(String(40))
    __table_args__ = (
        Index('ix_telemetry_patient_started', 'patient_id', 'started_at', 'id'),
        Index('uq_telemetry_creation', 'patient_id', 'actor_id', 'request_id', unique=True),
    )

class TelemetryObservation(Base):
    __tablename__ = 'telemetry_observations'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey('telemetry_sessions.id'))
    event_id: Mapped[str] = mapped_column(String(36))
    source_id: Mapped[str] = mapped_column(String(20))
    measured_at: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (
        Index('uq_telemetry_event', 'session_id', 'event_id', unique=True),
        Index('ix_telemetry_measurement', 'session_id', 'source_id', 'measured_at', 'id'),
    )

def make_engine(url=None):
    url = url or os.environ.get('DATABASE_URL')
    if not url:
        raise RuntimeError('Set DATABASE_URL in backend/.env (PostgreSQL with SSL).')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql+psycopg://', 1)
    elif url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
    if not url.startswith('sqlite') and 'sslmode=require' not in url and 'sslmode=verify-full' not in url:
        raise RuntimeError('DATABASE_URL must require PostgreSQL SSL.')
    if url.startswith('sqlite'):
        if os.getenv('ENVIRONMENT') != 'test':
            raise RuntimeError('SQLite is allowed only in tests.')
        return create_engine(url, connect_args={'check_same_thread': False}, poolclass=StaticPool)
    return create_engine(url, pool_pre_ping=True, connect_args={'connect_timeout':15})

def factory(engine):
    return sessionmaker(engine, expire_on_commit=False)
