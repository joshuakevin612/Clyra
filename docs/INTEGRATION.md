# EI-1.0 integration

Read `contract/EXTERNAL_EVIDENCE_IMPORT_EI_1_0.md`. OpenAPI JSON and YAML are
exported from FastAPI with `npm run contract:export`; verify snapshots with
`npm run contract:check`. Member 1 owns generated frontend types and UI changes.

1. Sign in and retain the bearer token in memory.
2. Select a patient from the real API; display their identity.
3. POST multipart FormData to `/api/v1/external-imports`: patientId, sourceLabel,
   visitDate, a stable UUID requestId, and file. Let the browser set the boundary.
4. Show PENDING_ASSOCIATION. GET `/external-imports/{id}/source` for raw text and
   field evidence. Preview entries are not verified medication entries.
5. Request explicit association confirmation. Refresh patient/import versions and
   POST ConfirmImport to `/external-imports/{id}/confirm` after user confirmation.
6. On 409 reload for review. GET recovers a confirmation whose response was lost.
   Do not automatically confirm a newer patient version.
7. Use documentId with existing source/extraction routes, visitId with comparison,
   and existing discrepancy review and medication verification interfaces.

See `contract/examples/external-evidence.json`; versions there are illustrative.
The synthetic fixture is `fixtures/documents/doc_001a.txt`. Duplicate bytes for
the same patient/org return 409 unless the original requestId is repeated
unchanged. Pending source spans use importId as documentId; confirmed spans use
the final documentId. Preserve raw text and half-open Unicode character offsets.

Run `npm run test:backend`. Prepared isolated Neon regressions run with
`npm run test:backend:neon`; its credentials are restricted and the runner refuses
the canonical host/database. `npm run dev:integrated` uses ephemeral SQLite and is
useful for UI work, but does not satisfy PostgreSQL acceptance. `npm run dev:neon`
uses the configured real database. For acceptance, export the isolated pooled
DATABASE_URL into the process environment; never replace the canonical .env.
Apply migrations with separate direct owner credentials and run `npm run db:check`.

Member 1 must regenerate the frontend types from OpenAPI and verify sign-in →
patient → home → workspace, Back/Forward, breadcrumbs, upload, association,
source review, comparison, role denial, logout, expiration and API failure behavior
against the isolated PostgreSQL API. Record keyboard, focus, responsive,
reduced-motion and manual screen-reader outcomes. HTTP tests do not replace these.

Isolated branch retained for verification: `br-steep-morning-a1fmmkch`, project
`calm-dream-97416878`, database `clyra`. Reviewed PostgreSQL 0005 DDL and integrity
probe passed through the Neon connector. After connectivity was restored, actual
Alembic 0001–0005, all 17 restricted-role Neon backend tests, real HTTP workflows,
and an encrypted restore on branch br-orange-tree-a12c4xe2 passed. Browser/UI
integration and accessibility outcomes still require Member 1. Details are in
MEMBER_2_STAGE_1_REPORT.md.
