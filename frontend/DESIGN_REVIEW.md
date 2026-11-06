# Frontend redesign — 6 November 2026

## Decisions and authority

The implementation uses the supplied design-craft and scroll-choreography skills as design guidance. Contract v1.3.1 including section 12, TR-1.0, and the owner's constraints remain authoritative. This is a Member 1 presentation change. No endpoint, schema, enum, permission, threshold, lifecycle, timing rule, or clinical state meaning changes. No shared contract/version update or Member 2 implementation is required.

The clinical folio direction draws on source documents and review workflows: a pine navigation field, ivory reading ground, ruled tables, and aligned evidence blocks. Existing pine/teal/ivory roles and Arial stay. A new font, replacement palette, cinematic camera effects, and animated clinical values were rejected because they conflict with the pinned identity or clinical review requirements.

The scroll skill's default pinned stages, forced scene spans, and camera transitions are incompatible with TR-1.0 section 11. They are omitted under the owner's explicit instruction to prefer the contracts. There is no unresolved requirement conflict requiring an owner decision.

## Presentation and motion

| Surface | Treatment | Motion and fallback |
| --- | --- | --- |
| Sign-in | Asymmetric pine/ivory composition, semantic source → review → handover list | One 560ms, 8px heading arrival on desktop. Text is present throughout; reduced motion shows the resting layout. |
| Workspace | Pine navigation rail, clearer selected sections, stronger table headers and form boundaries | Interruptible button feedback with 160/240ms transitions. Native scrolling remains in control. |
| Long record review | Stable headings, source text, readings and charts | A decorative 3px document-position line follows native scroll in supporting browsers. It reverses naturally, captures no input, and communicates no clinical status. Unsupported browsers omit it. |
| Mobile review | Wrapped navigation and patient sections, complete synthetic notice | Natural content height and native document flow; no compulsory scroll distance or hidden navigation chapters. |
| Evidence | Same original text and data, unchanged actions and accessible tables | No value, chart, streaming-row, or polling entrance animation. |

These surfaces use natural content lengths rather than authored scroll spans. The handoff from sign-in to workspace is an immediate navigation cut; within review, consistent rules and alignment carry the reading order. All review content is still. There is no scroll animation library, gesture interception, snap, smooth-scroll dependency, or added runtime dependency.

The Animations button disables CSS animation, transitions and decorative progress for this app session, across sign-in and workspace. OS reduced-motion preferences override enabled animation. The choice stays in memory and resets on reload. It does not affect display-pause or ingestion behavior.

## Verification scope

Final executed results: `npm run build` passed; `npm test` passed all 32 tests in six files; `$env:CLYRA_LIVE_BASE='http://127.0.0.1:5187'; npx playwright test` passed all 13 browser tests in 2.4 minutes. The real telemetry test ran a healthy feed, six faults, recovery, independent pause, evidence focus, stop/persistence, and unchanged clinical records. Initial browser attempts exposed a preview/backend configuration mismatch and a new test's startup-readiness race; the dedicated preview/proxy guard and explicit sign-in readiness check resolved them. No application API change was needed.

The new `e2e/design.spec.ts` checks the keyboard sign-in journey, skip link, focus stability during native Page Down/Up, animation opt-out, OS reduced motion, 320/390/768px overflow, and a 200% CSS zoom layout approximation. Screenshots cover sign-in and clinical review on desktop and at 320px. This is not a physical-device test or a browser/OS zoom matrix.

Existing browser tests cover clinical source whitespace, tenant-safe errors, administrative metadata boundaries, patient handover/grants, telemetry pause, evidence focus, clipboard fallback, stale/revoked access, and view-only controls. Real-API tests use the existing ephemeral SQLite integration application. Live tests now verify the frontend proxy's ephemeral marker before a write journey; `CLYRA_LIVE_BASE` can select a dedicated preview when port 5177 is occupied by a different configuration. No database migration or persistent Neon verification is part of this presentation change.

Computed contrast checks: pine/ivory 10.60:1; muted/ivory 5.69:1; teal/white 6.25:1; charcoal/white 13.96:1; sage/pine 8.41:1; muted/white 6.26:1; danger/ivory 7.29:1; pine/soft 9.92:1. These checks cover the principal text/control combinations, not a full WCAG audit. Chart series retain their existing solid/dashed encoding and equivalent table.

The design-craft scanner reports only its Arial-font rule (including the source-text font declaration). This is an intentional, contract-required exception, not a clean scanner pass. No performance trace, full assistive-technology audit, physical mobile test, or actual screen-reader speech/navigation session has been completed. Keyboard assertions and semantic markup checks do not establish screen-reader compatibility. Actual NVDA/Narrator review of sign-in → patient → observations → evidence → summary remains required before claiming that compatibility.
