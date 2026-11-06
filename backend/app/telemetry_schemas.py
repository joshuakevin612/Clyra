"""TR-1.0 shared wire shapes. All fields are required, including nullable fields."""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
import re
from pydantic import Field, AfterValidator, StrictFloat, StrictInt
from .schemas import Body

SourceId = Literal['SENSOR_A', 'SENSOR_B']
FindingCode = Literal['MISSING', 'SPIKE', 'REPEATED', 'FLUCTUATION', 'DELAYED', 'CONFLICT']

def utc_stamp(value: str) -> str:
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z', value):
        raise ValueError('Use a UTC ISO-8601 timestamp ending in Z.')
    datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value

Timestamp = Annotated[str, Field(json_schema_extra={'format': 'date-time', 'pattern': r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$'}), AfterValidator(utc_stamp)]
Value = Annotated[StrictFloat | StrictInt, Field(ge=0, le=1000, allow_inf_nan=False)]

class TelemetryCreate(Body):
    requestId: UUID

class TelemetryStop(Body):
    ifVersion: int = Field(strict=True, ge=1)

class ReadingInput(Body):
    eventId: UUID
    sourceId: SourceId
    measuredAt: Timestamp
    value: Value | None

class TelemetryReadings(Body):
    readings: list[ReadingInput] = Field(min_length=1, max_length=100)

class TelemetrySource(Body):
    id: SourceId
    label: str

class TelemetrySessionOutput(Body):
    id: str
    patientId: str
    version: int
    status: Literal['ACTIVE', 'STOPPED', 'EXPIRED']
    startedAt: Timestamp
    expiresAt: Timestamp
    stoppedAt: Timestamp | None
    metric: Literal['HEART_RATE']
    unit: Literal['BPM']
    expectedIntervalSeconds: Literal[2]
    sources: list[TelemetrySource]

class ObservationOutput(Body):
    id: str
    eventId: UUID
    sessionId: str
    sourceId: SourceId
    measuredAt: Timestamp
    receivedAt: Timestamp
    value: Value | None
    flags: list[FindingCode]

class SourceState(Body):
    sourceId: SourceId
    status: Literal['WAITING', 'CURRENT', 'SUSPECT', 'STALE', 'ENDED']
    latestObservationId: str | None
    latestValue: Value | None
    latestMeasuredAt: Timestamp | None
    lastReceivedAt: Timestamp | None
    ageSeconds: float | None
    flags: list[FindingCode]

class Finding(Body):
    code: FindingCode
    sourceIds: list[SourceId]
    observationIds: list[str]
    explanation: str

class TelemetrySnapshot(Body):
    contractVersion: Literal['TR-1.0']
    serverTime: Timestamp
    session: TelemetrySessionOutput | None
    observations: list[ObservationOutput]
    sources: list[SourceState]
    findings: list[Finding]
    summary: str

class TelemetryIngested(Body):
    acceptedCount: int
    duplicateCount: int
    serverTime: Timestamp
