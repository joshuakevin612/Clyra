# Integration handoff: v1.3.1

The project owner requested that Member 2 decide and close the gaps. These decisions are specified in CONTRACT.md section 11 and represented in openapi.yaml. Member 1 should regenerate API types against this version. The original v1.3.0 endpoint set remains available.

Resolved workflows:

- Create visits with the patient's current version, then upload SYN-RX-V1 documents into them.
- Replace a medication by uploading a single-entry source document with supersedesId and supersedesIfVersion. History stays immutable and the replacement needs verification.
- Discover pending patient link requests and access-grant versions through GET endpoints.
- Select patient-initiated migration destinations from the ACTIVE organisation directory; destinationOrgId selects the destination.
- Cancel pending migrations; revoke completed-migration access through grants.
- List, disable, re-enable, and reset ADMIN accounts through SUPER_ADMIN routes, with last-admin protection.

Fixtures were authored from the supplied contract examples because reference fixture files were not supplied. They are synthetic and produce the four specified discrepancies.

Extraction is deterministic and synchronous within the bounded upload transaction. The 202 response contains a pollable terminal job. Only the documented UTF-8 SYN-RX-V1 template is accepted.

Use the Vite development proxy for same-origin API access during frontend integration. Authentication remains the contract's argon2id and opaque session-token implementation; database setup does not replace it with Neon Auth.

## Frontend sequence for the completed workflows

1. Fetch the patient and send its version as ifVersion when creating a visit. Re-fetch the patient after visit creation because the version increments.
2. Upload multipart patientId, visitId, ifVersion, file. Poll the returned jobId; COMPLETED enables the extraction viewer, FAILED exposes the reason. Re-fetch the patient after an accepted upload.
3. To replace an entry, upload a single-entry document for the same medicine key and include supersedesId plus the medication's current version as supersedesIfVersion. Keep showing the original entry in history. The replacement starts UNVERIFIED and requires its own verification.
4. A signed-in patient discovers invitations through GET /link-requests and confirms using the invitation version. Select destinationOrgId from GET /organisations and request the migration with the patient's version. Decision/cancellation uses the migration version.
5. Grant updates use the grant version returned by GET /patients/{patientId}/access-grants. If the grant does not exist, use the patient's current version. Re-fetch after writes or VERSION_CONFLICT.

For separate-origin local development, set CORS_ORIGINS to exact frontend origins, comma-separated. Wildcards are rejected. backend/.env.example includes localhost:5173 and 127.0.0.1:5173.

Validation: 34 local tests pass, including signup through handover and patient revocation after migration. Live Neon verification completed on 2026-11-05: client TLS, runtime permissions, append-only logs, medication immutability, login, tenant isolation, patient view, and audit rollback passed. Connection metadata is in backend/neon-development.json.
