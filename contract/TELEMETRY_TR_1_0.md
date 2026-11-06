CLYRA — TELEMETRY RELIABILITY AND ACCESSIBILITY CONTRACT
Extension version: TR-1.0
Status: Approved implementation direction by project owner
Frontend owner: Member 1
Backend and shared-contract owner: Member 2

1. PURPOSE AND AUTHORITY

Add reliable handling of synthetic incoming patient telemetry to Clyra,
while allowing the complete clinician workflow to operate using a
keyboard or screen reader.

This is an additive extension to Clyra contract v1.3.1, including its
section 12 integration addition.

Existing medication, document, patient, authentication, organisation,
migration, verification, audit, and access-control rules remain in force.

This extension defines telemetry behavior only. Telemetry findings are
not medication discrepancies and must never enter the existing medication
discrepancy enumeration or medication verification workflow.

Priority:
1. Explicit subsequent project-owner decisions.
2. This extension for its explicitly defined telemetry behavior.
3. Existing contract for all existing behavior.
4. OpenAPI and implementation, which must conform to the contracts.

The project owner authorizes this extension without requiring another
approval round. Neither member may independently change its wire format
or semantics. Discovered conflicts must be documented and resolved
before either side implements a different interpretation.

Synthetic data only. No diagnosis, prescriptions, dosage suggestions,
clinical alarm claims, or automatic changes to patient treatment.

2. FIXED IMPLEMENTATION SCOPE

Implement:
- One metric: HEART_RATE.
- One unit: BPM.
- Two synthetic sources per telemetry session: SENSOR_A and SENSOR_B.
- Persistent raw observations.
- Six reliability findings:
  MISSING, SPIKE, REPEATED, FLUCTUATION, DELAYED, CONFLICT.
- Backend-generated explanations and handover summary.
- A clinician patient tab called "Observations".
- A separately labelled "Synthetic feed controls" area.
- Keyboard-accessible controls, equivalent chart/table information,
  and screen-reader-compatible status updates.

Do not implement in TR-1.0:
- Physical device pairing.
- Arbitrary source registration.
- Additional metrics.
- Manual observation entry.
- AI/ML integration.
- Interpolation, imputation, automatic averaging, or replacement values.
- Telemetry acknowledgment/resolution workflows.
- Editing or deleting observations.
- Patient-facing telemetry.
- Clinical thresholds or treatment alerts.
- WebSockets, message brokers, or a separate streaming service.

Reliability thresholds below are synthetic demonstration settings.
They are not medically validated thresholds.

3. OWNERSHIP AND PARALLEL DEVELOPMENT

Member 1 exclusively owns:
- frontend/src UI, styling, API client integration, and MSW handlers.
- Frontend tests and browser accessibility/integration tests.
- Synthetic feed controller running in the authenticated demo browser.
- Frontend documentation.

Member 2 exclusively owns:
- backend application, schemas, migrations, permissions, and tests.
- Reliability engine and telemetry persistence.
- contract/ telemetry specification and OpenAPI export.
- fixtures/telemetry/ shared request/response examples.
- Root CHANGELOG.md entry for this extension.

Member 1 must not edit backend, shared fixtures, shared contract files,
or root CHANGELOG.md.
Member 2 must not edit frontend application files.

Generated frontend API types are the sole exception:
Member 2 exports OpenAPI; Member 1 runs the existing frontend generator
and commits generated frontend types. Member 2 never edits that file.

Neither member edits backend-source/, credentials, deployment settings,
or the existing fixtures/data.json for this feature.

Member 2 first publishes the telemetry schemas and shared examples,
then implements the backend.
Member 1 may begin against this text and mock responses immediately,
then validates mocks against the published schemas.

Each member works in their own branch/checkout.
Integration order: backend/shared-contract change, then frontend change.
No formatting or unrelated refactoring across ownership boundaries.

4. ACCESS, AUDITING, AND EXISTING DATA

All routes use /api/v1 and existing Bearer authentication.

CLINICIAN with FULL patient access:
- Create telemetry sessions.
- Submit readings.
- Stop sessions.
- Read telemetry.

