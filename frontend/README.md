# Frontend

See the [root README](../README.md) for complete frontend and backend setup. From the repository root, install with `npm --prefix frontend ci` and launch both services with `npm run dev:neon`.

The frontend runs at http://127.0.0.1:5177 and proxies API requests to the backend on port 8001. No frontend environment file is needed with this launcher. Sign in with the existing shared database account credentials supplied privately.

Build with `npm run build` from the repository root.
