# Frontend

First-time visitors choose Cinematic or Easy reading. One persistent **Easy reading mode on/off** switch remains at the top of every page, including after sign-in and on the password-change screen. On restores the calm original interface and disables motion; Off enables the aubergine/acid-pear cinematic story, living continuity ribbon and reference cursor. Saved opt-outs and OS reduced motion are respected. See [motion behavior and verification](MOTION.md). Run `npx playwright test --config playwright.motion.config.ts` for the presentation and clinical workflow regressions without a persistent database.

Member 1's TR-1.0 Observations UI, synthetic feed, mock endpoints, checks, and remaining integration requirements are documented in [TELEMETRY.md](./TELEMETRY.md). Use `npm run dev:mock` from this directory to try it; real telemetry requires Member 2's TR-1.0 API.

See the repository README for start commands and validation. Vite/React/TypeScript consumes generated OpenAPI types, with MSW when VITE_API_BASE_URL is unset or mock. Use VITE_API_BASE_URL=/api/v1 for the localhost proxy.

The interface covers all four roles, versioned account management, clinical record review, source-backed uploads and replacements, discrepancy decisions, patient link/migration approval, and access grants. Canonical synthetic fixtures are shared with the backend. Sessions remain in memory. Admin screens render explicit metadata columns only; instructions and source quotes are preserved.

Visual identity follows the supplied PDF and DESIGN.md: pine/teal, warm ivory, Arial. Native scrolling and a sticky navigation rail support record review; the sign-in entrance respects reduced motion. The design scanner's Arial warning is a deliberate exception for the pinned brand.

Verification and evidence are recorded in the root README. Screenshots were reviewed at desktop and 390px mobile widths. Root CHANGELOG.md records the additive login-version endpoint used by this frontend.


Palette update: Cinematic now uses saturated vermilion `#FF512B`, ink blue `#101C36`, sharp white reading surfaces and cool blue-white `#DCE6FF` for the evidence stage. The opening is colour-drenched; the ending is ink blue with a vermilion action. The ribbon lighting now uses the same blue family. Easy reading retains its original pine/ivory palette. Verified WCAG contrast: ink on vermilion 5.21:1, light on ink 16.30:1, secondary text on white 6.56:1.
