# Clyra

Medication continuity and safe handover. Synthetic development data only.

React/Vite frontend (`frontend/`) and FastAPI backend (`backend/`).

## Run

Requirements: Node.js 22.12+, Python 3.11, Git.

```powershell
git clone https://github.com/joshuakevin612/Clyra.git
cd Clyra
npm --prefix frontend ci
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
```

Get the environment file from the project owner and place it at `backend/.env` (see `backend/.env.example` for the format). Never commit it.

Then start both services from the repository root:

```powershell
npm run dev:neon
```

- Frontend: http://127.0.0.1:5177
- Backend API: http://127.0.0.1:8001/api/v1
- API docs: http://127.0.0.1:8001/docs

Press Ctrl+C to stop. If the frontend loads but sign-in fails, check the backend terminal: the machine must be able to reach the database host on port 5432 (check VPN/firewall).

## Optional: isolated local demo (no database needed)

```powershell
npm run dev:integrated
```

Open http://127.0.0.1:5177 and sign in with `dr.north` / `Clyra-demo-2026`. Data resets on restart.