CLINICIAN with VIEW_ONLY:
- Read telemetry only.

CLINICIAN with NONE:
- Receive NOT_FOUND for that patient's telemetry routes.

PATIENT, ADMIN, and SUPER_ADMIN:
- No telemetry access in TR-1.0.
- Role rejection uses FORBIDDEN without returning clinical content.

Recheck access on every request. Existing session expiry, account
suspension, forced-password-change, and access revocation rules apply.

Telemetry stays attached to patientId through migration.
Do not copy telemetry into another patient's record.
Current grants govern access after migration.

Telemetry must not increment patient, visit, medication, or grant versions.

Successful reads create existing-style access-log events.
Writes and their audit events commit atomically.
Audit failure rolls back the write.

New audit actions:
TELEMETRY_SESSION_CREATED
TELEMETRY_READINGS_INGESTED
TELEMETRY_SESSION_STOPPED

New access category:
TELEMETRY

Admin-visible logs contain identifiers, actor, organisation, action,
timestamp, and counts only. Never include readings, reasons, summaries,
or other clinical content.

5. COMMON WIRE RULES

JSON uses camelCase.
Enums use UPPER_SNAKE_CASE.
Timestamps are UTC ISO-8601 strings ending in Z.
Reject offset-less timestamps.
Reject unknown request fields.

All response fields defined below are present.
Nullable fields explicitly return null.
Lists are arrays, including when empty.

Use existing error envelope:
{
  "error": {
    "code": "...",
    "message": "...",
    "details": [{"field": "...", "issue": "..."}]
  }
}

Use existing error codes only:
VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND,
VERSION_CONFLICT, RATE_LIMITED, INTERNAL_ERROR.

Validation errors use HTTP 422.
Authentication errors use 401.
Permission errors use 403.
Missing/inaccessible resources use 404.
State/version/idempotency conflicts use 409.

Server-generated IDs:
Telemetry session: tel_<opaque identifier>
Observation: obs_<opaque identifier>

eventId is a client-generated UUID.
sourceId is exactly SENSOR_A or SENSOR_B.

6. DATA TYPES

Session:
{
  "id": string,
  "patientId": string,
  "version": integer,
  "status": "ACTIVE" | "STOPPED" | "EXPIRED",
  "startedAt": timestamp,
  "expiresAt": timestamp,
  "stoppedAt": timestamp | null,
  "metric": "HEART_RATE",
  "unit": "BPM",
  "expectedIntervalSeconds": 2,
  "sources": [
    {"id": "SENSOR_A", "label": "Synthetic sensor A"},
    {"id": "SENSOR_B", "label": "Synthetic sensor B"}
  ]
}

Sessions expire 15 minutes after creation.
Expiration is derived from server time; it does not increment version.
Creation sets version=1. Explicit stop increments version once.

ReadingInput:
{
  "eventId": UUID string,
  "sourceId": "SENSOR_A" | "SENSOR_B",
  "measuredAt": timestamp,
  "value": number | null
}

Observation:
{
  "id": string,
  "eventId": UUID string,
  "sessionId": string,
  "sourceId": "SENSOR_A" | "SENSOR_B",
  "measuredAt": timestamp,
  "receivedAt": timestamp,
  "value": number | null,
  "flags": FindingCode[]
}

FindingCode is one of the six codes in section 2.
Flags are always ordered:
MISSING, SPIKE, REPEATED, FLUCTUATION, DELAYED, CONFLICT.

SourceState:
{
  "sourceId": "SENSOR_A" | "SENSOR_B",
  "status": "WAITING" | "CURRENT" | "SUSPECT" | "STALE" | "ENDED",
  "latestObservationId": string | null,
  "latestValue": number | null,
  "latestMeasuredAt": timestamp | null,
  "lastReceivedAt": timestamp | null,
  "ageSeconds": number | null,
  "flags": FindingCode[]
}

latestValue is the value from the latest observation, including null.
Do not substitute an earlier non-null value.
Latest means greatest measuredAt, then receivedAt, then observation ID.
lastReceivedAt is the greatest receipt time across that source.
ageSeconds is max(0, serverTime - latestMeasuredAt), in seconds.

