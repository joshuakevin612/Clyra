import { request, send } from "../api/client";
import type { IngestResult, ReadingInput, Session, Snapshot } from "./contract";
const path = (patientId: string) =>
  `/patients/${encodeURIComponent(patientId)}/telemetry`;
const pendingSnapshots = new Map<string, Promise<Snapshot>>();
export const telemetryApi = {
  snapshot: (patientId: string, signal?: AbortSignal) => {
    const pending = pendingSnapshots.get(patientId);
    if (pending) return pending;
    const result = request<Snapshot>(`${path(patientId)}/snapshot`, {
      signal,
    }).finally(() => {
      if (pendingSnapshots.get(patientId) === result)
        pendingSnapshots.delete(patientId);
    });
    pendingSnapshots.set(patientId, result);
    return result;
  },
  create: (patientId: string, requestId: string) =>
    send<Session>(`${path(patientId)}/sessions`, { requestId }),
  ingest: (patientId: string, sessionId: string, readings: ReadingInput[]) =>
    send<IngestResult>(
      `${path(patientId)}/sessions/${encodeURIComponent(sessionId)}/readings`,
      { readings },
    ),
  stop: (patientId: string, session: Session) =>
    send<Session>(
      `${path(patientId)}/sessions/${encodeURIComponent(session.id)}/stop`,
      { ifVersion: session.version },
    ),
};
