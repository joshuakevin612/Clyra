// EI-1.0 types come from the generated contract (contract/openapi.yaml).
import type {
  ConfirmImport,
  ExternalImportOutput,
  ExternalSource,
} from "./generated";
export type { ConfirmImport, ExternalImportOutput, ExternalSource };

export const EI_MAX_BYTES = 2_000_000;
export type ImportStatus = ExternalImportOutput["status"];
export type StageInput = {
  patientId: string;
  sourceLabel: string;
  visitDate: string;
  requestId: string;
  file: File;
};

/** Returns a user-facing problem with the inputs, or null when acceptable. */
export function validateStage(
  sourceLabel: string,
  visitDate: string,
  file: File | null | undefined,
): string | null {
  if (!sourceLabel.trim() || sourceLabel.length > 200)
    return "Enter a source label of 1 to 200 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return "Choose a visit date.";
  if (!file) return "Choose a text file to import.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > EI_MAX_BYTES)
    return "The file is larger than 2,000,000 bytes and cannot be imported.";
  return null;
}
export function stageForm(i: StageInput): FormData {
  const f = new FormData();
  f.set("patientId", i.patientId);
  f.set("sourceLabel", i.sourceLabel);
  f.set("visitDate", i.visitDate);
  f.set("requestId", i.requestId);
  f.set("file", i.file);
  return f;
}
export function confirmBody(
  imp: Pick<ExternalImportOutput, "version" | "patientId">,
  patientIfVersion: number,
): ConfirmImport {
  return {
    ifVersion: imp.version,
    patientId: imp.patientId,
    patientIfVersion,
    confirmAssociation: true,
  };
}
