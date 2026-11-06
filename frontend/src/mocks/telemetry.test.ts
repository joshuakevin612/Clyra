import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { mockSnapshot } from "./telemetry";
import type { Observation, Session } from "../telemetry/contract";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
const base = "http://localhost/api/v1";
async function auth(username = "dr.north") {
  const response = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "Clyra-demo-2026" }),
  });
  return { Authorization: `Bearer ${(await response.json()).accessToken}` };
}
describe("TR-1.0 mock HTTP contract", () => {
  it("handles empty, creation replay, atomic conflicts, stop, and late duplicate-only retry", async () => {
    const headers = await auth(),
      path = base + "/patients/pat_003/telemetry";
    const post = (suffix: string, body: unknown) =>
      fetch(path + suffix, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const empty = await (await fetch(path + "/snapshot", { headers })).json();
    expect(empty).toMatchObject({
      contractVersion: "TR-1.0",
      session: null,
      observations: [],
      sources: [],
      findings: [],
      summary: "No telemetry session has been started.",
    });
    const requestId = crypto.randomUUID(),
      created = await post("/sessions", { requestId });
    expect(created.status).toBe(201);
    const session = await created.json();
    expect(await (await post("/sessions", { requestId })).json()).toEqual(
      session,
    );
    expect(
      (await post("/sessions", { requestId: crypto.randomUUID() })).status,
    ).toBe(409);
    expect(
      (
        await post("/sessions", {
          requestId: crypto.randomUUID(),
          unexpected: true,
        })
      ).status,
    ).toBe(422);
    const event = {
      eventId: crypto.randomUUID(),
      sourceId: "SENSOR_A",
      measuredAt: session.startedAt,
      value: null,
    };
    const readings = `/sessions/${session.id}/readings`;
    expect(
      await (await post(readings, { readings: [event, event] })).json(),
    ).toMatchObject({ acceptedCount: 1, duplicateCount: 1 });
    expect(
      (
        await post(readings, {
          readings: [
            { ...event, eventId: crypto.randomUUID(), value: 80 },
            { ...event, value: 81 },
          ],
        })
      ).status,
    ).toBe(409);
    const snapshot = await (
      await fetch(path + "/snapshot", { headers })
    ).json();
    expect(snapshot.observations).toHaveLength(1);
    expect(snapshot.sources[0].latestValue).toBeNull();
    expect(snapshot.observations[0].flags).toEqual(["MISSING"]);
    expect(
      (await post(`/sessions/${session.id}/stop`, { ifVersion: 9 })).status,
    ).toBe(409);
    expect(
      await (
        await post(`/sessions/${session.id}/stop`, { ifVersion: 1 })
      ).json(),
    ).toMatchObject({ status: "STOPPED", version: 2 });
    expect(
      await (await post(readings, { readings: [event] })).json(),
    ).toMatchObject({ acceptedCount: 0, duplicateCount: 1 });
    expect(
      (
        await post(readings, {
          readings: [event, { ...event, eventId: crypto.randomUUID() }],
        })
      ).status,
    ).toBe(409);
    expect(await (await post("/sessions", { requestId })).json()).toEqual(
      session,
    );
  });
  it("rejects forbidden roles and view-only writes, masks inaccessible patients and mismatched sessions", async () => {
    for (const user of ["admin.north", "alex.example", "platform.demo"]) {
      const headers = await auth(user);
      expect(
        (
          await fetch(base + "/patients/pat_001/telemetry/snapshot", {
            headers,
          })
        ).status,
      ).toBe(403);
    }
    const headers = await auth("dr.riverside");
    expect(
      (await fetch(base + "/patients/pat_001/telemetry/snapshot", { headers }))
        .status,
    ).toBe(200);
    expect(
      (
        await fetch(base + "/patients/pat_001/telemetry/sessions", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(403);
    const full = await auth();
    expect(
      (
        await fetch(base + "/patients/pat_002/telemetry/snapshot", {
          headers: full,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(
          base + "/patients/pat_001/telemetry/snapshot?sessionId=tel_other",
          { headers: full },
        )
      ).status,
    ).toBe(404);
  });
});
const start = Date.parse("2026-11-05T00:00:00Z");
const session: Session = {
  id: "tel_rules",
  patientId: "pat_rules",
  version: 1,
  status: "ACTIVE",
  startedAt: new Date(start).toISOString(),
  expiresAt: new Date(start + 900000).toISOString(),
  stoppedAt: null,
  metric: "HEART_RATE",
  unit: "BPM",
  expectedIntervalSeconds: 2,
  sources: [],
};
function observations(
  values: (number | null)[],
  sourceId: "SENSOR_A" | "SENSOR_B" = "SENSOR_A",
): Observation[] {
  return values.map((value, i) => ({
    id: `obs_${sourceId}_${i}`,
    eventId: crypto.randomUUID(),
    sessionId: session.id,
    sourceId,
    value,
    measuredAt: new Date(start + i * 2000).toISOString(),
    receivedAt: new Date(start + i * 2000).toISOString(),
    flags: [],
  }));
}
it("mock projects all six rules and preserves healthy data without findings", () => {
  const baseline = [78, 80, 79, 81, 80, 78],
    a = observations(baseline),
    b = observations(
      baseline.map((v) => v + 1),
      "SENSOR_B",
    );
  expect(mockSnapshot(session, [...a, ...b], start + 10000).findings).toEqual(
    [],
  );
  const scenarios = [
    { code: "MISSING", rows: observations([null]) },
    { code: "SPIKE", rows: observations([78, 80, 79, 81, 80, 180]) },
    { code: "REPEATED", rows: observations([80, 80, 80, 80, 80, 80]) },
    { code: "FLUCTUATION", rows: observations([60, 110, 60, 110, 60, 110]) },
    {
      code: "DELAYED",
      rows: a.map((row) => ({
        ...row,
        receivedAt: new Date(Date.parse(row.measuredAt) + 8000).toISOString(),
      })),
    },
    {
      code: "CONFLICT",
      rows: [...a.map((row) => ({ ...row, value: row.value! + 30 })), ...b],
    },
  ];
  for (const { code, rows } of scenarios)
    expect(
      mockSnapshot(session, rows, start + 10000).findings.some(
        (f) => f.code === code,
      ),
      code,
    ).toBe(true);
});
it("staleness uses measurement freshness, initial grace, and ends without new absence findings", () => {
  expect(mockSnapshot(session, [], start + 6000).sources[0].status).toBe(
    "WAITING",
  );
  expect(mockSnapshot(session, [], start + 6001).sources[0].status).toBe(
    "STALE",
  );
  const delayed = observations([80]).map((o) => ({
    ...o,
    receivedAt: new Date(start + 8000).toISOString(),
  }));
  expect(mockSnapshot(session, delayed, start + 8000).sources[0].status).toBe(
    "STALE",
  );
  const ended = mockSnapshot(
    {
      ...session,
      status: "STOPPED",
      stoppedAt: new Date(start + 10000).toISOString(),
    },
    delayed,
    start + 60000,
  );
  expect(ended.sources.every((s) => s.status === "ENDED")).toBe(true);
  expect(ended.findings.some((f) => f.code === "MISSING")).toBe(false);
});
