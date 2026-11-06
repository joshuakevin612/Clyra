# Member 2 — Stage 1 verification report

2026-11-06. Member 2 implementation and verification are complete. The shared
Stage 1 gate remains pending Member 1's generated types, frontend integration
and accessibility/manual outcomes. No deployment or hosted backup schedule has
been activated.

## Delivered

- EI-1.0 specification at contract/EXTERNAL_EVIDENCE_IMPORT_EI_1_0.md, generated
  OpenAPI JSON/YAML and shared synthetic examples.
- Two-step external evidence staging/association with exact sources, idempotent
  staging requests, duplicate protection, version checks and clinical extraction
  only after explicit association. Existing review/comparison rules are reused.
- Migration 0005: import storage/indexes, source/decision immutability and runtime
  grants. Canonical schema remains 0004; no canonical migration/reset/reseed.
- No-store clinical responses, redacted server errors, liveness endpoint,
  bounded pooled runtime configuration and separate migration credentials.
- Encrypted backup/verification/isolated restore and integrity commands, external
  backup job, authenticated smoke and real HTTP verification scripts.
- Root development/verification scripts, changelog, integration documentation
  and DEPLOYMENT_HANDOFF.md for Member 1.

## Checks actually completed

| Check | Actual result |
| --- | --- |
| Python 3.11.4 local backend suite | 17 passed, 1 Starlette httpx deprecation warning, 13.49s |
| Final restricted-role Neon backend suite | 17 passed, same warning, 123.19s |
| Python 3.14.5 local backend suite | 17 passed, same warning, 6.62s |
| Python 3.14 pinned installation and pip check | Passed; no broken requirements |
| Actual Alembic migration on fresh isolated Neon database | Revisions 0001–0005 applied successfully |
| Real HTTP FastAPI server with isolated Neon | Health/login/stage/confirmation/exact source/comparison/no-store/logout passed |
| Real HTTP FastAPI server with restored Neon | Same workflow passed |
| Python 3.14 real HTTP server with restored Neon | Same workflow passed |
| Restricted runtime role and integrity | Passed on isolated schema 0005 |
| PostgreSQL 0005 DDL and rollback-only integrity probe | Passed on isolated branch via connector |
| Canonical read-only role check | No superuser/CREATEROLE/CREATEDB/BYPASSRLS/schema CREATE or audit UPDATE/DELETE |
| OpenAPI snapshot check | Passed identically on Python 3.11 and 3.14 |
| Python source compilation | Passed |
| Encrypted backup and full age verification | Passed with PostgreSQL 18.6 clients and age 1.3.2 |
| Isolated restore and all 19 table fingerprints | Passed; source and restored data matched exactly |
| Restored schema, evidence integrity and runtime privileges | Passed, schema 0005, restricted runtime role |
| Tampered ciphertext with recomputed checksum | Correctly rejected by age authentication |

The test suite covers authentication expiration/revocation, tenant/patient and
role denial, read-only access, validation redaction, exact extraction spans,
failed-extraction source retention, comparison, version conflicts, pending
association, confirmation, idempotency, duplicate content, withheld patient
instructions, failed backup publication and redacted private server failures.

## Recovery and runtime validation

Neon runs PostgreSQL 18.6. A trial with PostgreSQL 17 clients correctly refused
the version mismatch; no usable backup was published from that attempt.
PostgreSQL 18.6 and age 1.3.2 produced an encrypted 64,051-byte archive. Full
age verification, pg_restore, ACL restoration, schema/evidence checks and every
table fingerprint passed. The successful drill completed at 12:27:58 IST.
A network reset interrupted an initial ACL transaction; recovery resumed only
after proving the committed restored data matched the frozen source. No restore
was rerun over a nonempty target. ACL retries are transactional and idempotent.
Changing a ciphertext byte and recomputing its manifest checksum was still
rejected by authenticated decryption. No plaintext dump was written to disk.

Python 3.14.5 installed the pinned dependencies and passed pip check plus all
17 local tests. The configured Vercel runtime is Python 3.14, with .vercelignore
excluding local secrets, environments, operational scripts and test artifacts.
Real HTTP verification on Python 3.14 against restored Neon also passed.
A Vercel build/deployment has not been attempted; that is Stage 2.
OpenAPI's 422 description is explicit so Python's changed HTTP reason phrase
does not produce different contracts between 3.11 and 3.14.

## Retained isolated resources

Project calm-dream-97416878:

- Source/verification branch br-steep-morning-a1fmmkch.
- Fresh test database clyra_stage1_20261106_063837_6c91b8.
- Separate restore branch br-orange-tree-a12c4xe2.
- Restore target clyra_restore_20261106_065109_8f7710.
- An earlier empty restore database and failed encrypted .partial artifact remain
  as clearly identified drill artifacts. No immutable evidence was deleted.

Credentials, recovery key and encrypted drill archives are ignored local files;
their values are not included here. These branches are retained for integration
and review, with normal Neon compute/storage lifecycle considerations.

## Shared gate and handoff

Member 1 must regenerate frontend types from published OpenAPI, integrate the
import UI and run the full frontend/backend workflow. Keyboard, focus,
responsive, reduced-motion and manual screen-reader outcomes must be recorded
by Member 1. Those frontend requirements are not claimed verified by these
backend checks.

Before Stage 2, resolve the shared frontend integration/accessibility gate.
Member 1 owns Vercel projects, hosted secrets,
environment/proxy/domain separation, recovery-history verification, canonical
pre-migration backup/migration, hosted backup schedule and alerts, and live
acceptance. Consult DEPLOYMENT_HANDOFF.md; purchases, accounts and service-plan
prerequisites are not silently assumed available.
