# External evidence import — EI-1.0

This contract was defined for the Member 2 Stage 1 implementation on 2026-11-06.
The machine-readable definition is `contract/openapi.json`, exported directly
from FastAPI. Existing medication and telemetry interfaces remain compatible.
This feature accepts **synthetic UTF-8 SYN-RX-V1 text only**, maximum 2,000,000
bytes. It does not parse PDFs, images, FHIR, or real clinical records.

## Authorization and privacy

All routes require the existing memory-held bearer token. Only CLINICIAN can
use import routes. Staging and confirmation require FULL access to the selected
patient. Reads require at least VIEW_ONLY plus the staging organisation matching
the clinician's organisation. Missing/cross-tenant evidence returns 404; a role
denial returns 403. Revocation and eight-hour expiration use existing rules.
Responses, including errors, have `Cache-Control: no-store, private`.
Every evidence read writes an access event; stage and confirmation write audit
events without clinical text, source labels, filenames or raw evidence.

## Endpoints

| Method and path under `/api/v1` | Request | Response |
| --- | --- | --- |
| POST `/external-imports` | Multipart `patientId`, `sourceLabel` (1–200 nonblank chars), `visitDate` (ISO date), `requestId` (UUID), `file` | 201 ExternalImportOutput |
| GET `/patients/{patientId}/external-imports` | Existing `limit` (1–200) and `cursor` pagination | 200 page of ExternalImportOutput |
| GET `/external-imports/{importId}` | None | 200 ExternalImportOutput |
| GET `/external-imports/{importId}/source` | None | 200 ExternalSource |
| POST `/external-imports/{importId}/confirm` | JSON ConfirmImport | 200 ExternalImportOutput |

`ExternalImportOutput` has `id`, `version`, `contractVersion: "EI-1.0"`,
`patientId`, `status`, `sourceLabel`, `visitDate`, `sha256`, `createdAt`,
`confirmedAt`, `visitId`, `documentId`, `jobId`. The last four fields are null
while pending. Status is `PENDING_ASSOCIATION` or `CONFIRMED`.

`ConfirmImport` requires all of:

```json
{"ifVersion":1,"patientId":"pat_001","patientIfVersion":1,"confirmAssociation":true}
```

`patientIfVersion` must be obtained from a fresh patient GET. Confirmation must
display and require explicit user confirmation of the chosen patient's identity.
There is no automatic association based on a filename, medicine, or extracted
text. A staged patient cannot be changed. Extra JSON fields are rejected.

`ExternalSource` contains `importId`, `sha256`, `rawText`, and `entries` using
the existing ExtractedFields schema. Exact source quotes and half-open character
offsets refer to decoded Unicode text, **not UTF-8 byte offsets**. Preserve CRLF,
spaces, punctuation and original source text. Before confirmation the span's
`documentId` is the import ID; afterward it is the final document ID. The raw
text and offsets remain identical. SHA-256 hashes the original UTF-8 bytes.

## Atomic behavior and retries

Staging validates syntax and saves immutable evidence only. It does not create
a visit, document, extraction job, medications, or discrepancies, and does not
change patient version. No pending extraction is presented as verified medicine.

`requestId` is unique per staging organisation. Repeating a request with identical
patient, bytes, sourceLabel and visitDate returns the existing resource (201);
changing those values returns 409 VERSION_CONFLICT. A new requestId with bytes
already staged for the same patient and organisation also returns 409. The same
bytes for different patients are permitted only through separate, explicit
association workflows. In a concurrent retry, 409 is possible; retry the original
requestId to retrieve the winner. No silent mock fallback is permitted.

Confirmation locks import and patient, validates both versions and patient
identity, creates one new visit at the supplied visitDate, then reuses the
existing document extraction and discrepancy rules in the same transaction.
Medications begin UNVERIFIED. The import, new evidence and patient update commit
together or roll back together. A second confirmation returns 409; GET the import
to recover after a lost response. A newer patient version requires review and
resubmission with the fresh version; never auto-confirm after a conflict.

Confirmed sources use the existing `/documents/{documentId}` and
`/documents/{documentId}/extraction` endpoints. Review, verification, discrepancies
and `/patients/{patientId}/comparison?leftVisitId=...&rightVisitId=...` retain
their existing contracts. EI-1.0 adds no automated clinical decisions or advice.

## Failure and retention

The standard `{"error":{"code","message","details"}}` envelope applies.
Malformed/unsupported input and oversized files return 422; bad/expired tokens
401; denied role/write access 403; inaccessible objects 404; stale versions,
duplicate content or request collisions 409. Unexpected errors return a generic
500 without clinical input or driver detail. Stage failures persist no evidence.
The multipart transport/hosting platform can reject an oversized request before
FastAPI; clients must tolerate a non-JSON transport error.

There is no delete, overwrite, reassignment or rejection endpoint in EI-1.0.
Pending evidence remains pending until explicit confirmation. PostgreSQL protects
raw evidence, identity, source metadata and confirmed associations from mutation;
the restricted runtime cannot delete/truncate import evidence. Backups retain it.
Schema revision 0005 is required. Downgrade is deliberately blocked because it
would discard immutable evidence.

See `contract/examples/external-evidence.json` and `docs/INTEGRATION.md` for the
synthetic workflow. Member 1 owns regenerated TypeScript types and the UI.