Finding:
{
  "code": FindingCode,
  "sourceIds": sourceId[],
  "observationIds": string[],
  "explanation": string
}

A finding references original observations when they exist.
Absence findings may have an empty observationIds array.
explanation is backend-generated plain text, never HTML.

Snapshot:
{
  "contractVersion": "TR-1.0",
  "serverTime": timestamp,
  "session": Session | null,
  "observations": Observation[],
  "sources": SourceState[],
  "findings": Finding[],
  "summary": string
}

No session:
session=null; observations=[], sources=[], findings=[];
summary="No telemetry session has been started."

7. API ENDPOINTS

A. POST /patients/{patientId}/telemetry/sessions

Request:
{"requestId": UUID string}

Success: 201 with Session.
Replay of the same requestId for the same patient and actor:
200 with the originally created session.

Only one ACTIVE, unexpired session is allowed per patient.
Creating another while one exists returns VERSION_CONFLICT.
An expired or stopped session does not prevent a new session.
Use database locking/constraints to enforce concurrent creation safety.

B. POST /patients/{patientId}/telemetry/sessions/{sessionId}/readings

Request:
{"readings": ReadingInput[]}

Batch size: 1–100.
Maximum session size: 1,000 observations.
A batch that would exceed the cap is rejected atomically with
VALIDATION_FAILED; exact duplicate events do not consume capacity.

Success: 200
{
  "acceptedCount": integer,
  "duplicateCount": integer,
  "serverTime": timestamp
}

Batch validation and insertion are atomic.
Reject non-finite values, negative values, values above 1000,
unknown source IDs, and timestamps before session.startedAt.

Allow measuredAt no more than five seconds ahead of server receipt time.
Larger future timestamps are rejected.
Each accepted observation gets a server receipt timestamp.

Null is accepted and means the source explicitly supplied no reading.
An absent event is different from a null-valued event.

Idempotency key: (sessionId, eventId).
An identical replay succeeds without inserting another observation.
Same key with different sourceId, measuredAt, or value returns
VERSION_CONFLICT and rolls back the entire batch.
Within-batch duplicates follow the same rule.

New events require an ACTIVE, unexpired session.
Exact duplicate-only retries remain successful after stop or expiration.
A mixed retry containing new events after closure returns VERSION_CONFLICT.

Never accept a session belonging to a different patient.
Return NOT_FOUND for that mismatch.

C. POST /patients/{patientId}/telemetry/sessions/{sessionId}/stop

Request:
{"ifVersion": integer}

Success: 200 with Session.
An ACTIVE session becomes STOPPED with server stoppedAt.
Version mismatch returns VERSION_CONFLICT.
An already STOPPED or EXPIRED session with matching version returns its
current Session unchanged.

D. GET /patients/{patientId}/telemetry/snapshot

Optional query:
sessionId=<session ID>

If omitted, return the most recently created session.
Tie-break: greatest session ID.
If supplied, require that session to belong to this patient.

Success: 200 with Snapshot.

Snapshot contains all observations for that session, sorted by
measuredAt ascending, receivedAt ascending, then ID ascending.
The 1,000-observation cap intentionally removes pagination complexity.

Evaluate the snapshot using one captured serverTime and a consistent
database read. Do not mix different evaluation times within a response.

Historical session selection is API-supported.
Frontend TR-1.0 only needs to display the latest session.

8. RELIABILITY ENGINE

The backend is the sole authority for flags, source states, and summary.
Frontend must not independently classify readings.

Rules operate per session. No history crosses session boundaries.
They run against observations available at snapshot time.
Late arrivals may therefore change derived flags on historical readings.
Raw observations remain immutable.

Rule ordering:
1. Determine MISSING and DELAYED.
2. Compute per-source SPIKE, REPEATED, and FLUCTUATION.
3. Compute cross-source CONFLICT.
4. Derive source states and summary.

MISSING:
- Every null-valued observation receives MISSING.
- While session is active, a source is stale when no non-delayed
  observation measured within the last six seconds exists.
