# Medication Continuity and Safe Handover: Contract v1.3.1

Sections 1–10 preserve the supplied v1.3.0 base. Section 11 specifies the additive implementation decisions authorized by the project owner's request to resolve the gaps. No original endpoint is removed.

Synthetic data only. The system never generates prescriptions, substitutes medicines, recommends dosage changes, or tells a patient to stop a medication. Those decisions belong to qualified healthcare professionals.

## 1. Basics

- Base path: `/api/v1`. Data is sent as JSON, except document upload, which uses multipart form data.
- Field names are camelCase. Enum values are UPPER_SNAKE_CASE.
- Timestamps are UTC, ISO 8601, ending in Z (example: `2026-11-05T09:30:37Z`). Dates are `YYYY-MM-DD`.
- IDs have a prefix: `org_`, `usr_`, `pat_`, `vis_`, `doc_`, `job_`, `med_`, `disc_`, `mig_`, `lnk_`, `aud_`, `acc_`.
- Any record that can change has a `version` number. Every update must send `ifVersion` with the version the user last saw. If it does not match, the server returns VERSION_CONFLICT.
- Authentication: send `Authorization: Bearer <token>`. Tokens last 8 hours.
- List responses have the shape `{ "items": [...], "nextCursor": string or null }`. Accepted query parameters: `limit` (1 to 200, default 50) and `cursor`.

### Error format

Every error response, with any status code other than 2xx, has this shape:

```
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [{ "field": "startDate", "issue": "must be on or before endDate" }]
  }
}
```

The only allowed error codes are:
VALIDATION_FAILED, UNAUTHENTICATED, INVALID_CREDENTIALS, ACCOUNT_DISABLED, FORBIDDEN, NOT_FOUND, VERSION_CONFLICT, LAST_ADMIN_PROTECTED, MIGRATION_NOT_PENDING, EXTRACTION_PENDING, RATE_LIMITED, INTERNAL_ERROR.

## 2. Roles

- **SUPER_ADMIN (platform owner):** creates and suspends organisations and creates ADMIN accounts. Reads audit and access logs across all organisations, metadata only. Cannot read or write any patient data.
- **ADMIN (one organisation):** creates, disables, re-enables, and resets passwords for CLINICIAN accounts in its organisation. Reads its organisation's audit and access logs, metadata only. Cannot read clinical content or manage patient logins.
- **CLINICIAN (one organisation):** creates patients, manages patient logins and link requests, writes clinical data, and requests migrations. Cannot manage users, cannot reach other organisations, and cannot write to a record where its access is VIEW_ONLY or NONE.
- **PATIENT (one record):** signs up, reads their own verified view and access log, confirms link requests, and approves, declines, or revokes migrations and access grants for their own record.

## 3. Access levels

Access is held per organisation per patient:

- **FULL:** the organisation can read and write clinical data.
- **VIEW_ONLY:** the organisation can read clinical data. Any write returns FORBIDDEN.
- **NONE:** the organisation cannot see the patient. Requests return NOT_FOUND.

## 4. Endpoints

