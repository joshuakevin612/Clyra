# Member 1: Frontend

Read `contract/CONTRACT.md` fully before you write any code. It is the authority for every shape, status code, and rule. If anything here conflicts with it, the contract wins.

## Your scope

You build the user interface for all four roles: SUPER_ADMIN, ADMIN, CLINICIAN, and PATIENT. You consume the API. You never define your own data shapes.

## Setup

1. Create the app with Vite, React, and TypeScript in `frontend/`.
2. Install and use MSW (Mock Service Worker). Your mock handlers read from `fixtures/`, so you can build the whole UI before the backend exists.
3. Set the API base URL with `VITE_API_BASE_URL`. Use the mock when it is unset or set to `mock`.
4. Do not hand-write API types. Generate them from the contract once `contract/openapi.yaml` exists. Until then, write types only in `frontend/src/api/types.ts` and mark that file as temporary, to be replaced by generated types.

## Rules

1. **Show `instructionText` exactly as received.** No trimming, capitalising, rewording, or summarising. Display it in a quoted or monospace block.
2. **Never put medical advice in the UI.** No tooltips, summaries, or "what this means" text on medication data. No control that suggests changing a dose or stopping a medicine.
3. **Status must have a text label.** VERIFIED, UNVERIFIED, REJECTED, OPEN, RESOLVED, and AWAITING_REVIEW each show words, not colour alone.
4. **Handle every error code** listed in CONTRACT.md section 1:
   - VERSION_CONFLICT: show "This record changed. Reload to see the latest," with a reload button.
   - EXTRACTION_PENDING: poll `/extraction-jobs/{jobId}` until it finishes.
   - RATE_LIMITED: show a wait message.
   - ACCOUNT_DISABLED: log the user out.
   - FORBIDDEN, NOT_FOUND: show a clear message. Do not reveal whether a record exists.
5. **Token in memory only.** No `localStorage` or `sessionStorage`. Logout clears the token.
6. **Admin pages show metadata only.** ADMIN and SUPER_ADMIN screens must never display a medication, document, or extraction field. If one appears, treat it as a bug and do not render it.
7. **Patient view notice.** Show this on every patient view, unedited: "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine."
8. **Accessibility.** Every input has a label. Forms and tables work with the keyboard. On submit errors, focus moves to the first error message.
9. **Role checks in the UI are for usability only.** The backend enforces access. Handle every 403 and 404 without crashing.

## Screens

**Public**
- Login (with forced password change when `mustChangePassword` is true)
- Patient signup

**SUPER_ADMIN**
- Organisations list
- Create organisation (with its first ADMIN)
- Suspend or reactivate an organisation (needs version)
- Add an ADMIN to an organisation
- Platform audit log (metadata only, filterable)
- Platform access log (metadata only, filterable)

**ADMIN**
- CLINICIAN list for own organisation
- Create CLINICIAN
- Disable, enable, or reset a CLINICIAN password
- Organisation audit log (metadata only)
- Organisation access log (metadata only)

