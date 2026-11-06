import { ApiError } from "../api/client";
import { telemetryApi } from "./api";
import type { ReadingInput, Session } from "./contract";
export const modes = [
  "Normal",
  "Missing",
  "Spike",
  "Repeated",
  "Fluctuation",
  "Delayed",
  "Conflict",
  "Both offline",
] as const;
export type Mode = (typeof modes)[number];
const normal = [78, 80, 79, 81, 80];
// No classifications live here: fault modes only generate synthetic input events.
export class SyntheticFeed {
  mode: Mode = "Normal";
  running = false;
  private tickIndex = 0;
  private queue: { due: number; reading: ReadingInput }[] = [];
  private pending: ReadingInput[] | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight: Promise<void> | null = null;
  private retries = 0;
  private clockOffset: number;
  constructor(
    private patientId: string,
    private session: Session,
    private notify: (message: string, error?: unknown) => void,
    private changed: () => void,
    serverTime = session.startedAt,
  ) {
    this.clockOffset = Date.parse(serverTime) - Date.now();
  }
  setMode(mode: Mode) {
    this.mode = mode;
    this.tickIndex = 0;
    this.queue = [];
    this.changed();
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.changed();
    this.schedule(0);
  }
  cancel() {
    this.running = false;
    clearTimeout(this.timer);
    this.queue = [];
    this.pending = null;
    this.changed();
  }
  async drain() {
    this.cancel();
    await this.inFlight;
  }
  private schedule(ms: number) {
    if (this.running)
      this.timer = setTimeout(() => {
        this.inFlight = this.tick().finally(() => {
          this.inFlight = null;
        });
      }, ms);
  }
  private async tick() {
    if (!this.running) return;
    const now = Date.now() + this.clockOffset;
    if (now >= Date.parse(this.session.expiresAt)) {
      this.cancel();
      this.notify("Session expired; synthetic feed stopped.");
      return;
    }
    if (!this.pending) {
      const measuredAt = new Date(
        Math.max(now, Date.parse(this.session.startedAt)),
      ).toISOString();
      const reading = (
        sourceId: ReadingInput["sourceId"],
        value: number,
      ): ReadingInput => ({
        eventId: crypto.randomUUID(),
        sourceId,
        measuredAt,
        value,
      });
      const n = this.tickIndex++;
      const baseline = normal[n % normal.length];
      const batch: ReadingInput[] = [];
      if (this.mode !== "Both offline") {
        batch.push(reading("SENSOR_B", baseline + 1));
        if (this.mode !== "Missing") {
          const value =
            this.mode === "Spike"
              ? 180
              : this.mode === "Repeated"
                ? 80
                : this.mode === "Fluctuation"
                  ? n % 2
                    ? 110
                    : 60
                  : this.mode === "Conflict"
                    ? baseline + 30
                    : baseline;
          const a = reading("SENSOR_A", value);
          if (this.mode === "Delayed")
            this.queue.push({ due: now + 8000, reading: a });
          else batch.push(a);
        }
      }
      const due = this.queue.filter((item) => item.due <= now);
      this.queue = this.queue.filter((item) => item.due > now);
      batch.push(...due.map((item) => item.reading));
      if (this.mode === "Spike") this.setMode("Normal");
      this.pending = batch.length ? batch : null;
    }
    try {
      if (this.pending) {
        const result = await telemetryApi.ingest(
          this.patientId,
          this.session.id,
          this.pending,
        );
        this.clockOffset = Date.parse(result.serverTime) - Date.now();
      }
      this.pending = null;
      this.retries = 0;
      this.schedule(2000);
    } catch (error) {
      if (!this.running) return;
      const terminal =
        error instanceof ApiError &&
        [
          "UNAUTHENTICATED",
          "FORBIDDEN",
          "NOT_FOUND",
          "ACCOUNT_DISABLED",
          "VERSION_CONFLICT",
          "VALIDATION_FAILED",
        ].includes(error.code);
      if (terminal || ++this.retries >= 3) {
        this.cancel();
        this.notify(
          "Synthetic feed stopped: " +
            (error instanceof Error ? error.message : "transmission failed"),
          error,
        );
      } else {
        this.notify("Transmission uncertain; retrying the identical batch.");
        this.schedule(5000);
      }
    }
  }
}