| # | Method | Path | Who | What it does |
|---|---|---|---|---|
| 1 | POST | /auth/login | Public | Log in. Returns token, expiry, and user |
| 2 | POST | /auth/logout | Any logged-in user | Revoke the current token |
| 3 | GET | /auth/me | Any logged-in user | Current user |
| 4 | POST | /auth/change-password | Any logged-in user | Change own password. Required when mustChangePassword is true |
| 5 | POST | /auth/signup | Public | Patient self-signup. Rate limited |
| 6 | GET | /superadmin/organisations | SUPER_ADMIN | List organisations |
| 7 | POST | /superadmin/organisations | SUPER_ADMIN | Create an organisation and its first ADMIN in one step |
| 8 | PATCH | /superadmin/organisations/{orgId} | SUPER_ADMIN | Set status to ACTIVE or SUSPENDED. Needs ifVersion |
| 9 | POST | /superadmin/organisations/{orgId}/admins | SUPER_ADMIN | Add an ADMIN to an organisation |
| 10 | GET | /superadmin/audit | SUPER_ADMIN | Audit events, filterable by orgId, actorId, action, from, to. Metadata only |
| 11 | GET | /superadmin/access-log | SUPER_ADMIN | Access events, same filters. Metadata only |
| 12 | GET | /admin/users | ADMIN | CLINICIAN accounts in own organisation |
| 13 | POST | /admin/users | ADMIN | Create a CLINICIAN |
| 14 | PATCH | /admin/users/{userId} | ADMIN | Disable, enable, or reset a CLINICIAN password. Needs ifVersion |
| 15 | GET | /admin/audit | ADMIN | Own organisation's audit events. Metadata only |
| 16 | GET | /admin/access-log | ADMIN | Own organisation's access events. Metadata only |
| 17 | GET | /patients | CLINICIAN, PATIENT | Clinician: own org's patients. Patient: own record only |
| 18 | POST | /patients | CLINICIAN | Create a patient record in own organisation |
| 19 | GET | /patients/{patientId} | CLINICIAN (FULL or VIEW_ONLY), PATIENT (own) | Read a patient. Logged |
| 20 | PATCH | /patients/{patientId} | CLINICIAN (FULL) | Update a patient. Needs ifVersion |
| 21 | POST | /patients/{patientId}/login | CLINICIAN (FULL) | Create the PATIENT login for a record |
| 22 | PATCH | /patients/{patientId}/login | CLINICIAN (FULL) | Disable, enable, or reset password. Needs ifVersion |
| 23 | POST | /patients/{patientId}/link-request | CLINICIAN (FULL) | Send a link request to the patient's login |
| 24 | POST | /link-requests/{linkId}/decision | PATIENT | Confirm or decline a link |
| 25 | GET | /patients/{patientId}/visits | CLINICIAN (FULL or VIEW_ONLY), PATIENT (own) | List visits. Logged |
| 26 | GET | /patients/{patientId}/medications | CLINICIAN (FULL or VIEW_ONLY) | Full timeline, including superseded entries. Logged |
| 27 | GET | /patients/{patientId}/medications/patient-view | PATIENT (own), CLINICIAN (FULL or VIEW_ONLY) | Verified entries only. Logged |
| 28 | GET | /patients/{patientId}/comparison | CLINICIAN (FULL or VIEW_ONLY) | Compare two visits: leftVisitId, rightVisitId. Logged |
| 29 | GET | /patients/{patientId}/discrepancies | CLINICIAN (FULL or VIEW_ONLY) | Discrepancies, filterable by status. Logged |
| 30 | POST | /discrepancies/{discrepancyId}/decisions | CLINICIAN (FULL) | Record a review decision. Returns 201 |
| 31 | PATCH | /medications/{medicationId}/verification | CLINICIAN (FULL) | Set VERIFIED, REJECTED, or UNVERIFIED. Needs ifVersion |
| 32 | POST | /documents | CLINICIAN (FULL) | Upload a document. Returns 202 with a job ID |
| 33 | GET | /documents/{documentId} | CLINICIAN (FULL or VIEW_ONLY) | Document metadata and raw text. Logged |
| 34 | GET | /documents/{documentId}/extraction | CLINICIAN (FULL or VIEW_ONLY) | Extracted fields. EXTRACTION_PENDING until ready. Logged |
| 35 | GET | /extraction-jobs/{jobId} | CLINICIAN (FULL or VIEW_ONLY) | Job status |
| 36 | GET | /patients/{patientId}/audit | ADMIN (own org) | Audit events for a patient. Metadata only |
| 37 | GET | /patients/{patientId}/access-log | ADMIN (own org), PATIENT (own) | Access events for a patient. Metadata only |
| 38 | POST | /patients/{patientId}/migrations | CLINICIAN (destination), PATIENT (own) | Request a migration. Starts as PENDING_PATIENT_APPROVAL |
| 39 | GET | /patients/{patientId}/migrations | CLINICIAN (source or destination), PATIENT (own), ADMIN (metadata) | Migration history |
| 40 | GET | /migrations/{migrationId} | CLINICIAN (source or destination), PATIENT (own), ADMIN (metadata) | Migration status |
| 41 | POST | /migrations/{migrationId}/decision | PATIENT (own) | APPROVE_FULL, APPROVE_VIEW_ONLY, or DECLINE. Needs ifVersion |
| 42 | POST | /patients/{patientId}/access-grants/{orgId} | PATIENT (own) | Set level to NONE, VIEW_ONLY, or FULL. Needs ifVersion |

