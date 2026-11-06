import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { telemetryApi } from "./api";
import { chartSegments } from "./chart";
import { SyntheticFeed } from "./feed";
import type { Observation, Session } from "./contract";
const start = Date.parse("2026-11-05T00:00:00Z");
const session: Session = {
  id: "tel_test",
  patientId: "pat_test",
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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("synthetic feed transport", () => {
  it("retries identical uncertain payloads without overlap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const ingest = vi
      .spyOn(telemetryApi, "ingest")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({
        acceptedCount: 2,
        duplicateCount: 0,
        serverTime: new Date(start + 5000).toISOString(),
      });
    const feed = new SyntheticFeed("pat_test", session, vi.fn(), vi.fn());
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    const original = structuredClone(ingest.mock.calls[0][2]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ingest.mock.calls[1][2]).toEqual(original);
    expect(new Set(original.map((o) => o.eventId)).size).toBe(2);
    feed.cancel();
    await vi.advanceTimersByTimeAsync(10000);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
  it("keeps one ingestion in flight and discards unsent delayed events on mode change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    let resolve!: (value: {
      acceptedCount: number;
      duplicateCount: number;
      serverTime: string;
    }) => void;
    const ingest = vi
      .spyOn(telemetryApi, "ingest")
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue({
        acceptedCount: 2,
        duplicateCount: 0,
        serverTime: new Date(start + 12000).toISOString(),
      });
    const feed = new SyntheticFeed("pat_test", session, vi.fn(), vi.fn());
    feed.setMode("Delayed");
    feed.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0][2].map((r) => r.sourceId)).toEqual([
      "SENSOR_B",
    ]);
    feed.setMode("Normal");
    resolve({
      acceptedCount: 1,
      duplicateCount: 0,
      serverTime: new Date(start + 10000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ingest.mock.calls[1][2]).toHaveLength(2);
    expect(
      ingest.mock.calls[1][2].every(
        (r) => Date.parse(r.measuredAt) === start + 12000,
      ),
    ).toBe(true);
    feed.cancel();
  });
  it("stops immediately on access rejection and makes no further submissions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const ingest = vi
      .spyOn(telemetryApi, "ingest")
      .mockRejectedValue(new ApiError("FORBIDDEN", "Access revoked"));
    const notify = vi.fn(),
      feed = new SyntheticFeed("pat_test", session, notify, vi.fn());
    feed.start();
    await vi.advanceTimersByTimeAsync(20000);
    expect(feed.running).toBe(false);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBeInstanceOf(ApiError);
  });
  it("releases delayed readings after eight seconds with their original measurement time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const ingest = vi
      .spyOn(telemetryApi, "ingest")
      .mockImplementation(async () => ({
        acceptedCount: 2,
        duplicateCount: 0,
        serverTime: new Date().toISOString(),
      }));
    const feed = new SyntheticFeed("pat_test", session, vi.fn(), vi.fn());
    feed.setMode("Delayed");
    feed.start();
    await vi.advanceTimersByTimeAsync(8000);
    expect(
      ingest.mock.calls
        .slice(0, 4)
        .every((call) => call[2].every((r) => r.sourceId === "SENSOR_B")),
    ).toBe(true);
    const released = ingest.mock.calls[4][2].find(
      (r) => r.sourceId === "SENSOR_A",
    );
    expect(released?.measuredAt).toBe(session.startedAt);
    feed.cancel();
  });
  it("generates each fault mode without supplying classifications or replacement readings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const ingest = vi
      .spyOn(telemetryApi, "ingest")
      .mockImplementation(async () => ({
        acceptedCount: 2,
        duplicateCount: 0,
        serverTime: new Date().toISOString(),
      }));
    const feed = new SyntheticFeed("pat_test", session, vi.fn(), vi.fn());
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ingest.mock.calls.at(-1)![2].map((r) => r.value)).toEqual([79, 78]);
    feed.setMode("Missing");
    await vi.advanceTimersByTimeAsync(2000);
    expect(ingest.mock.calls.at(-1)![2].map((r) => r.sourceId)).toEqual([
      "SENSOR_B",
    ]);
    feed.setMode("Spike");
    await vi.advanceTimersByTimeAsync(2000);
    expect(
      ingest.mock.calls.at(-1)![2].find((r) => r.sourceId === "SENSOR_A")
        ?.value,
    ).toBe(180);
    expect(feed.mode).toBe("Normal");
    feed.setMode("Repeated");
    await vi.advanceTimersByTimeAsync(4000);
    expect(
      ingest.mock.calls
        .slice(-2)
        .every(
          (call) =>
            call[2].find((r) => r.sourceId === "SENSOR_A")?.value === 80,
        ),
    ).toBe(true);
    feed.setMode("Fluctuation");
    await vi.advanceTimersByTimeAsync(4000);
    expect(
      ingest.mock.calls
        .slice(-2)
        .map((call) => call[2].find((r) => r.sourceId === "SENSOR_A")?.value),
    ).toEqual([60, 110]);
    feed.setMode("Conflict");
    await vi.advanceTimersByTimeAsync(2000);
    expect(ingest.mock.calls.at(-1)![2].map((r) => r.value)).toEqual([79, 108]);
    const count = ingest.mock.calls.length;
    feed.setMode("Both offline");
    await vi.advanceTimersByTimeAsync(10000);
    expect(ingest).toHaveBeenCalledTimes(count);
    feed.cancel();
  });
});
it("chart preserves explicit nulls and gaps over six seconds", () => {
  const rows = [0, 2000, 4000, 6000, 13000].map((offset, index) => ({
    id: `${index}`,
    sourceId: "SENSOR_A",
    value: index === 1 ? null : 80,
    measuredAt: new Date(start + offset).toISOString(),
  })) as Observation[];
  expect(
    chartSegments(rows, "SENSOR_A").map((segment) => segment.map((o) => o.id)),
  ).toEqual([["0"], ["2", "3"], ["4"]]);
});
