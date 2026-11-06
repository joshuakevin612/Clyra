// Wire types generated from the integrated TR-1.0 OpenAPI contract.
export type {
  TelemetrySessionOutput as Session,
  ReadingInput,
  ObservationOutput as Observation,
  SourceState,
  Finding,
  TelemetrySnapshot as Snapshot,
  TelemetryIngested as IngestResult,
} from "../api/generated";
import type { ReadingInput, Finding } from "../api/generated";
export type SourceId = ReadingInput["sourceId"];
export type FindingCode = Finding["code"];
export const sourceIds = ["SENSOR_A", "SENSOR_B"] as const;
export const findingCodes = [
  "MISSING", "SPIKE", "REPEATED", "FLUCTUATION", "DELAYED", "CONFLICT",
] as const;