**Logged** means an access event is written before the response is returned. If that write fails, the response is INTERNAL_ERROR (500).

## 5. Key request and response shapes

**Login request:** `{ "username": string, "password": string }`

**Login response:** `{ "accessToken", "tokenType": "Bearer", "expiresAt", "user" }`

**User:** `{ "id", "username", "displayName", "role", "status" (ACTIVE or DISABLED), "orgId" (null for SUPER_ADMIN), "patientId" (set for PATIENT only), "mustChangePassword" }`

**Patient signup:** `{ "username", "displayName", "password" (12 to 256 characters), "dateOfBirth" }`

**Create CLINICIAN (ADMIN):** `{ "username", "displayName", "password" }`

**Create organisation (SUPER_ADMIN):** `{ "name", "adminUsername", "adminDisplayName", "adminPassword" }`

**Create patient login (CLINICIAN):** `{ "username", "displayName", "password" }`

**Link request decision (PATIENT):** `{ "decision": "CONFIRM" or "DECLINE", "ifVersion" }`. The patient sees the record's displayName and dateOfBirth before confirming.

**Create migration (CLINICIAN or PATIENT):** `{ "reason" (optional, up to 1000 characters), "ifVersion" }`

**Migration decision (PATIENT):** `{ "decision": "APPROVE_FULL" or "APPROVE_VIEW_ONLY" or "DECLINE", "ifVersion" }`

**Access grant (PATIENT):** `{ "level": "NONE" or "VIEW_ONLY" or "FULL", "ifVersion" }`

**Review decision (CLINICIAN):** `{ "decision": "ACCEPT_LEFT" or "ACCEPT_RIGHT" or "KEEP_BOTH_FLAGGED" or "ESCALATE", "note" (3 to 2000 characters, required), "ifVersion" }`

**Verification (CLINICIAN):** `{ "verificationStatus": "VERIFIED" or "REJECTED" or "UNVERIFIED", "note" (optional), "ifVersion" }`

**Medication entry:**
- id, version, patientId, visitId, sourceDocumentId
- supersedesId (the earlier entry this one replaces, or null)
- medicineName (as written in the source)
- medicineKey (normalised, see section 6)
- strength: `{ "value": number, "unit": MG, MCG, G, ML, or IU }`
- form: TABLET, CAPSULE, LIQUID, INJECTION, PATCH, INHALER, or OTHER
- instructionText (verbatim from source, never edited)
- startDate, endDate (or null), prescriberName (or null)
- source: `{ documentId, page, quote, charStart, charEnd }`
- verificationStatus: UNVERIFIED, VERIFIED, or REJECTED
- createdAt

**Patient view item:** medicineName, status (VERIFIED or AWAITING_REVIEW), strength, form, instructionText (null when AWAITING_REVIEW), startDate, prescriberName, verifiedAt, sourceVisitDate.

**Discrepancy:** id, version, patientId, type (CONFLICT, MISSING, or DUPLICATE), field (strength, form, instructionText, startDate, endDate, or medicine), medicineKey, leftEntryId, rightEntryId, summary, status (OPEN or RESOLVED), detectedAt.

**Audit event:** id, orgId, patientId, actorId, actorRole, action, targetId, occurredAt, before, after, note.
Audit actions: ORGANISATION_CREATED, ORGANISATION_STATUS_CHANGED, USER_CREATED, USER_DISABLED, USER_ENABLED, USER_PASSWORD_RESET, PATIENT_CREATED, PATIENT_UPDATED, PATIENT_LOGIN_CREATED, PATIENT_LOGIN_DISABLED, PATIENT_LOGIN_ENABLED, PATIENT_LOGIN_PASSWORD_RESET, LINK_REQUESTED, LINK_CONFIRMED, LINK_DECLINED, MEDICATION_CREATED, MEDICATION_VERIFIED, MEDICATION_REJECTED, MEDICATION_UNVERIFIED, DISCREPANCY_DETECTED, DISCREPANCY_DECIDED, DOCUMENT_UPLOADED, MIGRATION_REQUESTED, MIGRATION_APPROVED, MIGRATION_DECLINED, MIGRATION_COMPLETED, MIGRATION_CANCELLED, ACCESS_GRANT_CHANGED.

