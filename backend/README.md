# Member 2 backend

TR-1.0 telemetry implementation and Member 1 integration guidance: [telemetry handoff](../contract/TELEMETRY_HANDOFF.md). Migration `0004` adds telemetry storage; apply it with the existing direct migration connection before running the new endpoints. The recorded Neon development revision below remains `0003` until that upgrade is performed. Run `.venv\Scripts\python -m scripts.export_telemetry_examples` to regenerate the eight shared examples; no database connection is required.

The current contract is v1.3.1. For Neon, use a dedicated development branch and database. The setup tool retrieves credentials without printing them, creates a restricted SQL role, writes separate runtime/owner env files, and applies Alembic:

```powershell
# From the repository root, once:
.\.tools\neon\node_modules\.bin\neon.cmd login
# Then from backend/, using the selected exact project and development branch IDs:
.venv\Scripts\python -m scripts.setup_neon --project-id PROJECT_ID --branch-id BRANCH_ID
.venv\Scripts\python -m scripts.bootstrap_dev
.venv\Scripts\python -m scripts.verify_neon
```

`backend/.env` contains the pooled restricted runtime URL. `backend/.env.migrations` contains the direct owner URL, loaded only by Alembic. `backend/.env.development-logins` contains randomly generated synthetic login passwords. All three are gitignored. Setup refuses to overwrite existing connection credentials or rotate an existing runtime role.

FastAPI, SQLAlchemy, Alembic, argon2id. Synthetic data only. Read [the contract](../contract/CONTRACT.md) and [integration proposals](../contract/IMPLEMENTATION_NOTES.md) before integration.

From PowerShell in `backend/`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Set DATABASE_URL locally; never paste or commit credentials.
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m scripts.seed --dev-password
.venv\Scripts\python -m uvicorn app.main:app --reload
```

API: `http://127.0.0.1:8000/api/v1`. Interactive schemas: `/docs`. Generate the frontend schema with `python -m scripts.export_openapi`. The generated specification describes implemented conventions; it does not constitute approval of a contract change.

Database setup: provision a separate non-owner `clyra_app` role with login in Neon. Run Alembic with an owner connection in DATABASE_URL and APPLICATION_DB_ROLE set to that runtime role. Migration 0002 refuses a missing, superuser, CREATEROLE, or table-owner runtime role. Switch DATABASE_URL to the runtime role after migrating. SSL is required; `sslmode=verify-full` is also accepted. No database or credentials are bundled.

The second migration grants runtime INSERT/SELECT on event tables and revokes other privileges; mutation triggers provide additional protection. Do not give the runtime role memberships that inherit table-owner or privileged roles. Provisioning users and passwords is an operator task, outside committed migrations. Live Neon privilege/trigger checks passed on the development branch on 2026-11-05. Local tests use SQLite; PostgreSQL concurrency under production load is not covered by those tests.

Seeding is idempotent and refuses production. The `--dev-password` flag prompts securely for a development fixture password; fixtures contain no passwords. Optional SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD create the platform owner with a forced password change; remove them after use. Seed on a fresh development database, not a production database.

```powershell
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m scripts.export_openapi
```

Tests cover all seven required groups plus session security, login lockout, signup throttling, source preservation, unsupported extraction, pagination, optimistic concurrency, and seed restrictions. SQLite is allowed only with ENVIRONMENT=test. The app does not auto-create production tables.

Visit creation, source-backed replacements, migration cancellation, and ADMIN management are specified in contract v1.3.1. CORS is intentionally not opened globally; use the frontend development proxy or configure an explicit allowed origin before separate-origin browser integration. Extraction is synchronous and bounded; the job endpoint returns a terminal result after upload. This implementation is a development baseline, not a deployment sign-off.

If browser sign-in cannot reach the localhost callback, create a Neon API key in the Console and save it as NEON_API_KEY in the repository-root .env.neon file (gitignored). The setup script passes it to the CLI without printing it. Prefer a project-scoped key when available. The management key is not loaded by the FastAPI app.

## Configured development database

Verified on 2026-11-05: project my-first-project, branch clyra-backend-dev, database clyra, Singapore region (aws-ap-southeast-1). Production was left unchanged. Alembic revision 0003 is applied. See neon-development.json for non-secret IDs and completed checks.

Synthetic fixture usernames: admin.north, admin.riverside, dr.north, dr.riverside, alex.example, sam.signup. Their shared development password is FIXTURE_PASSWORD in .env.development-logins. The platform owner username/password are stored separately in that file and require a password change at first login. Do not share that file or either database env file with Member 1; share the API URL and agreed development account credentials through your chosen private channel.

Start locally from backend/ with `.venv\Scripts\python -m uvicorn app.main:app --reload`. API documentation is available at http://127.0.0.1:8000/docs after startup.
