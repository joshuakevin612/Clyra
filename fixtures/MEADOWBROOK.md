# Meadowbrook Demo Clinic

Synthetic demonstration data, separate from the original canonical fixtures.

| Role | Username | Demo responsibility |
| --- | --- | --- |
| Admin | admin.meadow | Organisation metadata and clinician accounts |
| Clinician | dr.maya | Ava Meadow, Noah Meadow |
| Clinician | dr.ethan | Mia Meadow, Leo Meadow |
| Clinician | dr.sofia | Isla Meadow, Owen Meadow |
| Patient | ava.meadow | Ava's patient view |
| Patient | noah.meadow | Noah's patient view |
| Patient | mia.meadow | Mia's patient view |
| Patient | leo.meadow | Leo's patient view |
| Patient | isla.meadow | Isla's patient view |
| Patient | owen.meadow | Owen's patient view |

Each patient has two visits, two source documents and four unverified synthetic medication entries. Source prescriber names identify the responsible clinician. These pairings demonstrate responsibility; permissions remain organisation-wide. Clinicians can review all six clinic patients. Patient logins can access only their own record. Unverified instructions stay hidden from patients.

Mock and isolated modes use the existing demo password `Clyra-demo-2026`. The persistent development database uses a separate generated password, saved privately in `backend/.env.development-logins` as `MEADOW_PASSWORD` and listed with all accounts in ignored `output/meadowbrook-logins.md`. Credentials are not included in source archives.

From backend, `.venv/Scripts/python.exe -m scripts.seed_meadowbrook` adds this fixture to development. It is idempotent, refuses production, and preserves existing records and passwords. `.venv/Scripts/python.exe -m scripts.verify_meadowbrook` verifies all ten accounts through the persistent API at localhost:8001, then signs out.

The original superadmin first-login password-change requirement remains in force. These explicitly synthetic demo accounts are seeded ready to use without that initial gate.