**Access event (metadata only):** id, orgId, patientId, actorId, actorRole, resource (for example PATIENT, VISITS, MEDICATIONS, PATIENT_VIEW, COMPARISON, DISCREPANCIES, DOCUMENT, EXTRACTION, AUDIT, ACCESS_LOG), resourceId, occurredAt. It never contains clinical values.

## 6. Business rules

**Accounts and sessions**
1. Passwords are hashed with argon2id. Plaintext is never stored or logged.
2. Tokens are random 256-bit values, stored hashed, and expire after 8 hours. Logout revokes the token immediately.
3. Five failed logins within 15 minutes lock the account for 15 minutes.
4. Disabling a user revokes all of that user's tokens. Suspending an organisation revokes the tokens of all its users and blocks their login.
5. Patient signup is rate limited. Exceeding the limit returns RATE_LIMITED.
6. Accounts are created only by these roles: SUPER_ADMIN creates the first SUPER_ADMIN (seed script only) and ADMINs. ADMIN creates CLINICIANs. CLINICIAN creates PATIENT logins. Patients can also sign up themselves. No role can grant itself a higher role.
7. Every organisation always has at least one active ADMIN. Disabling the last one returns LAST_ADMIN_PROTECTED.
8. A disabled patient login can be re-enabled only by a CLINICIAN with FULL access in the same organisation.

**Tenancy and access**
9. Every query is filtered by organisation. Requests for data in another organisation return NOT_FOUND.
10. Access level is checked on every patient request. NONE returns NOT_FOUND. VIEW_ONLY returns FORBIDDEN on any write.
11. A patient can reach only their own record. Any other patient ID returns NOT_FOUND, not FORBIDDEN, so IDs cannot be guessed.
12. Patients never receive unverified entries, discrepancies, audit events, documents, or extraction output.
13. Only CLINICIANs with FULL access write clinical data, create patients, manage patient logins, and send link requests.

**Logging and audit**
14. Every clinical read writes one access event before the response is returned. If the write fails, the read fails with INTERNAL_ERROR.
15. Reading any audit or access log is itself logged.
16. ADMIN and SUPER_ADMIN responses are built from a fixed list of metadata fields. No medication, document, or extraction value may appear in them.
17. Audit `before` and `after` values are shown only for account, organisation, login, link, and migration actions. For medication, document, and discrepancy actions, both are null.
18. Each audit or access event is written in the same transaction as the change it records. If the event cannot be written, the change is rolled back.
19. Audit and access event tables are append-only. The application's database role can insert and read them, but never update or delete.

**Medication records**
20. Medication entries are never edited. A changed medication is a new entry with supersedesId pointing to the old one. Only verificationStatus changes after creation.
21. instructionText and source quotes are stored and shown exactly as written. Never trim, capitalise, reword, or summarise them.
22. Medicine key normalisation: lowercase, trim, collapse internal spaces, remove punctuation except hyphens, remove strength tokens (for example 5mg or 500 mcg), remove form words (tablet, tabs, capsule, caps, liquid, injection, patch, inhaler). Salt names are kept. "Metformin HCl 500 mg" becomes "metformin hcl". Matching is exact equality only.
23. Verifying a medication as VERIFIED is blocked with a conflict error while an OPEN CONFLICT or MISSING discrepancy involves that medicine and has no review decision.

**Extraction**
24. Extraction is rules-based and accepts only the SYN-RX-V1 template. Any other document is marked FAILED with a reason and is never guessed at.
25. Every extracted value needs a source span whose quote matches the raw document text exactly. Otherwise the value is rejected.

**Discrepancies**
26. Three types only:
- CONFLICT: the same medicineKey on two visits with a different strength, form, or instruction, in the same date window.
- MISSING: a medicine on one visit's list that is absent from a later visit's list with no recorded stop. The entry is flagged, not removed.
- DUPLICATE: the same medicineKey listed twice on one visit with the same strength and form.
27. Nothing is resolved automatically. Each resolution needs a review decision with a note of at least 3 characters.