- Before a source's first observation, allow six seconds from startedAt.
- After that grace period, absence produces a source MISSING finding.
- Receiving old observations does not restore freshness.

DELAYED:
receivedAt - measuredAt > 5 seconds.
Exactly five seconds is not delayed.
Delayed observations remain visible in history.
Exclude them from statistical windows and cross-source comparisons.

SPIKE:
For each eligible non-null, non-delayed observation:
- Use its preceding ten non-null, non-delayed observations from the
  same source in measurement order.
- Require at least five predecessors.
- median = median of predecessor values.
- MAD = median(abs(value - median)) over those predecessors.
- threshold = max(20, 6 * 1.4826 * MAD).
- Flag if abs(currentValue - median) > threshold.
- Do not exclude predecessors merely because they have other flags.

REPEATED:
- Use the latest six consecutive non-null, non-delayed observations
  ending at the observation being evaluated.
- A null or delayed observation breaks the sequence.
- Require the six measurement timestamps to span at least ten seconds.
- Flag the ending observation if max(value)-min(value) <= 0.1.
- Identical values indicate possible repetition, not proven failure.

FLUCTUATION:
- Use the latest six consecutive non-null, non-delayed observations
  ending at the observation being evaluated.
- A null or delayed observation breaks the sequence.
- Compute the five adjacent differences.
- Flag the ending observation if at least four differences have
  absolute magnitude >15 BPM and at least three adjacent pairs of
  differences have opposite signs.
- Zero differences do not count as sign changes.

CONFLICT:
- Compare each eligible non-null, non-delayed observation against the
  nearest eligible observation from the other source.
- Maximum measurement-time difference: two seconds inclusive.
- Tie-break: earlier measuredAt, then lexicographically smaller ID.
- Difference >15 BPM creates a conflict and flags both observations.
- Deduplicate the same unordered observation pair.
- Do not average or select a winning source.
- Other flags do not exclude observations from conflict comparison.

Findings:
- One finding per observation/code for single-observation rules.
- One finding per unique conflicting pair.
- One additional source MISSING finding for current source staleness.
- Sort by code order, source IDs, then observation IDs.
- Explanations name the applicable rule, relevant values/times,
  and describe uncertainty without diagnosing sensor or patient failure.

Source status precedence:
1. STOPPED/EXPIRED session -> ENDED.
2. No observation within initial six-second grace -> WAITING.
3. Staleness rule met -> STALE.
4. Latest observation has any flag -> SUSPECT.
5. Otherwise -> CURRENT.

Source flags:
Flags of the latest observation, plus MISSING when stale.
CURRENT means no rule flagged the latest observation.
It must never be labelled "clinically verified" or "accurate".

After a session ends:
- Preserve historical observation findings.
- Do not generate new stale-source findings from the passage of time.
- All source statuses are ENDED.
- Show the session ending time and historical values as historical.

9. HANDOVER SUMMARY

Backend generates deterministic plain text from the snapshot.

Include:
- Synthetic-data label.
- Session status and snapshot time.
- Each source's status, latest value or "no value", measurement time,
  and flags.
- Counts of findings by code.
- A statement that flags indicate data-quality concerns, not diagnosis.

Counts refer to finding objects, not number of affected observations.
A conflict pair counts as one finding.

Do not claim that absence of flags proves reliability.
Do not omit abnormal values or generate replacement values.
Do not change existing medication handover content.

Frontend displays summary next to source-linked telemetry evidence.
A "Copy telemetry summary" button copies exactly the displayed summary.
If clipboard access fails, show selectable text and a visible error.

10. SYNTHETIC FEED CONTROLLER

Member 1 implements a browser-based controller using the real ingestion API.
It operates only for FULL-access clinicians.

It is explicitly labelled:
"Synthetic demonstration — not a connected medical device."

Start:
- Create a session with a new requestId.
- Reuse that requestId if retrying an uncertain creation.
- Submit one observation per source every two seconds.
- Initial values follow:
  SENSOR_A: 78, 80, 79, 81, 80, repeating.
  SENSOR_B: corresponding SENSOR_A value +1.
