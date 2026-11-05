# Clyra

Medication continuity and safe handover. Synthetic data only.

The React/Vite frontend is integrated with Member 2's FastAPI backend from https://github.com/joshuakevin612/Clyra. The working integrated code is in `backend/` and `frontend/`. The local reference checkout in `backend-source/` is excluded from the repository.

## Start

Install the frontend with `npm --prefix frontend install`. For a standalone browser demo, run `npm run dev:mock` and use the URL printed by Vite. MSW reads the shared `fixtures/`, simulates all UI workflows in memory, and resets on page reload. Demo accounts: dr.north, dr.riverside, admin.north, admin.riverside, alex.example, sam.signup, platform.demo. Demo password: `Clyra-demo-2026`. The platform demo requires a password change.

For the real API with an isolated fixture database:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
npm run dev:integrated
```

Open http://127.0.0.1:5177. The API runs at http://127.0.0.1:8000. The same development logins work here. This mode uses an ephemeral SQLite test database and never connects to Neon; restarting the API resets the data. Do not use it as a deployment configuration.

For Neon or another persistent backend, follow `backend/README.md` and configure `frontend/.env` with `VITE_API_BASE_URL=/api/v1`. Vite proxies `/api` to localhost:8000. No database credentials are bundled. Production hosting must proxy `/api/v1` to FastAPI or set the full API base URL with exact backend CORS origins.

## Contract and integration

`contract/CONTRACT.md`, `contract/IMPLEMENTATION_NOTES.md`, and `contract/openapi.yaml` are authoritative. API types are generated in `frontend/src/api/generated.ts`; run `python frontend/scripts/generate_types.py` after schema export (`.venv/Scripts/python.exe -m scripts.export_openapi` from backend). The generator requires PyYAML, included in backend dependencies.

One additive integration endpoint was necessary: GET `/api/v1/patients/{patientId}/login` exposes the linked login's current UserOutput metadata/version to FULL-access clinicians. It is access-logged, tenant checked, covered by tests, and documented in section 12 and CHANGELOG.md. Password changes revoke the session and return to sign-in. No clinical values can be edited directly; source-backed replacements remain separate, unverified entries in history.

## Verification

- `npm run build`: production TypeScript/Vite build.
- `npm test`: client and fixture-driven MSW tests.
- `.venv/Scripts/python.exe -m pytest -q` from backend: backend tests.
- `npx playwright test` from frontend with the isolated API running on port 8000: desktop/mobile and real API browser checks. Install Chromium with `npx playwright install chromium` if no cached browser is available. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select a browser explicitly.

Local validation: 36 backend tests, 13 frontend tests, 6 browser checks. Browser checks include tenant isolation messaging, verbatim whitespace, admin metadata, patient notice and hidden unverified instructions, login versioning, upload/extraction/source highlighting, migration approval/access revocation, and password-change session revocation. Desktop and 390px mobile captures were reviewed locally in `output/` (generated artifacts are not committed). No production deployment is claimed. Neon verification is recorded below.


## Connected Neon development mode

`npm run dev:neon` starts the persistent FastAPI app and frontend at http://127.0.0.1:5177. The persistent API uses port 8001, and VITE_API_PROXY_TARGET selects it. It reads the restricted pooled DATABASE_URL from backend/.env. It does not seed, migrate, reset passwords or connect the runtime with owner credentials. Stop other local Clyra servers first if ports 8001/5177 are occupied.

The existing clyra-backend-dev branch was connected and checked on 5 November 2026: client TLS, clyra_app runtime role, append-only event privileges and Alembic 0003. Existing credentials were recovered through read-only Neon management requests; no role/password rotation was performed. The management key remains in .env.neon and is never loaded by FastAPI. The direct owner URL is isolated in backend/.env.migrations.

Existing application logins use Member 2's development passwords, not the mock password. The supplied private backend/.env.development-logins is used for signed-in live checks. Run npm run dev:mock for demo passwords, or npm run dev:integrated for the isolated temporary database.

The browser source-upload test requires the isolated API marker and skips against persistent Neon to avoid modifying shared records. Management connection recovery is `python -m scripts.connect_existing_neon` from backend; read-only checks are `python -m scripts.check_neon_connection`. Both withhold secret values.

Live Neon checks passed on 5 November 2026: TLS, restricted runtime role, append-only event privileges, medication immutability, HTTP login, tenant isolation, patient-view notice and transactional audit rollback. The rollback test left the patient record unchanged. Existing login passwords were preserved.

Signed-in Neon browser checks also passed for dr.north, admin.north and alex.example. The platform-owner login succeeded with its initial password-change gate preserved. These checks signed out afterward and did not change passwords or clinical records.
