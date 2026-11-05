# Changelog

## v1.3.1 — 2026-11-05

- Configured Neon development branch clyra-backend-dev and clyra database; applied migrations through 0003 and seeded synthetic fixtures. Production branch unchanged.
- Passed live checks for client TLS, restricted runtime permissions, append-only logs, immutable medication content, HTTP login, tenant isolation, patient view, and audit rollback.

- Project owner authorized Member 2 to resolve the documented gaps. No independent Member 1 approval is claimed.
- Added versioned visit creation and source-backed immutable medication replacements.
- Added pending-migration cancellation, organisation discovery, and protected ADMIN management.
- Specified invitation/grant discovery and all previously provisional wire conventions in CONTRACT.md section 11; retained original endpoints.
- Added direct owner versus pooled runtime Neon configuration, setup/bootstrap/live verification tools, and database-level medication immutability.
- Regenerated OpenAPI with the additive operations and upload fields.

## Working implementation of v1.3.0

- Preserved the supplied frozen contract and member briefs.
- Created synthetic fixtures from its examples because reference fixture files were not supplied.
- Implemented backend routes and proposed two additive discovery GET endpoints.
- Recorded proposed conventions and unresolved interface gaps in contract/IMPLEMENTATION_NOTES.md. These are pending review by both members; no contract amendment has been approved.