**CLINICIAN**
- Patient list
- Create patient
- Patient detail
- Create patient login
- Disable, enable, or reset a patient login
- Send link request (enter patient ID)
- Visit list
- Medication timeline (includes superseded entries, clearly marked as history)
- Comparison between two visits
- Discrepancy queue with decision form (ACCEPT_LEFT, ACCEPT_RIGHT, KEEP_BOTH_FLAGGED, ESCALATE, with note)
- Verify, reject, or unverify a medication entry
- Document upload, then extraction viewer that highlights `source.quote` inside the raw text
- Migration request (by patient ID)
- Migration status and history
- Access grant view (read only, showing each organisation's level)

**PATIENT**
- Patient view (verified entries, awaiting-review entries, required notice)
- Own access log
- Link request confirmation (show displayName and dateOfBirth, then confirm or decline)
- Migration approval (APPROVE_FULL, APPROVE_VIEW_ONLY, DECLINE)
- Access grant controls (NONE, VIEW_ONLY, FULL, each with version)

## Done when

- Every screen above works against the mock built from `fixtures/`.
- Logging in as each fixture user shows the correct screens only.
- Tenant check: logging in as dr.north and requesting pat_002 shows a clear "not found" message.
- No medication, document, or extraction field renders on any admin screen.
- No API type is hand-written beyond the temporary file.
- `instructionText` is verbatim in every place it appears.

---

# Member 2: Backend

Read `contract/CONTRACT.md` fully before you write any code. It is the authority for every endpoint, shape, error code, and rule.

## Your scope

You implement every endpoint and business rule. You are the enforcer. Every role check, tenant filter, access level check, access log write, and audit write happens here, never only in the frontend.

## Setup

1. Create the project in `backend/` with FastAPI, SQLAlchemy 2.x, Alembic, and argon2-cffi.
2. Connect to Neon PostgreSQL through `DATABASE_URL` with SSL required. Read it from `.env`. Commit only `.env.example`.
3. Write the first Alembic migration to create all tables. Write a second migration that restricts the application database role on `audit_events` and `access_events` to INSERT and SELECT only.
4. Build `backend/scripts/seed.py`. It loads everything in `fixtures/`, is idempotent, and refuses to run when `ENVIRONMENT=production`. The SUPER_ADMIN is created from `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`. Fixture users get passwords through a dev-only flag, which is never set in production.

## Build order

1. Medicine key normalisation, with unit tests.
2. Discrepancy detection. Run the fixtures and confirm the output matches `fixtures/expected/discrepancies.json` exactly. Do this before anything else.
3. Authentication: login, logout, `/auth/me`, change password, lockout.
4. Tenancy and access-level checks as a single reusable dependency, used on every patient route.
5. Clinical read endpoints, each writing an access event before returning.
6. Clinical write endpoints (CLINICIAN with FULL only), each writing an audit event in the same transaction.
7. Admin and SUPER_ADMIN endpoints, returning metadata allowlists only.
8. Migration and access-grant flows, including the transaction on approval.
9. Signup with rate limiting.

## Rules

1. **Passwords:** argon2id. Never store or log plaintext.
2. **Tokens:** random 256-bit, stored hashed, 8-hour expiry. Logout revokes at once.
3. **Lockout:** five failed logins in 15 minutes lock the account for 15 minutes.
4. **Disable and suspend revoke tokens immediately.** Disabling a user revokes that user's tokens. Suspending an org revokes all its users' tokens and blocks their login.
5. **Access checks on every patient route:** look up the caller's access level. NONE returns 404. VIEW_ONLY returns 403 on writes. A PATIENT calling any patient ID other than their own returns 404.
6. **Tenancy:** every query filters by org. Cross-org requests return 404.
7. **Access log:** every clinical read writes an access event before the response. If the write fails, return 500.
8. **Log reads are logged:** reading audit or access logs writes an access event.
9. **Admin responses are allowlists.** Build them from explicit field lists. Never return whole database rows for admin endpoints.
10. **Audit before and after:** populate only for account, organisation, login, link, and migration actions. Set both to null for medication, document, and discrepancy actions.
11. **Same-transaction writes:** every audit and access event is written in the same transaction as the change. A failed event write rolls back the change.
12. **Append-only tables:** `audit_events` and `access_events` have no update or delete path in the code.
13. **Medication entries are immutable.** A change creates a new row with `supersedesId`. Only `verificationStatus` changes later.
14. **Verbatim text:** `instructionText` and `source.quote` are stored and returned exactly as written.
15. **Extraction** accepts only the SYN-RX-V1 template. Non-matching documents become FAILED with a reason. Every extracted value needs a source span whose quote matches the raw text exactly, or it is rejected.
16. **Discrepancy types:** CONFLICT, MISSING, DUPLICATE only. Nothing is auto-resolved.
17. **Verification block:** VERIFIED is refused with 409 while an OPEN CONFLICT or MISSING involves that medicine and has no review decision.
18. **Patient view:** latest VERIFIED entry per medicine. Unverified medicines show as AWAITING_REVIEW with null instruction text. Include the required notice on every response.
19. **Migration:** requires a linked active PATIENT login. One open migration per patient. Approval is one transaction. Any failure rolls everything back.
20. **Last admin:** disabling the last active ADMIN in an org returns LAST_ADMIN_PROTECTED.
21. **Re-enabling a patient login** is allowed only for a CLINICIAN with FULL access in the same org.

## Database tables

organisations, users, sessions, patients, visits, organisation_patient_access, link_requests, record_migrations, documents, extraction_jobs, medication_entries, discrepancies, discrepancy_decisions, audit_events, access_events, login_attempts.

Every table with an org column gets an index on it.

## Tests you must write

1. **Discrepancies:** fixtures produce exactly the four entries in `fixtures/expected/discrepancies.json`. pat_003 produces zero.
2. **Tenant isolation:** dr.north gets NOT_FOUND for pat_002.
3. **Admin metadata:** no medication, document, or extraction value appears in any ADMIN or SUPER_ADMIN response.
4. **Audit rollback:** force the audit write to fail, then confirm the change was not applied.
5. **Contract conformance:** every response matches the shapes in CONTRACT.md section 5.
6. **Access-level enforcement:** VIEW_ONLY cannot write, and NONE returns 404 on reads.
7. **Migration approval:** approval moves the patient, sets both access levels correctly, and writes audit events to both orgs.

## Done when

- Every endpoint in CONTRACT.md section 4 exists and behaves as specified.
- All seven test groups above pass.
- The seed script runs twice without creating duplicates.
- `ENVIRONMENT=production` makes the seed script refuse to run.