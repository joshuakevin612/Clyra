# Changelog

## TR-1.0 — 2026-11-05

- Preserved the owner-approved telemetry extension and added Member 2 integration instructions, shared wire models, OpenAPI operations, and eight deterministic synthetic examples.
- Added persistent telemetry sessions and immutable observations in additive Alembic revision 0004, with idempotency and lookup indexes and restricted PostgreSQL runtime grants.
- Added creation, atomic batch ingestion, versioned stop and consistent snapshot APIs using existing authentication, current patient grants, audit rollback and TELEMETRY access logging.
- Added deterministic MISSING, SPIKE, REPEATED, FLUCTUATION, DELAYED and CONFLICT evaluation with source states, explanations and a plain-text synthetic handover summary.
- Integrated Member 2 commit c5d63cf with the existing frontend and earlier login/integration fixes; generated telemetry API types and checked all eight shared examples against MSW.
- Applied migration 0004 to the configured Neon development branch; verified restricted grants, immutable observation triggers, concurrent create/ingest/stop, audit rollback and unchanged clinical records.
- Passed 70 backend tests, 31 frontend tests, production build, all 11 browser checks, and persisted Neon browser review. Human screen-reader/zoom/high-contrast acceptance remains separate.

## v1.3.1 — 2026-11-05

- Configured Neon development branch clyra-backend-dev and clyra database; applied migrations through 0003 and seeded synthetic fixtures. Production branch unchanged.

- Passed live checks for client TLS, restricted runtime permissions, append-only logs, immutable medication content, HTTP login, tenant isolation, patient view, and audit rollback.

- Project owner authorized Member 2 to resolve the documented gaps. No independent Member 1 approval is claimed.

- Added versioned visit creation and source-backed immutable medication replacements.

- Added pending-migration cancellation, organisation discovery, and protected ADMIN management.

- Specified invitation/grant discovery and all previously provisional wire conventions in CONTRACT.md section 11; retained original endpoints.

- Added direct owner versus pooled runtime Neon configuration, setup/bootstrap/live verification tools, and database-level medication immutability.

- Regenerated OpenAPI with the additive operations and upload fields.

## Working implementation of v1.3.0

- Preserved the supplied frozen contract and member briefs.

- Created synthetic fixtures from its examples because reference fixture files were not supplied.

- Implemented backend routes and proposed two additive discovery GET endpoints.

- Recorded proposed conventions and unresolved interface gaps in contract/IMPLEMENTATION_NOTES.md. These are pending review by both members; no contract amendment has been approved.

# Integration additions

## 2026-11-05 — Patient login version discovery

Added GET /api/v1/patients/{patientId}/login, CLINICIAN with FULL access only. Returns existing UserOutput metadata for the linked patient login, including its current version. Missing and inaccessible logins return NOT_FOUND. The read writes a PATIENT_LOGIN access event. This additive integration change enables the existing versioned disable/enable/password-reset endpoint without guessing versions. No existing endpoint or payload changed. Implemented under the project owner's instruction to integrate and make necessary changes; no separate Member 2 approval is claimed.

Access-log action filters now match the resource field. Frontend date filters use explicit inclusive UTC day bounds. Source highlighting uses validated Unicode offsets, including repeated quotes.

## Neon connection verification — 2026-11-05

Recovered existing runtime and migration connections using the local management key, preserving roles and passwords. Connected the persistent app on local API port 8001, with frontend proxy selection through VITE_API_PROXY_TARGET. Verified TLS, runtime restrictions, append-only events, medication immutability, tenant isolation, patient notice, audit rollback, and signed-in browser reads for all four roles (platform password-change gate preserved). Secrets remain only in ignored local env files.


## Member 1 Stage 1 (2026-11-06)
- Session-preserving client-side navigation (home link, functional breadcrumbs, Back/Forward); no sign-out on navigation.
- Removed the yellow workspace ticker and the footer "Contract v1.3.1" label only.
- Mock mode is now opt-in (`VITE_API_BASE_URL=mock`); unset uses the real same-origin `/api/v1`.
- EI-1.0 "External imports" tab: stage, evidence review with exact-quote highlighting, explicit patient-identity confirmation. Types generated from Member 2's `contract/openapi.yaml`.
- `frontend/vercel.json` (SPA fallback, `/api/v1` proxy with placeholder backend origin, no-store API headers).
- Member 2's EI-1.0 backend/contract overlaid from branch `member2/ei-1.0-stage1`; their changelog is kept in `CHANGELOG.member2.md`. Pre-overlay copies are in `tmp/pre-ei-integration/`.
