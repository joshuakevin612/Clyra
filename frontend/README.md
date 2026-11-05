# Frontend

See the repository README for start commands and validation. Vite/React/TypeScript consumes generated OpenAPI types, with MSW when VITE_API_BASE_URL is unset or mock. Use VITE_API_BASE_URL=/api/v1 for the localhost proxy.

The interface covers all four roles, versioned account management, clinical record review, source-backed uploads and replacements, discrepancy decisions, patient link/migration approval, and access grants. Canonical synthetic fixtures are shared with the backend. Sessions remain in memory. Admin screens render explicit metadata columns only; instructions and source quotes are preserved.

Visual identity follows the supplied PDF and DESIGN.md: pine/teal, warm ivory, Arial. Native scrolling and a sticky navigation rail support record review; the sign-in entrance respects reduced motion. The design scanner's Arial warning is a deliberate exception for the pinned brand.

Verification and evidence are recorded in the root README. Screenshots were reviewed at desktop and 390px mobile widths. Root CHANGELOG.md records the additive login-version endpoint used by this frontend.
