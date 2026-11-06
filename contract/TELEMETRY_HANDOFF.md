# Member 2 handoff: TR-1.0

The owner-approved [telemetry contract](TELEMETRY_TR_1_0.md) is additive to v1.3.1. Its wire shapes are exported in [openapi.yaml](openapi.yaml). Existing medication discrepancy enums and workflows are separate from telemetry findings.

## Member 1 integration

Fetch the shared backend branch before generating types or validating mocks:

```powershell
git fetch origin
git switch --track origin/codex/member2-telemetry-tr1
```

If you already have a frontend branch, keep your work there and integrate this backend branch through the agreed merge order (backend/shared contract first, frontend second). Do not run the switch command over uncommitted frontend work.

Regenerate frontend API types using the existing frontend generator against `contract/openapi.yaml`. Member 2 does not edit frontend application files or generated frontend types.

All four operations use the existing `/api/v1` base and Bearer authentication:

| Operation | Request | Success |
| --- | --- | --- |
| `POST /patients/{patientId}/telemetry/sessions` | `{requestId: UUID}` | Session, 201; creation replay, 200 |
| `POST /patients/{patientId}/telemetry/sessions/{sessionId}/readings` | `{readings: ReadingInput[]}` | acceptedCount, duplicateCount, serverTime, 200 |
| `POST /patients/{patientId}/telemetry/sessions/{sessionId}/stop` | `{ifVersion: integer}` | Session, 200 |
| `GET /patients/{patientId}/telemetry/snapshot` | optional sessionId query | Snapshot, 200 |

Use the backend's flags, source states, findings and summary directly. New readings require FULL access. VIEW_ONLY clinicians can fetch snapshots. Other roles receive FORBIDDEN; clinicians without a grant receive NOT_FOUND. Authentication/account failures use the extension's error codes.

Snapshots always include nullable fields and arrays. Null values are missing values. No session returns the exact empty snapshot specified in TR-1.0. The source order is SENSOR_A then SENSOR_B; observation order is measured time, receipt time, then ID. All emitted timestamps are UTC with a trailing Z.

The eight files in `fixtures/telemetry/` contain empty, healthy and six fault examples. Nonempty examples include a creation request, session response, ingestion exchanges ordered by receipt time, and a snapshot. Delayed exchanges preserve the original measurement times. Examples can trigger multiple codes. Finding counts count finding objects; one conflicting pair counts once. These examples contain synthetic data only.

Run from `backend/` to reproduce the shared artifacts:

```powershell
.venv\Scripts\python -m scripts.export_openapi
.venv\Scripts\python -m scripts.export_telemetry_examples
```

## Storage and verification

Migration `0004` adds `telemetry_sessions` and `telemetry_observations`. It adds unique creation/event indexes and patient/session/source/time lookup indexes. Runtime observation access is SELECT/INSERT; a PostgreSQL trigger rejects updates, deletes and truncation, including privileged direct SQL. Existing migration files and fixture data are unchanged.

The existing patient-row lock is acquired before session work, including snapshots. On PostgreSQL this serializes telemetry creation, ingestion and stopping against each other and existing patient/grant/migration changes. Raw readings persist unchanged; flags are recomputed at one captured snapshot time. No telemetry operation increments existing patient, medication, visit or grant versions.

Ingestion audits record accepted/duplicate counts only, together with existing identifiers and actor metadata. Audit failure rolls back writes. Snapshots and idempotent reads create TELEMETRY access events. Admin log serialization strips clinical content.

Run the full isolated local suite from `backend/`:

```powershell
.venv\Scripts\python -m pytest -q
```

The suite uses test-only SQLite databases. Migration coverage upgrades an isolated pre-telemetry schema from 0003 to 0004 and verifies existing records and new indexes. API tests cover idempotency, atomicity, closure, capacity, role/grant restrictions, migration, audits and validation. Engine tests cover the shared scenarios and rule boundaries. SQLite does not verify PostgreSQL row-lock concurrency or PostgreSQL runtime grants/triggers.

## Remaining integration checks

The implementation is local; migration 0004 has not been applied to the configured Neon development branch. Its recorded revision remains 0003. Before real-API integration, run migration 0004 on an isolated PostgreSQL development/test branch using the existing direct migration connection workflow; run the application with its restricted runtime connection. Verify concurrent creation/ingestion/stop, runtime grants and observation mutation rejection there. Do not reset or delete existing data.

Member 1 still owns the real-browser synthetic controller, accessible Observations UI, frontend generation and keyboard/screen-reader/integration demonstration. Local backend test results do not establish browser accessibility or end-to-end completion.

## Secure configuration handoff

No environment files or credentials are included in this telemetry change. Member 1 can generate types and use the synthetic JSON examples without database credentials.

For real-API integration, privately share the reachable backend API base URL and agreed synthetic CLINICIAN development login credentials. Localhost URLs work only when the backend runs on Member 1's own machine. Login returns the Bearer token; do not commit or distribute saved tokens.

Member 1 does not need the Neon management key, migration-owner connection, runtime database URL or `.env.development-logins` file to call a hosted backend. Keep those with the backend operator. If Member 1 also needs to run the backend, provision a separate restricted development database connection and share it through your chosen secure channel; keep its local environment file untracked. The migration owner runs Alembic with the separate direct migration connection. Never put an owner connection or database secrets into frontend environment variables or client bundles.

Use the existing frontend development proxy, or configure the backend's exact permitted frontend origin locally for a separate-origin setup. Do not share entire environment files in GitHub issues, pull requests or chat logs.
