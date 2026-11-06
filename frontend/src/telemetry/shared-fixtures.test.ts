import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mockSnapshot } from "../mocks/telemetry";
import type { Snapshot } from "./contract";

describe("published Member 2 TR-1.0 examples", () => {
  for (const name of ["empty", "healthy", "missing", "spike", "repeated", "fluctuation", "delayed", "conflict"]) {
    it(`keeps the mock projection consistent with ${name}`, () => {
      const fixture = JSON.parse(readFileSync(new URL(`../../../fixtures/telemetry/${name}.json`, import.meta.url), "utf8"));
      const expected: Snapshot = fixture.snapshot;
      const actual = mockSnapshot(expected.session, expected.observations, Date.parse(expected.serverTime));
      expect(actual.observations).toEqual(expected.observations);
      expect(actual.sources).toEqual(expected.sources);
      const evidence = (s: Snapshot) => s.findings.map(({ code, sourceIds, observationIds }) => ({ code, sourceIds, observationIds }));
      expect(evidence(actual)).toEqual(evidence(expected));
      expect(actual.contractVersion).toBe(expected.contractVersion);
      expect(actual.summary).toBe(expected.summary);
    });
  }
});