**Patient view**
28. Shows only the latest VERIFIED entry for each medicine, with verbatim instruction text.
29. Medicines not yet verified appear as AWAITING_REVIEW with no instruction text.
30. Every patient view response includes this notice: "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine."

**Migration**
31. A migration needs a linked, active PATIENT login.
32. Only one open migration can exist per patient at a time.
33. Deciding on a migration that is no longer pending returns MIGRATION_NOT_PENDING.
34. On approval, one transaction runs: the patient moves to the destination organisation, the destination gets FULL access, and the source gets VIEW_ONLY (for APPROVE_VIEW_ONLY) or NONE (for APPROVE_FULL). The migration is marked COMPLETED and audit events are written to both organisations. If any step fails, everything rolls back.
35. Migration does not copy data. The patient keeps the same ID and the same records.

## 7. Configuration

- `DATABASE_URL`: Neon PostgreSQL with SSL required. Stored only in each developer's `.env`, which is never committed. The repo contains `.env.example` only.
- `TOKEN_TTL_HOURS=8`
- `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`: used once by the seed script, then removed from the environment.
- The seed script refuses to run when `ENVIRONMENT=production`.

## 8. Fixtures (synthetic data)

Fixtures live in `fixtures/`. They contain no real people and no passwords.

- **Organisations:** org_north (Northside Clinic, synthetic), org_riverside (Riverside Health, synthetic).
- **Users:** admin.north, admin.riverside (ADMIN), dr.north, dr.riverside (CLINICIAN), alex.example (PATIENT, linked to pat_001), sam.signup (PATIENT, unlinked).
- **Patients:** pat_001 Alex Example (North, linked login, visits at both organisations, migration pending to Riverside). pat_002 Morgan Sample (Riverside, no login). pat_003 Jordan Test (North, no login, clean record).
- **Documents:** the raw text files doc_001a, doc_001b, doc_001c, doc_002a, doc_003a are in `fixtures/documents/`. The template is `fixtures/templates/SYN-RX-V1.md`.
- **Expected discrepancies:** `fixtures/expected/discrepancies.json` lists exactly four results for pat_001: a DUPLICATE for amlodipine on vis_001b, a CONFLICT for amlodipine strength between vis_001a and vis_001b, a MISSING for atorvastatin on vis_001b, and a MISSING for amlodipine on vis_001c. pat_003 produces none.

## 9. Required tests

- Tenant isolation: admin or clinician from org_north gets NOT_FOUND for pat_002.
- Admin metadata: no clinical field appears in any ADMIN or SUPER_ADMIN response.
- Discrepancies: the fixtures produce exactly the four expected results, and pat_003 produces zero.
- Audit rollback: if the audit write fails, the underlying change is not applied.
- Contract conformance: every response matches the shapes in section 5.

## 10. Rules for changing the contract

- The contract is frozen at v1.3.0. Changes are additive only (new optional fields or new endpoints).
- Every change is recorded in `CHANGELOG.md` and approved by both members.
- If frontend and backend disagree, this document is the authority. The side that deviates is wrong.

## 11. Additive decisions in v1.3.1

The project owner authorized these implementation decisions on 2026-11-05. Share this version and generated openapi.yaml with Member 1; no approval from Member 1 is claimed here.

### Workflow additions

