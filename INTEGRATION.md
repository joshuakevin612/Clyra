# TR-1.0 integration evidence — 5 November 2026

Integrated [Member 2's handoff](https://github.com/joshuakevin612/Clyra/tree/codex/member2-telemetry-tr1) at commit `c5d63cf5b44264c58377e4a9e9e7c347819c9cff`. The existing frontend and earlier v1.3.1 integration fixes were preserved. Original local files are backed up under ignored `tmp/pre-telemetry-integration/`; the downloaded checkout is `tmp/member2-telemetry-tr1/`.

## Implemented

- Four authenticated telemetry operations, persistent immutable observations, six deterministic reliability rules, metadata-only audit/access logging and additive migration 0004.
- Observations UI, server-owned findings and summary, source-linked evidence, equivalent chart/table information, polling, independent display pause and synthetic fault controls.
- Generated OpenAPI telemetry types, eight shared-example parity checks and a real-API browser demonstration.
- The older telemetry v1.4.0 proposal is explicitly superseded by the owner-selected TR-1.0.

## Tested

| Check | Result |
| --- | --- |
| Backend isolated suite | 70 passed |
| Frontend unit/mock/shared-fixture suite | 31 passed |
| TypeScript/Vite production build | Passed |
| Existing and mock telemetry browser checks | 10 passed |
| Full real-API telemetry browser demo | 1 passed |
| Neon development migration | 0004 confirmed |
| Neon restricted grants and immutable observations | Passed |
| Concurrent create/ingest/stop and duplicate retries | Passed |
| Neon telemetry audit failure rollback | Passed |
| Existing patient/medication/visit/grant records | Unchanged by telemetry verification |
| Persisted Neon browser review and 320px reflow | Passed |

The browser demo uses the actual frontend controller and FastAPI ingestion. It runs a healthy baseline for 20 seconds; produces all six findings; reviews evidence using keyboard activation; checks both-offline staleness, Normal recovery, history retention, pause with continuing ingestion, stop and browser-refresh persistence. Backend tests cover access revocation/migration, closed-session retries, capacity, timing boundaries, atomic rejection and audit privacy. Existing medication discrepancy and verification behavior is preserved.

Live PostgreSQL verification is reproducible from backend with `.venv/Scripts/python.exe -m scripts.verify_telemetry_neon`. It deliberately appends synthetic telemetry and audit evidence to development patient `pat_003`, stops its new session and signs out. It does not reset data or edit existing clinical records. The app uses restricted runtime credentials; migrations use the separate direct owner connection. Browser verification is `node scripts/check-telemetry-neon.mjs` from frontend with the persistent development app running.

## Known limitations

Human Narrator/NVDA, actual 200% browser zoom and grayscale/high-contrast acceptance have not been performed. Automated checks do not establish full WCAG conformance. Production deployment and production-load testing are outside this integration.

The supplied project directory has no root Git metadata. Integration is saved locally; no root commit, push or pull request is claimed. The downloaded handoff retains its own Git history under ignored tmp. Source packaging excludes environment files, credentials, virtual environments, dependencies, local databases and generated test artifacts.
