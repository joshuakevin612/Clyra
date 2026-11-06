# Integrated TR-1.0 telemetry

Member 1's frontend is connected to Member 2's FastAPI implementation from commit `c5d63cf`. The specification is [TR-1.0](../contract/TELEMETRY_TR_1_0.md), additive to v1.3.1. The older v1.4.0 proposal is superseded. Telemetry findings remain separate from medication verification and discrepancies.

## Start

From the repository root, run `npm run dev:neon` for the configured persistent development database, `npm run dev:integrated` for an isolated temporary fixture database, or `npm run dev:mock` for MSW. Stop existing processes on ports 5177/8000/8001 before starting another mode. Persistent mode uses private development credentials already in `backend/.env.development-logins`; isolated/mock mode uses `Clyra-demo-2026`. No database credentials belong in frontend variables.

Sign in as `dr.north`, open a patient, and choose **Observations → Start synthetic feed**. Run Normal for at least 20 seconds, then use Spike, Repeated, Fluctuation, Delayed, Missing and Conflict separately. Allow at least 12 seconds for six-reading rules and eight seconds for delayed release. Return to Normal and allow fresh readings between faults. A fault may trigger more than one rule. Both offline becomes stale after six seconds; Normal restores freshness. Findings remain in history. Stop preserves historical evidence.

Pause display updates freezes the displayed snapshot while ingestion continues. Leaving Observations or refreshing stops local transmission; returning offers Resume synthetic feed for an active session. VIEW_ONLY clinicians can review but have no synthetic feed controls.

## Verification

From the root: `npm run build`, `npm test`, and `backend/.venv/Scripts/python.exe frontend/scripts/generate_types.py`.

Start the isolated API from backend with `.venv/Scripts/python.exe -m uvicorn scripts.integration_app:app --host 127.0.0.1 --port 8000`, then run `npx playwright test` from frontend. The browser configuration starts mock Vite on 5176 and real-API Vite on 5177. Stop the persistent frontend on 5177 first. The live write test refuses a database without the ephemeral marker. The mock-only alternative is `npx playwright test --config playwright.telemetry.config.ts`.

Results: production build, 31 unit/mock/shared-example tests and 11 browser checks passed. The real-API test runs a 20-second baseline, every fault, staleness/recovery, independent pause, stable evidence focus, stop and refresh persistence. Patient/medication/visit data remain identical. All eight published examples match the mock's observations, source states and finding evidence. Frontend wire types are imported from generated OpenAPI types.

For the persistent development app, `node scripts/check-telemetry-neon.mjs` performs a read-only signed-in review of the synthetic session produced by the backend verification script, checks 320px reflow, and signs out. It stores no traces or credentials. See [integration evidence](../INTEGRATION.md).

## Accessibility acceptance

Automated keyboard activation, native roles, evidence focus, polling stability, status text, clipboard fallback, display pause, 320px reflow and reduced-motion checks pass. Desktop and mobile captures were reviewed. A human Narrator/NVDA walkthrough, actual 200% browser zoom and grayscale/high-contrast checks remain unperformed. No screen-reader compatibility or full WCAG-conformance claim is made from automation alone.