- `POST /patients/{patientId}/visits`: CLINICIAN with FULL only. Body `{ "visitDate": "YYYY-MM-DD", "ifVersion": patientVersion }`. Returns 201 with id, version, patientId, orgId, visitDate. Increments patient version. Emits VISIT_CREATED in the same transaction. Visit creation does not represent a completed medication list and does not run discrepancy detection by itself.
- `POST /documents` adds optional multipart fields `supersedesId` and `supersedesIfVersion`. Supply both to replace an entry. The document must extract exactly one medication with the same medicineKey. The old entry must belong to this patient, match its version, and have no replacement yet. The new entry has supersedesId pointing to it and starts UNVERIFIED. The old entry is unchanged. A competing replacement returns VERSION_CONFLICT. Invalid replacement content rolls back the entire upload; unsupported template content still produces a FAILED job without replacing anything. The normal upload fields are patientId, visitId, ifVersion (patient version), file. Successful upload attempts increment patient version; fetch the patient again before another update.
- `GET /link-requests`: PATIENT only, paginated invitations addressed to the authenticated login. Each includes id, version, userId, displayName, dateOfBirth, and status. Decisions are CONFIRM/DECLINE. Statuses are PENDING/CONFIRM/DECLINE.
- `GET /patients/{patientId}/access-grants`: own PATIENT or accessible CLINICIAN. Paginated id, version, orgId, patientId, level. This supplies versions for patient controls. When creating a previously absent grant, ifVersion is the patient version; otherwise it is the grant version.
- `GET /organisations`: authenticated PATIENT or CLINICIAN. Paginated ACTIVE organisation metadata (id, version, name, status), for selecting migration destinations. Contains no accounts or clinical data.
- `POST /migrations/{migrationId}/cancel`: own PATIENT, body `{ "ifVersion": migrationVersion }`. Pending migrations become CANCELLED without changing grants or ownership. Emits MIGRATION_CANCELLED to source and destination. Completed/declined/cancelled requests return MIGRATION_NOT_PENDING. To revoke access after completion, use access-grant controls.
- `GET /superadmin/organisations/{orgId}/admins`: SUPER_ADMIN, paginated user metadata for that organisation's ADMIN accounts.
- `PATCH /superadmin/organisations/{orgId}/admins/{userId}`: SUPER_ADMIN, same versioned account patch body as clinician management. Last active ADMIN protection is enforced under an organisation lock.
- VISIT_CREATED is added to the audit action list; its before/after are null.

### Settled wire conventions

- Every mutable response includes version. Password change uses currentPassword, newPassword, ifVersion. Account patches accept status and/or password; reset revokes tokens and forces a password change.
- Patient create/update fields are displayName and dateOfBirth. A link request body is `{ "username": patientLoginUsername }`; the path identifies the clinical patient record. Patient self-signup initially creates an unlinked login.
- Patient-initiated migration adds destinationOrgId. A clinician-initiated request always targets the caller's organisation. Known-ID destination migration requests are a narrow exception to pre-existing clinical access; no clinical content is returned. The patient must supply the current record version if the destination does not have read access.
- SYN-RX-V1 is the strict UTF-8 line template in fixtures/templates/SYN-RX-V1.md. Uploads are limited to 2 MB. Extraction completes in the upload transaction, with a pollable terminal job. Source offsets are zero-based, half-open Unicode character indexes into rawText. Instruction and quote whitespace is significant.
- Discrepancy detection compares consecutive visit lists, collapses duplicate conflict findings per medicine/field, and uses inclusive date-window overlap. Superseded entries remain in the timeline. A replacement within the same visit excludes the earlier version from new detection; earlier-visit snapshots still participate in comparisons. Visits without a successful extraction are not treated as completed medication lists. Existing discrepancies are never automatically resolved.
- ACCEPT_LEFT/ACCEPT_RIGHT resolve the reviewed discrepancy. KEEP_BOTH_FLAGGED/ESCALATE retain OPEN but record a review decision. Decisions never alter medication values. Verification blocking uses VERSION_CONFLICT (409).
- Patient view uses the most recently created VERIFIED entry per medicine. Without a verified entry, the latest non-rejected entry is AWAITING_REVIEW, with null instructionText. Tie-breaker is entry ID. Every response includes the section 6 notice.
- Signup permits five attempts per client IP per fifteen minutes; lockout returns RATE_LIMITED. Metadata allowlists exclude free-text migration reasons and clinical audit notes.

### Neon configuration

Runtime DATABASE_URL uses the restricted clyra_app role and a pooled SSL connection in backend/.env. MIGRATION_DATABASE_URL uses a direct owner connection in backend/.env.migrations, loaded only by Alembic. Both files and local development login files are gitignored. The runtime role cannot update, delete, truncate, or own event tables and has no privileged memberships. A database trigger also protects immutable medication content.


## 12. Frontend integration addition

GET /patients/{patientId}/login is available to CLINICIAN with FULL access, returning UserOutput metadata and its current version. It writes a PATIENT_LOGIN access event. Missing/inaccessible records return NOT_FOUND. This additive integration change is documented in CHANGELOG.md; it does not change existing endpoints.
