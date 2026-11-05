from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class Body(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Version(Body):
    ifVersion: int = Field(ge=1)

class LoginBody(Body):
    username: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=256)

class Account(LoginBody):
    displayName: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=256)

class Signup(Account):
    dateOfBirth: date

class PasswordBody(Body):
    currentPassword: str = Field(max_length=256)
    newPassword: str = Field(min_length=12, max_length=256)
    ifVersion: int = Field(ge=1)

class OrgBody(Body):
    name: str = Field(min_length=1, max_length=200)
    adminUsername: str = Field(min_length=1, max_length=200)
    adminDisplayName: str = Field(min_length=1, max_length=200)
    adminPassword: str = Field(min_length=12, max_length=256)

class OrgPatch(Version):
    status: Literal['ACTIVE','SUSPENDED']

class AccountPatch(Version):
    status: Literal['ACTIVE','DISABLED'] | None = None
    password: str | None = Field(default=None, min_length=12, max_length=256)

class PatientBody(Body):
    displayName: str = Field(min_length=1, max_length=200)
    dateOfBirth: date

class PatientPatch(PatientBody, Version):
    pass

class VisitBody(Version):
    visitDate: date

class LinkBody(Body):
    username: str = Field(min_length=1, max_length=200)

class LinkDecision(Version):
    decision: Literal['CONFIRM','DECLINE']

class Review(Version):
    decision: Literal['ACCEPT_LEFT','ACCEPT_RIGHT','KEEP_BOTH_FLAGGED','ESCALATE']
    note: str = Field(min_length=3, max_length=2000)

class Verification(Version):
    verificationStatus: Literal['VERIFIED','REJECTED','UNVERIFIED']
    note: str | None = Field(default=None, max_length=2000)

class MigrationBody(Version):
    reason: str | None = Field(default=None, max_length=1000)
    destinationOrgId: str | None = None

class MigrationDecision(Version):
    decision: Literal['APPROVE_FULL','APPROVE_VIEW_ONLY','DECLINE']

class GrantBody(Version):
    level: Literal['NONE','VIEW_ONLY','FULL']