- Use a new eventId per new observation.
- Retry an uncertain batch with identical event IDs and payloads.
- Do not run overlapping ingestion requests.

Controls are native buttons:
Normal
Missing
Spike
Repeated
Fluctuation
Delayed
Conflict
Both offline
Stop

Changing mode restarts that mode's local tick counter.
Only one fault mode is active at a time.

Fault modes:
- Missing: stop submitting SENSOR_A; B continues normally.
- Spike: next A value is 180, then return to Normal.
- Repeated: A value is 80 until mode changes; B remains normal.
- Fluctuation: A alternates 60 and 110; B remains normal.
- Delayed: queue A readings and release each after eight seconds,
  preserving its original measuredAt; B remains normal.
- Conflict: A follows its normal sequence +30; B remains normal.
- Both offline: submit nothing; polling continues.
- Normal: both sources resume normal sequences.

Multiple detector flags may legitimately result from one fault mode.
Do not hardcode a single expected flag in the UI.

When leaving Delayed mode, discard unsent queued synthetic events.
Do not modify any readings already submitted.

Stop:
- Cancel local timer and queue.
- Call stop endpoint using current session version.
- Refresh snapshot.

A browser refresh stops the local generator; it does not secretly resume.
The existing active session remains visible and naturally becomes stale.
Offer "Resume synthetic feed" or "Stop session".
Resume continues the existing session with fresh event IDs.

After 401/403/404 or session closure:
Stop the generator, clear queued sends, and show the appropriate state.
Do not retry indefinitely.

Do not claim browser timers represent precise physical sensor timing.

11. FRONTEND INTERACTION AND ACCESSIBILITY

Preserve Clyra's existing palette, Arial typography, and visual identity.

Add Observations to the existing clinician patient navigation.
Do not replace medication, document, or comparison screens.

The page includes:
- Synthetic-data label and session status.
- Source status cards with textual status and timestamps.
- Chart.
- Equivalent readings table.
- Findings list linked to affected observation rows.
- Handover summary.
- Synthetic feed controls when permitted.

The chart and table use the same server observations.
The table includes source, value/unit, measured time, received time,
and textual flags.
Null values render as "Missing", never zero.
Chart gaps remain gaps.
Do not connect lines across nulls or measurement gaps >6 seconds.
Different sources use labels and different line styles, not colour alone.

Keyboard:
- Native buttons, links, inputs, and table semantics.
- Logical focus order.
- Clearly visible focus indicators.
- Skip link to main content.
- No action requires hover, dragging, swipe, or a pointer.
- Findings links move focus to the corresponding row/details.
- Navigation updates the page heading/focus sensibly.
- Background updates never steal focus.
- No global single-letter keyboard shortcuts.

Screen readers:
- One meaningful main heading per page.
- Named landmarks and labelled fields.
- Accessible names for icon buttons.
- Proper table header associations.
- Status words are actual text.
- Chart has an accessible name and directs users to the equivalent table.

Live updates:
- Poll snapshot every two seconds while the tab is visible.
- Never overlap snapshot requests.
- Ignore responses from obsolete patient/session selections.
- Announce source status transitions in one polite live region.
- Do not announce every reading or the full table on every poll.
- Keep a visible status history of the latest ten transitions.

Pause:
- "Pause display updates" freezes displayed snapshot and announcements.
- Ingestion continues independently.
- Show "Display paused" and the frozen snapshot time.
- Resume fetches a fresh snapshot and announces a concise update.
- Pause must not be confused with stopping the feed.

Network failure:
- Keep last displayed snapshot with "Connection unavailable;
  showing data captured at [time]".
- Never present cached data as a fresh successful response.
- Retry polling after five seconds.
- 401 follows existing sign-in behavior.
- 403/404 clears inaccessible clinical content and stops local ingestion.

Visual/accessibility constraints:
- No information conveyed by colour alone.
- No audio-only notifications.
- No required animation.
- Respect prefers-reduced-motion.
- No scroll-jacking, pinned scroll sequences, or automatic scrolling
  during clinical review.
