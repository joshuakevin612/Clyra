// MSW-only service simulation. Production UI never computes reliability findings.
import {
  findingCodes,
  sourceIds,
  type Finding,
  type FindingCode,
  type Observation,
  type ReadingInput,
  type Session,
  type Snapshot,
} from "../telemetry/contract";
const sessions: Session[] = [];
const observations = new Map<string, Observation[]>();
const creations = new Map<string, Session>();
type Fail = (
  code: "NOT_FOUND" | "VERSION_CONFLICT" | "VALIDATION_FAILED",
  status?: number,
) => never;
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const iso = (ms: number) => new Date(ms).toISOString();
const order = (a: Observation, b: Observation) =>
  Date.parse(a.measuredAt) - Date.parse(b.measuredAt) ||
  Date.parse(a.receivedAt) - Date.parse(b.receivedAt) ||
  a.id.localeCompare(b.id);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
function project(session: Session, now: number): Session {
  return {
    ...session,
    status:
      session.status === "ACTIVE" && now >= Date.parse(session.expiresAt)
        ? "EXPIRED"
        : session.status,
  };
}
export function mockSnapshot(
  session: Session | null,
  raw: Observation[],
  now: number,
): Snapshot {
  const serverTime = iso(now);
  if (!session)
    return {
      contractVersion: "TR-1.0",
      serverTime,
      session: null,
      observations: [],
      sources: [],
      findings: [],
      summary: "No telemetry session has been started.",
    };
  session = project(session, now);
  const rows = raw
    .map((row) => ({ ...row, flags: [] as FindingCode[] }))
    .sort(order);
  const findings: Finding[] = [];
  const flag = (row: Observation, code: FindingCode, explanation: string) => {
    row.flags.push(code);
    findings.push({
      code,
      sourceIds: [row.sourceId],
      observationIds: [row.id],
      explanation,
    });
  };
  const delayed = (row: Observation) =>
    Date.parse(row.receivedAt) - Date.parse(row.measuredAt) > 5000;
  for (const row of rows) {
    if (row.value === null)
      flag(
        row,
        "MISSING",
        `MISSING rule: ${row.sourceId} explicitly supplied no value at ${row.measuredAt}. This describes absent data, not a diagnosis.`,
      );
    if (delayed(row))
      flag(
        row,
        "DELAYED",
        `DELAYED rule: measured ${row.measuredAt}, received ${row.receivedAt}; delay ${(Date.parse(row.receivedAt) - Date.parse(row.measuredAt)) / 1000}s exceeds 5s. Timing may affect interpretation.`,
      );
  }
  for (const sourceId of sourceIds) {
    const previous: Observation[] = [];
    let consecutive: Observation[] = [];
    for (const row of rows.filter((o) => o.sourceId === sourceId)) {
      if (row.value === null || delayed(row)) {
        consecutive = [];
        continue;
      }
      const predecessors = previous.slice(-10).map((o) => o.value!);
      if (predecessors.length >= 5) {
        const middle = median(predecessors),
          mad = median(predecessors.map((v) => Math.abs(v - middle))),
          threshold = Math.max(20, 6 * 1.4826 * mad);
        if (Math.abs(row.value - middle) > threshold)
          flag(
            row,
            "SPIKE",
            `SPIKE rule: ${row.value} BPM at ${row.measuredAt} differs from preceding median ${middle} BPM by more than ${threshold} BPM (MAD ${mad}). A possible data-quality concern.`,
          );
      }
      previous.push(row);
      consecutive.push(row);
      consecutive = consecutive.slice(-6);
      if (consecutive.length === 6) {
        const values = consecutive.map((o) => o.value!);
        if (
          Date.parse(row.measuredAt) - Date.parse(consecutive[0].measuredAt) >=
            10000 &&
          Math.max(...values) - Math.min(...values) <= 0.1
        )
          flag(
            row,
            "REPEATED",
            `REPEATED rule: six values ${values.join(", ")} BPM from ${consecutive[0].measuredAt} to ${row.measuredAt} span at least 10s and vary by at most 0.1 BPM; possible repetition, not proven failure.`,
          );
        const differences = values.slice(1).map((v, i) => v - values[i]);
        if (
          differences.filter((d) => Math.abs(d) > 15).length >= 4 &&
          differences.slice(1).filter((d, i) => d * differences[i] < 0)
            .length >= 3
        )
          flag(
            row,
            "FLUCTUATION",
            `FLUCTUATION rule: ${values.join(", ")} BPM ending ${row.measuredAt}; at least four changes exceed 15 BPM with at least three direction changes. This is a quality concern, not a diagnosis.`,
          );
      }
    }
  }
  const eligible = rows.filter((row) => row.value !== null && !delayed(row)),
    pairs = new Set<string>();
  for (const row of eligible) {
    const other = eligible
      .filter(
        (candidate) =>
          candidate.sourceId !== row.sourceId &&
          Math.abs(
            Date.parse(candidate.measuredAt) - Date.parse(row.measuredAt),
          ) <= 2000,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.measuredAt) - Date.parse(row.measuredAt)) -
            Math.abs(Date.parse(b.measuredAt) - Date.parse(row.measuredAt)) ||
          Date.parse(a.measuredAt) - Date.parse(b.measuredAt) ||
          a.id.localeCompare(b.id),
      )[0];
    if (!other || Math.abs(other.value! - row.value!) <= 15) continue;
    const ids = [row.id, other.id].sort(),
      key = ids.join();
    if (pairs.has(key)) continue;
    pairs.add(key);
    row.flags.push("CONFLICT");
    other.flags.push("CONFLICT");
    findings.push({
      code: "CONFLICT",
      sourceIds: [...sourceIds],
      observationIds: ids,
      explanation: `CONFLICT rule: ${row.sourceId} ${row.value} BPM at ${row.measuredAt} and ${other.sourceId} ${other.value} BPM at ${other.measuredAt} differ by more than 15 BPM within 2s. Neither source is selected as correct.`,
    });
  }
  const sources = sourceIds.map((sourceId) => {
    const history = rows.filter((row) => row.sourceId === sourceId),
      latest = history.at(-1);
    const waiting = !latest && now - Date.parse(session!.startedAt) <= 6000;
    const stale =
      session!.status === "ACTIVE" &&
      !waiting &&
      !history.some(
        (row) => !delayed(row) && now - Date.parse(row.measuredAt) <= 6000,
      );
    if (stale)
      findings.push({
        code: "MISSING",
        sourceIds: [sourceId],
        observationIds: [],
        explanation: `MISSING rule: ${sourceId} has no non-delayed observation measured within six seconds of ${serverTime}; recent receipt of old data does not restore freshness.`,
      });
    const flags = findingCodes.filter(
      (code) => latest?.flags.includes(code) || (stale && code === "MISSING"),
    );
    return {
      sourceId,
      status:
        session!.status !== "ACTIVE"
          ? ("ENDED" as const)
          : waiting
            ? ("WAITING" as const)
            : stale
              ? ("STALE" as const)
              : flags.length
                ? ("SUSPECT" as const)
                : ("CURRENT" as const),
      latestObservationId: latest?.id ?? null,
      latestValue: latest?.value ?? null,
      latestMeasuredAt: latest?.measuredAt ?? null,
      lastReceivedAt: history.length
        ? history.reduce((latest, row) =>
            Date.parse(row.receivedAt) > Date.parse(latest.receivedAt) ? row : latest,
          ).receivedAt
        : null,
      ageSeconds: latest
        ? Math.max(0, (now - Date.parse(latest.measuredAt)) / 1000)
        : null,
      flags,
    };
  });
  rows.forEach((row) => {
    row.flags = findingCodes.filter((code) => row.flags.includes(code));
  });
  findings.sort(
    (a, b) =>
      findingCodes.indexOf(a.code) - findingCodes.indexOf(b.code) ||
      a.sourceIds.join().localeCompare(b.sourceIds.join()) ||
      a.observationIds.join().localeCompare(b.observationIds.join()),
  );
  const readableTime = (value: string) => {
    const date = new Date(value);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
    return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()} at ${date.toISOString().slice(11, 19)} UTC`;
  };
  const labels = { MISSING: "Missing readings", SPIKE: "Sudden spikes", REPEATED: "Repeated values", FLUCTUATION: "Fluctuating values", DELAYED: "Delayed readings", CONFLICT: "Source disagreements" };
  const statuses = { WAITING: "Waiting for readings", CURRENT: "Current", SUSPECT: "Flagged for review", STALE: "No recent readings", ENDED: "Session ended" };
  const parts = [`Synthetic data. Session ${session.status.toLowerCase()}.\nReport captured: ${readableTime(serverTime)}`];
  if (session.status !== "ACTIVE") parts[0] += `\nSession ended: ${readableTime(session.stoppedAt ?? session.expiresAt)}. These readings are historical.`;
  for (const source of sources) {
    const name = source.sourceId === "SENSOR_A" ? "Synthetic sensor A" : "Synthetic sensor B";
    const value = source.latestValue === null ? "No value received" : `${source.latestValue} BPM`;
    parts.push(`${name}\nLast reading: ${value}\nMeasured: ${source.latestMeasuredAt ? readableTime(source.latestMeasuredAt) : "Not available"}\nStatus: ${statuses[source.status]}\nData-quality flags: ${source.flags.map(code => labels[code]).join(", ") || "None"}`);
  }
  const total = findings.length;
  const title = total ? `${total} data-quality ${total === 1 ? "finding" : "findings"} in this session.` : "No data-quality findings in this session.";
  parts.push(title + "\n" + findingCodes.map(code => `${labels[code]}: ${findings.filter(f => f.code === code).length}`).join("\n"));
  parts.push("How to interpret this report\nFlags highlight possible data-quality concerns, not a diagnosis. No flags does not guarantee reliable readings.");
  const summary = parts.join("\n\n");
  return {
    contractVersion: "TR-1.0",
    serverTime,
    session,
    observations: rows,
    sources,
    findings,
    summary,
  };
}
export function telemetryMock(
  patientId: string,
  actorId: string,
  suffix: string,
  method: string,
  body: unknown,
  url: URL,
  fail: Fail,
): { value: unknown; status: number; action?: string; targetId: string } {
  const now = Date.now();
  const object = (value: unknown, keys: string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      keys.some((key) => !(key in value))
    )
      fail("VALIDATION_FAILED", 422);
    return value as Record<string, unknown>;
  };
  const uuid = (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  if (suffix === "/sessions" && method === "POST") {
    const b = object(body, ["requestId"]);
    if (!uuid(b.requestId)) fail("VALIDATION_FAILED", 422);
    const key = `${patientId}/${actorId}/${b.requestId}`,
      replay = creations.get(key);
    if (replay) return { value: replay, status: 200, targetId: replay.id };
    if (
      sessions.some(
        (s) => s.patientId === patientId && project(s, now).status === "ACTIVE",
      )
    )
      fail("VERSION_CONFLICT", 409);
    const session: Session = {
      id: uid("tel"),
      patientId,
      version: 1,
      status: "ACTIVE",
      startedAt: iso(now),
      expiresAt: iso(now + 900000),
      stoppedAt: null,
      metric: "HEART_RATE",
      unit: "BPM",
      expectedIntervalSeconds: 2,
      sources: sourceIds.map((id, i) => ({
        id,
        label: `Synthetic sensor ${i ? "B" : "A"}`,
      })),
    };
    sessions.push(session);
    observations.set(session.id, []);
    creations.set(key, structuredClone(session));
    return {
      value: session,
      status: 201,
      action: "TELEMETRY_SESSION_CREATED",
      targetId: session.id,
    };
  }
  if (suffix === "/snapshot" && method === "GET") {
    const selected = url.searchParams.get("sessionId");
    const session = selected
      ? sessions.find((s) => s.id === selected && s.patientId === patientId)
      : sessions
          .filter((s) => s.patientId === patientId)
          .sort(
            (a, b) =>
              Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
              b.id.localeCompare(a.id),
          )[0];
    if (selected && !session) fail("NOT_FOUND", 404);
    return {
      value: mockSnapshot(
        session ?? null,
        session ? observations.get(session.id)! : [],
        now,
      ),
      status: 200,
      targetId: session?.id ?? patientId,
    };
  }
  const match = suffix.match(/^\/sessions\/([^/]+)\/(readings|stop)$/);
  if (!match || method !== "POST") fail("NOT_FOUND", 404);
  const session =
    sessions.find((s) => s.id === match[1] && s.patientId === patientId) ??
    fail("NOT_FOUND", 404);
  const current = project(session, now);
  if (match[2] === "stop") {
    const b = object(body, ["ifVersion"]);
    if (!Number.isInteger(b.ifVersion)) fail("VALIDATION_FAILED", 422);
    if (b.ifVersion !== session.version) fail("VERSION_CONFLICT", 409);
    if (current.status === "ACTIVE") {
      session.status = "STOPPED";
      session.stoppedAt = iso(now);
      session.version++;
      return {
        value: session,
        status: 200,
        action: "TELEMETRY_SESSION_STOPPED",
        targetId: session.id,
      };
    }
    return { value: current, status: 200, targetId: session.id };
  }
  const b = object(body, ["readings"]);
  if (
    !Array.isArray(b.readings) ||
    !b.readings.length ||
    b.readings.length > 100
  )
    fail("VALIDATION_FAILED", 422);
  const stored = observations.get(session.id)!,
    events = new Map(stored.map((o) => [o.eventId, o]));
  const added: Observation[] = [];
  let duplicateCount = 0;
  for (const input of b.readings) {
    const r = object(input, [
      "eventId",
      "sourceId",
      "measuredAt",
      "value",
    ]) as unknown as ReadingInput;
    if (
      !uuid(r.eventId) ||
      !sourceIds.includes(r.sourceId) ||
      typeof r.measuredAt !== "string" ||
      !/Z$/.test(r.measuredAt) ||
      !Number.isFinite(Date.parse(r.measuredAt)) ||
      Date.parse(r.measuredAt) < Date.parse(session.startedAt) ||
      Date.parse(r.measuredAt) > now + 5000 ||
      (r.value !== null &&
        (typeof r.value !== "number" ||
          !Number.isFinite(r.value) ||
          r.value < 0 ||
          r.value > 1000))
    )
      fail("VALIDATION_FAILED", 422);
    const previous = events.get(r.eventId);
    if (previous) {
      if (
        previous.sourceId !== r.sourceId ||
        Date.parse(previous.measuredAt) !== Date.parse(r.measuredAt) ||
        previous.value !== r.value
      )
        fail("VERSION_CONFLICT", 409);
      duplicateCount++;
      continue;
    }
    const observation: Observation = {
      ...r,
      id: uid("obs"),
      sessionId: session.id,
      receivedAt: iso(now),
      flags: [],
    };
    events.set(r.eventId, observation);
    added.push(observation);
  }
  if (added.length && current.status !== "ACTIVE")
    fail("VERSION_CONFLICT", 409);
  if (stored.length + added.length > 1000) fail("VALIDATION_FAILED", 422);
  stored.push(...added);
  return {
    value: {
      acceptedCount: added.length,
      duplicateCount,
      serverTime: iso(now),
    },
    status: 200,
    ...(added.length ? { action: "TELEMETRY_READINGS_INGESTED" } : {}),
    targetId: session.id,
  };
}
