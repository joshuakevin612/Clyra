import { describe, expect, it } from "vitest";
import {
  confirmBody,
  EI_MAX_BYTES,
  stageForm,
  validateStage,
} from "./externalImport";

const file = (n: number) => new File([new Uint8Array(n)], "x.txt");
describe("EI-1.0 client helpers", () => {
  it("validates label, date and size limits", () => {
    expect(validateStage("  ", "2026-01-01", file(5))).toMatch(/label/);
    expect(validateStage("a", "", file(5))).toMatch(/date/);
    expect(validateStage("a", "2026-01-01", null)).toMatch(/file/);
    expect(validateStage("a", "2026-01-01", file(0))).toMatch(/empty/);
    expect(validateStage("a", "2026-01-01", file(EI_MAX_BYTES + 1))).toMatch(
      /2,000,000/,
    );
    expect(validateStage("a", "2026-01-01", file(EI_MAX_BYTES))).toBeNull();
  });
  it("builds the multipart form with every required field", () => {
    const f = stageForm({
      patientId: "p",
      sourceLabel: "s",
      visitDate: "2026-01-01",
      requestId: "r",
      file: file(1),
    });
    expect([...f.keys()].sort()).toEqual([
      "file",
      "patientId",
      "requestId",
      "sourceLabel",
      "visitDate",
    ]);
  });
  it("builds an exact confirm body with explicit association", () => {
    expect(confirmBody({ version: 1, patientId: "pat_001" }, 4)).toEqual({
      ifVersion: 1,
      patientId: "pat_001",
      patientIfVersion: 4,
      confirmAssociation: true,
    });
  });
});
