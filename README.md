# Clyra

Medication continuity and safe handover. Synthetic development data only.

This repository contains the current React/Vite frontend and FastAPI backend, including telemetry, migrations, runtime scripts, and shared fixtures. Tests, environment files, credentials, installed dependencies, and generated build outputs are excluded.

## Run on a new Windows PC with the existing Neon database

Use the **exact same existing Neon development database** as the current installation. You will receive its existing restricted runtime connection credentials and application account credentials privately. Do not create a database, run migrations, seed fixtures, bootstrap accounts, or reset passwords as part of this setup.

Install Node.js 22.12+ (or a newer supported LTS), Git, and Python 3.11. Then run in PowerShell:

```powershell
git clone https://github.com/joshuakevin612/Clyra.git
cd Clyra
npm --prefix frontend ci
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
```

Create `backend/.env` locally using the privately supplied existing runtime configuration. This file is intentionally absent from the repository. Its required settings are:

```dotenv
DATABASE_URL=postgresql+psycopg://APP_USER:PASSWORD@EXISTING_POOLED_HOST/EXISTING_DATABASE?sslmode=require
ENVIRONMENT=development
```

The URL above is a placeholder: use the supplied exact existing pooled connection URL, with the restricted application role. Do not use owner credentials or a Neon management API key for the application. No migration connection or migration environment file is needed to run against the already configured database. You may securely copy the current installation's `backend/.env` to the same relative path on the new PC instead of entering it manually. Never commit it.

Start both services from the repository root:

```powershell
npm run dev:neon
```

- Frontend: http://127.0.0.1:5177
- Backend API: http://127.0.0.1:8001/api/v1
- Interactive API documentation: http://127.0.0.1:8001/docs

The launcher starts the real frontend and backend and configures the frontend API proxy automatically. A frontend environment file is unnecessary. Sign in with the **existing database's application account credentials**, provided privately. The local demo password does not apply to these accounts.

Keep the terminal running. Press **Ctrl+C** to stop both services. On later runs, open PowerShell in the cloned `Clyra` folder and run `npm run dev:neon` again. Virtual environment activation is unnecessary.

All connected PCs share the same database: application changes are visible to other users and persist after restarting the servers.

## Connection troubleshooting

If the frontend loads but sign-in or data access fails, inspect the backend terminal. The local servers can start even when the database is unreachable. The new PC must be able to resolve the existing Neon hostname and connect outbound on PostgreSQL port **5432**; HTTPS access on port 443 alone does not establish database connectivity. Check VPN, firewall, network, and database access settings when connections time out. On 6 November 2026, the current PC resolved the Neon hostname and reached HTTPS but timed out on both pooled and direct PostgreSQL connections.

If port 5177 or 8001 is occupied, stop the previous Clyra server before restarting.

## Optional isolated local demo

After installing dependencies, this command runs the same frontend and backend with a temporary SQLite fixture database, independently of Neon:

```powershell
npm run dev:integrated
```

Open http://127.0.0.1:5177. The backend runs on port 8000, with docs at http://127.0.0.1:8000/docs. Sign in with `dr.north` / `Clyra-demo-2026`. This mode does not connect to the shared Neon database; its data resets when the backend restarts. Stop the running mode before switching modes.

For a frontend-only simulation without FastAPI, use `npm run dev:mock` and open the URL printed by Vite. Its browser data resets on page reload.

## Production frontend build

```powershell
npm run build
```

Output is generated in `frontend/dist`. The development launcher is not a production hosting configuration. Production hosting must proxy `/api/v1` to FastAPI or configure an explicit API base URL and backend CORS origins.

## Source layout

- `frontend/`: React interface, API client, telemetry UI, and mock mode.
- `backend/app/`: FastAPI application and database models.
- `backend/alembic/`: existing schema migrations, retained for maintenance; do not run them during new-PC setup against the shared database.
- `backend/scripts/`: launch support, fixtures, and maintenance tools.
- `scripts/dev-integrated.mjs`: starts both services in Neon or isolated mode.
- `fixtures/`: synthetic shared application data and telemetry examples.
- `contract/`: API contract and integration documentation.
