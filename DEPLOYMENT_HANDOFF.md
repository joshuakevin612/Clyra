# Member 2 backend deployment and operations handoff

2026-11-06. **Stage 1 remains pending. Nothing is deployed and no hosted backup
schedule is active.** Member 1 owns Stage 2 after the shared gate passes and the
user requests deployment. Actual results are in `MEMBER_2_STAGE_1_REPORT.md`.

## Package and launch

Vercel project root: `backend`. ASGI app: `app.main:app`. Vercel discovery entry:
`backend/index.py`, exporting app. `.python-version` requests Python 3.14. Pinned
dependency installation, pip check and all 17 local tests passed on Python 3.14.5;
the suite also passed on Python 3.11.4, including the real Neon database.
Startup does not run migrations, seeds, backups or schedules.

From repository root:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
npm run test:backend
npm run contract:check
```

From `backend`, launch locally with
`python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`.
No backend build command is required. Vercel's requirements.txt includes the same
pinned lock file. Do not deploy scripts.integration_app:app (SQLite fixtures).
Configuration follows the official [FastAPI guide](https://vercel.com/docs/frameworks/backend/fastapi)
and [Python runtime guide](https://vercel.com/docs/functions/runtimes/python).
No Vercel build or project was created/validated here.

## Environment variables

| Name | Purpose and location | Secret? |
| --- | --- | --- |
| DATABASE_URL | API: pooled restricted-role Neon PostgreSQL URL with TLS | Yes |
| ENVIRONMENT | API: production when hosted; test only for isolated fixtures | No |
| APPLICATION_DB_ROLE | API/migration worker: clyra_app unless provisioned otherwise | No |
| CORS_ORIGINS | Optional comma-separated explicit frontend origins; no wildcard | No |
| DB_POOL_SIZE | API connections per process, default 2 | No |
| DB_MAX_OVERFLOW | API extra connections per process, default 0 | No |
| MIGRATION_DATABASE_URL | Migration worker: direct owner TLS URL | Yes |
| BACKUP_DATABASE_URL | Backup/recovery worker: direct source TLS URL with dump access | Yes |
| RESTORE_DATABASE_URL | Recovery worker: owner TLS URL on a separate empty host | Yes |
| BACKUP_AGE_RECIPIENT | Backup worker: public age recipient | No |
| BACKUP_AGE_IDENTITY_FILE | Recovery worker: path to protected private age identity | Path no; contents yes |
| BACKUP_OUTPUT_DIR | Backup worker: protected encrypted staging directory | No |
| BACKUP_REMOTE | Backup worker: configured rclone remote and object prefix | No; remote configuration has secrets |
| BACKUP_MONITOR_URL | Backup worker: external dead-man monitor success endpoint | Yes |
| CLYRA_PYTHON | Optional root-script Python executable override | No |

Templates: backend/.env.example, .env.migrations.example, .env.operations.example.
Existing runtime credentials are in the owner's ignored backend/.env. Member 1
obtains them through the owner/approved secret manager or the existing Neon
project's authorised connection screen. Obtain migration-owner/backup credentials
separately. Never paste values into chat, reports, git, logs or frontend bundles.
The ignored backend/.env.stage1* files contain only isolated verification credentials;
it is not a production credential source. Export operation variables securely into
the worker environment; .env.operations examples are not automatically loaded.

Canonical synthetic database: `clyra`, branch `br-frosty-cloud-a1h9326y`, project
`calm-dream-97416878`. The default neondb is a different database. No canonical
migrations, resets or seeds were performed. Preview/test URLs must explicitly
target isolated branches and never inherit canonical fallback configuration.

Production URL policy requires a pooled Neon host and APPLICATION_DB_ROLE
identity. Provision that role with NOSUPERUSER, NOCREATEROLE, NOCREATEDB,
NOREPLICATION, NOBYPASSRLS, no memberships, no object ownership and no schema
CREATE. Owner credentials must not be installed in FastAPI. Tenant/patient
authorization is enforced by the application; PostgreSQL RLS is not claimed.

## Migrations and checks

Required revision: **0005**; canonical remains at 0004. db:check intentionally
requires 0005 and will fail before migration; use owner Alembic current for the
pre-migration revision check.

1. Complete isolated API/browser/recovery acceptance first.
2. Take and independently verify an encrypted canonical pre-migration backup.
3. Verify target database, current revision, reviewed DDL and separate credentials.
   Preserve the old application artifact and recovery point.
4. Export MIGRATION_DATABASE_URL/APPLICATION_DB_ROLE in the migration worker,
   or securely populate backend/.env.migrations. Run `npm run db:migrate`.
   Runtime credential fallback is forbidden. Pooled migration hosts are rejected.
5. From backend, `python -m alembic current` must report 0005. Run `npm run db:check`
   using runtime credentials; verify role flags, memberships, ownership, table
   grants, protection triggers, schema revision, FKs, source spans and hashes.
6. Run authenticated smoke and record results before routing frontend traffic.

0005 adds external_imports and request/content uniqueness, protects import and
document sources, makes discrepancy decisions append-only, and grants runtime
SELECT on schema revision. It deletes no records and creates no users. Trigger
and index DDL can briefly block writes; use an agreed maintenance window.
PostgreSQL migrations are transactional. Review contract/migration-0005-review.json;
deploy with Alembic. backend/sql/ei10_integrity_probe.sql is isolated-test-only.

## Connections, routes and health

SQLAlchemy defaults: pre-ping, pool size 2, overflow 0, checkout timeout 10s,
recycle 300s, connect timeout 15s; budget connections across all Vercel processes.
Automatic prepared statements are disabled for transaction pooling compatibility:
[Psycopg documentation](https://www.psycopg.org/psycopg3/docs/advanced/prepare.html).
Use pooled runtime connections and direct migration/dump/restore connections.

Frontend Vercel root: frontend. Proxy same-origin `/api/v1/*` unchanged to the
backend before SPA fallback. Deep links must reach frontend index; API requests
must not. Preserve `Cache-Control: no-store, private` and prohibit CDN clinical
caching. No database URL belongs in VITE_* variables. Preview and production
proxy targets/secrets must be separate. `/health` is checked on the backend
origin, separately from the frontend /api/v1 proxy.

GET /health returns only `{"status":"ok"}`; it is liveness, not database readiness.
Use a designated synthetic CLINICIAN account for the authenticated check:

```powershell
npm run smoke:backend -- --base-url https://BACKEND_ORIGIN --username SYNTHETIC_USERNAME
```

The script securely prompts for the password, holds tokens in memory, checks
health/login/auth-me/patients/no-store/logout/revocation, and logs no bodies.
It intentionally leaves session/access evidence; do not delete that trail.
Import/source/comparison acceptance follows docs/INTEGRATION.md on isolated data.

## Encrypted backups and recovery

No schedule is active. The external worker needs Python/pinned backend packages,
PostgreSQL clients matching or newer than the source server major, age, rclone,
protected remote credentials and outbound database/TLS access. Do not run jobs
inside FastAPI. The backup role needs dump SELECT/schema access; restore needs
separate owner credentials and a pre-provisioned restricted application role.

Prepared schedule: daily **02:00 UTC (07:30 Asia/Calcutta)**. In Stage 2, install
worker secrets in the scheduler and run `npm run db:backup-job`. It streams
pg_dump custom format into age encryption, publishes an encrypted .dump.age and
SHA-256 manifest, uploads both through rclone, then signals the monitor. No
plaintext dump is written to disk. Failures return nonzero and send no success
signal. Use the public recipient on the backup worker and store the private
identity separately for recovery. Configure object versioning/access restrictions,
at least 30 successful daily archives, and capacity for those dumps plus growth.

Configure the external monitor to alert the operator when no success arrives
within 26 hours; enable scheduler failure notifications too. Install real alert
recipients and test a failure notification in Stage 2. Runner/storage/rclone
credentials/retention/monitor accounts are prerequisites, not provisioned services.

With worker environment securely exported, from root:

```powershell
npm run db:backup -- --file /secure/backups/pre-migration.dump.age
npm run db:verify-backup -- --file /secure/backups/pre-migration.dump.age
npm run db:restore -- --file /secure/backups/pre-migration.dump.age --confirm-database clyra_restore
```

Use OS-appropriate absolute paths. Verification requires the private age identity;
it checks checksum, every age authentication tag and the custom-format header.
Semantic validation requires an actual restore. The target must be a newly
provisioned isolated branch, with empty public schema and a different host.
Restore checks the target database confirmation, streams decryption into
pg_restore --single-transaction --exit-on-error --no-owner --no-acl, reapplies
reviewed runtime grants with owner credentials, then checks schema/tables/FKs,
medication spans and external-evidence hashes/association. Restored objects
belong to the recovery owner, never the runtime role.

Then run db:check with the restored pooled runtime URL, authenticated smoke and
import/source/comparison acceptance. Compare counts with the frozen drill source.
Record the actual outcome; repeat weekly on a recovery runner after activation.
Investigate failed restores on their isolated target. Never use --clean on
canonical or reset/reseed it. Keep archive and manifest together.

## Rollback

If migration fails transactionally, stop and verify that 0004 and its integrity
remain before retrying. After 0005 commits, downgrade is deliberately blocked
because it would destroy immutable evidence. Roll back the application artifact
while retaining additive schema only after verifying old-app compatibility;
disable import writes until corrected.

For data recovery, stop writes, preserve the affected database/audit trail,
restore a verified archive into a new branch, validate, deliberately switch
runtime configuration and redeploy. Operator approval is required because
post-backup writes are absent and require reconciliation. Never delete immutable
evidence as rollback. Daily backups alone permit up to 24h loss; Neon recovery
history/desired window and plan must be verified separately in Stage 2.

## Pending gates and prerequisites

Member 2's direct PostgreSQL, actual Alembic, restricted-role API, encrypted
restore and local runtime packaging checks passed; see the verification report.
Stage 1 still requires Member 1's generated types, complete frontend/backend
workflow and keyboard/focus/responsive/reduced-motion/manual screen-reader
outcomes. No Vercel deployment/build or live acceptance is claimed.

Stage 2: access to both Vercel projects, Neon/runtime/owner secrets, service plan
limits and recovery history, production secret installation, external backup
runner/storage/monitor and alert recipients, preview isolation, proxy/domain
configuration and hosted checks. None is claimed complete. Purchases require
user approval.