- Content reflows at 320 CSS pixels.
- At 200% zoom, controls and text remain usable.
- Wide tables may use labelled horizontal scrolling; the page itself
  must not require horizontal scrolling.
- Text contrast target: WCAG AA, 4.5:1 for normal text.
- Controls/focus indicators must remain distinguishable.

Accessibility applies to the complete journey:
sign-in -> patient selection -> observations -> evidence -> summary.

12. STORAGE AND OPERATION

Member 2 adds migrations through the existing Alembic sequence.
Do not modify previously applied migrations.
Use existing restricted runtime database credentials.
Do not use migration-owner credentials in the application.

Persist sessions and immutable observations.
Derived flags and snapshots may be computed on read.
Do not expose update/delete observation endpoints.

Ensure indexes support:
- Patient session lookup.
- Session/source/measurement ordering.
- Unique session/eventId.
- Session creation idempotency.

Session creation, ingestion, and stop must serialize safely against
concurrent writes to the same session/patient as appropriate.

No automatic deletion or database reset.
Use isolated test databases for automated tests.
Demo activity must not alter medication records.

13. ACCEPTANCE TESTS

Backend:
- All six rules trigger on deterministic fixtures.
- Healthy baseline does not trigger the six rules.
- Insufficient history does not trigger statistical rules.
- MAD=0 works without division errors.
- Null is not zero and does not enter numeric windows.
- Missing detection works without new arrivals.
- Delayed arrivals do not make a source fresh.
- Out-of-order data is ordered by measurement time.
- Future timestamps beyond tolerance are rejected.
- Exact boundary conditions match strict/inclusive rules above.
- Exact retries do not duplicate observations.
- Conflicting eventId reuse rolls back the batch.
- Session capacity, expiry, stop, and concurrent creation are enforced.
- Late retries after session closure follow section 7.
- Two sources changing together are never automatically corrected.
- Access revocation and migration permissions apply immediately.
- Admin logs contain no telemetry content.
- Audit failure rolls back changes.
- Existing backend tests still pass.

Frontend:
- Mock responses match shared schema.
- Every primary action completes using keyboard only.
- A screen reader can inspect status, table, findings, and summary.
- Status changes are announced without reading every sample.
- Focus remains stable during polling.
- Pausing display leaves ingestion running and labels the frozen view.
- Reduced motion removes nonessential motion.
- Grayscale use retains all status information.
- 320px layout and 200% zoom remain usable.
- Network loss, empty session, missing values, session end, and access
  revocation have explicit states.
- Fault controls work against the real backend.
- Copy summary failure has a usable fallback.
- Existing frontend/build tests still pass.

Integration demo:
- Run a healthy feed for at least 20 seconds.
- Inject each fault separately and show explanations/evidence.
- Stop both sources and show staleness.
- Restore normal mode and show freshness recovery.
- Explain that history retains previous findings.
- Complete observation review without a mouse.
- Repeat core review with a screen reader.
- Show telemetry summary alongside unchanged medication handover.

Automated accessibility checks are supplementary.
Do not claim screen-reader compatibility based only on an automated scan.
Do not claim full WCAG conformance without a complete audit.

14. DELIVERY AND CHANGE CONTROL

Member 2 delivers:
- Implemented API and migrations.
- OpenAPI matching this contract.
- Shared healthy, empty, and six-fault examples.
- Deterministic engine/API tests.
- Start/test instructions and changelog.

Member 1 delivers:
- Implemented accessible UI and simulator.
- MSW parity.
- Generated frontend types from Member 2's OpenAPI.
- Keyboard, responsive, and real-API integration checks.
- Demo instructions.

Both report separately:
Implemented / Tested / Known limitations.

A feature is not complete merely because it works with mocks.

Changes to endpoint names, fields, enums, thresholds, timing, permissions,
state meanings, or ownership require a versioned shared-contract update
before either member relies on the change.

Additive changes must preserve existing callers.
Breaking changes require an explicit migration/compatibility plan.
No unilateral reinterpretation of "CURRENT", "SUSPECT", "STALE",
or medication verification is permitted.