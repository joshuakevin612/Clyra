# Backend

See the [root README](../README.md) for complete new-PC setup using the exact existing Neon database.

Install `requirements.lock.txt` into `backend/.venv`, securely supply the existing runtime configuration in `backend/.env`, and run `npm run dev:neon` from the repository root. No migrations, seeding, account bootstrap, owner connection, or database creation is required. The API uses port 8001; interactive documentation is at http://127.0.0.1:8001/docs.

Maintenance and migration scripts are retained as source, but are not part of new-PC startup. Environment files and credentials are excluded from this repository.
