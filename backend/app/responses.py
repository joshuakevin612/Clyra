"""Explicit wire models shared by response validation and generated OpenAPI."""
from typing import Generic, TypeVar, Literal
from pydantic import BaseModel, ConfigDict

class Output(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Identity(Output):
    id: str
    version: int

class UserOutput(Identity):
    username: str
    displayName: str
    role: Literal['SUPER_ADMIN','ADMIN','CLINICIAN','PATIENT']
    status: Literal['ACTIVE','DISABLED']
    orgId: str | None
    patientId: str | None
    mustChangePassword: bool

class LoginOutput(Output):
    accessToken: str
    tokenType: Literal['Bearer']
    expiresAt: str
    user: UserOutput

class LogoutOutput(Output):
    revoked: bool

class OrganisationOutput(Identity):
    name: str
    status: Literal['ACTIVE','SUSPENDED']

class OrganisationCreated(OrganisationOutput):
    admin: UserOutput

class PatientOutput(Identity):
    orgId: str | None
    displayName: str
    dateOfBirth: str
    linkedUserId: str | None = None
    accessLevel: Literal['FULL','VIEW_ONLY'] | None = None

class VisitOutput(Identity):
    patientId: str
    orgId: str | None
    visitDate: str

class Source(Output):
    documentId: str
    page: int
    quote: str
    charStart: int
    charEnd: int

class Strength(Output):
    value: float
    unit: Literal['MG','MCG','G','ML','IU']

class MedicationFields(Output):
    medicineName: str
    medicineKey: str
    strength: Strength
    form: Literal['TABLET','CAPSULE','LIQUID','INJECTION','PATCH','INHALER','OTHER']
    instructionText: str
    startDate: str
    endDate: str | None
    prescriberName: str | None
    source: Source

class ExtractedFields(MedicationFields):
    fieldSources: dict[str, Source]

class MedicationOutput(MedicationFields,Identity):
    patientId: str
    visitId: str
    sourceDocumentId: str
    supersedesId: str | None
    verificationStatus: Literal['UNVERIFIED','VERIFIED','REJECTED']
    createdAt: str
    verifiedAt: str | None

class PatientMedication(Output):
    medicineName: str
    status: Literal['VERIFIED','AWAITING_REVIEW']
    strength: Strength
    form: str
    instructionText: str | None
    startDate: str
    prescriberName: str | None
    verifiedAt: str | None
    sourceVisitDate: str

T=TypeVar('T')
class Page(Output,Generic[T]):
    items: list[T]
    nextCursor: str | None

class PatientMedications(Page[PatientMedication]):
    notice: str

class DiscrepancyOutput(Identity):
    patientId: str
    type: Literal['CONFLICT','MISSING','DUPLICATE']
    field: Literal['strength','form','instructionText','startDate','endDate','medicine']
    medicineKey: str
    leftEntryId: str
    rightEntryId: str | None
    visitId: str
    summary: str
    status: Literal['OPEN','RESOLVED']
    detectedAt: str
    hasDecision: bool = False

class DecisionOutput(Identity):
    discrepancyId: str
    decision: Literal['ACCEPT_LEFT','ACCEPT_RIGHT','KEEP_BOTH_FLAGGED','ESCALATE']
    note: str
    createdAt: str
    actorId: str

class ComparisonOutput(Output):
    leftVisitId: str
    rightVisitId: str
    left: list[MedicationOutput]
    right: list[MedicationOutput]

class UploadOutput(Output):
    documentId: str
    jobId: str
    status: Literal['PENDING','COMPLETED','FAILED']

class DocumentOutput(Identity):
    patientId: str
    visitId: str
    rawText: str
    createdAt: str

class ExtractionOutput(Page[ExtractedFields]):
    documentId: str
    status: Literal['COMPLETED','FAILED']
    reason: str | None = None

class JobOutput(Identity):
    documentId: str
    status: Literal['PENDING','COMPLETED','FAILED']
    reason: str | None

class LinkOutput(Identity):
    userId: str
    status: Literal['PENDING','CONFIRM','DECLINE']
    displayName: str
    dateOfBirth: str

class MigrationOutput(Identity):
    patientId: str
    sourceOrgId: str
    destinationOrgId: str
    status: Literal['PENDING_PATIENT_APPROVAL','COMPLETED','DECLINED','CANCELLED']
    createdAt: str
    completedAt: str | None
    reason: str | None = None

class GrantOutput(Identity):
    patientId: str
    orgId: str
    level: Literal['FULL','VIEW_ONLY','NONE']

class AccessOutput(Output):
    id: str
    orgId: str | None
    patientId: str | None
    actorId: str
    actorRole: str
    resource: str
    resourceId: str | None
    occurredAt: str

class AuditOutput(Output):
    id: str
    orgId: str | None
    patientId: str | None
    actorId: str
    actorRole: str
    action: str
    targetId: str
    occurredAt: str
    before: dict | None
    after: dict | None
    note: str | None

class ErrorDetail(Output):
    field: str
    issue: str

class ErrorBody(Output):
    code: Literal['VALIDATION_FAILED','UNAUTHENTICATED','INVALID_CREDENTIALS','ACCOUNT_DISABLED','FORBIDDEN','NOT_FOUND','VERSION_CONFLICT','LAST_ADMIN_PROTECTED','MIGRATION_NOT_PENDING','EXTRACTION_PENDING','RATE_LIMITED','INTERNAL_ERROR']
    message: str
    details: list[ErrorDetail]

class ErrorOutput(Output):
    error: ErrorBody
