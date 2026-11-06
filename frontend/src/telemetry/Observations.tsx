import { useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "../api/client";
import { telemetryApi } from "./api";
import { chartSegments } from "./chart";
import { sourceIds, type Snapshot } from "./contract";
import { SyntheticFeed, modes } from "./feed";

const time = (value: string | null) => value ?? "Not available";
const label = (id: string) =>
  id === "SENSOR_A" ? "Synthetic sensor A" : "Synthetic sensor B";
const rowId = (id: string) => `telemetry-${id}`;
function Chart({ snapshot }: { snapshot: Snapshot }) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, entry.contentRect.width)),
    );
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [snapshot.observations.some((o) => o.value !== null)]);
  const numeric = snapshot.observations.filter((o) => o.value !== null);
  const start = Math.min(...numeric.map((o) => Date.parse(o.measuredAt)));
  const end = Math.max(
    start + 1000,
    ...numeric.map((o) => Date.parse(o.measuredAt)),
  );
  const min = Math.min(...numeric.map((o) => o.value!), 60) - 5;
  const max = Math.max(...numeric.map((o) => o.value!), 100) + 5;
  const x = (date: string) =>
    45 + ((Date.parse(date) - start) / (end - start)) * (width - 65);
  const y = (value: number) => 190 - ((value - min) / (max - min)) * 160;
  return (
    <section className="scroll-chapter" aria-labelledby="chart-heading">
      <h3 id="chart-heading">Heart rate history</h3>
      <p id="chart-description">
        Synthetic sensor A: solid line. Synthetic sensor B: dashed line. Missing
        values and gaps over six seconds break the lines. Exact values,
        timestamps, and flags follow in the readings table.
      </p>
      {numeric.length ? (
        <svg
          ref={svg}
          className="telemetry-chart"
          viewBox={`0 0 ${width} 230`}
          role="img"
          aria-label="Synthetic heart rate history in BPM"
          aria-describedby="chart-description"
        >
          <text x="5" y="20" fill="currentColor">
            BPM
          </text>
          {[min, (min + max) / 2, max].map((v) => (
            <g key={v}>
              <line
                x1="45"
                y1={y(v)}
                x2={width - 20}
                y2={y(v)}
                stroke="var(--line)"
              />
              <text x="4" y={y(v) + 4} fill="currentColor">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {sourceIds.map((id, i) => (
            <g
              key={id}
              fill="none"
              stroke={i ? "var(--ink)" : "var(--teal)"}
              strokeWidth="2"
            >
              {chartSegments(snapshot.observations, id).map((segment, j) => (
                <g key={j}>
                  <polyline
                    strokeDasharray={i ? "7 5" : undefined}
                    points={segment
                      .map((o) => `${x(o.measuredAt)},${y(o.value!)}`)
                      .join(" ")}
                  />
                  {segment.map((o) => (
                    <circle
                      key={o.id}
                      cx={x(o.measuredAt)}
                      cy={y(o.value!)}
                      r="3"
                    />
                  ))}
                </g>
              ))}
            </g>
          ))}
          <text x="45" y="220" fill="currentColor">
            Earlier
          </text>
          <text x={width - 20} y="220" textAnchor="end" fill="currentColor">
            Later
          </text>
        </svg>
      ) : (
        <p>No numeric observations to plot.</p>
      )}
    </section>
  );
}

export function Observations({
  patientId,
  write,
}: {
  patientId: string;
  write: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [copyError, setCopyError] = useState(false);
  const [, render] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const feed = useRef<SyntheticFeed | null>(null);
  const pausedRef = useRef(false);
  const latest = useRef<Snapshot | undefined>(undefined);
  const creationId = useRef<string | null>(null);
  const refresh = useRef<() => void>(() => {});
  const alive = useRef(false);
  const blocked = useRef(false);
  const clearAccess = () => {
    blocked.current = true;
    feed.current?.cancel();
    latest.current = undefined;
    setSnapshot(undefined);
    setHistory([]);
    setDenied(true);
    setAnnouncement("Telemetry access is unavailable.");
  };
  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    let disposed = false,
      inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (
        disposed ||
        blocked.current ||
        inFlight ||
        document.visibilityState === "hidden" ||
        pausedRef.current
      )
        return;
      clearTimeout(timer);
      inFlight = true;
      let delay = 2000;
      try {
        const next = await telemetryApi.snapshot(patientId);
        if (disposed || blocked.current) return;
        if (next.session?.status !== "ACTIVE") feed.current?.cancel();
        if (pausedRef.current) return;
        const changes = next.sources
          .filter(
            (source) =>
              latest.current?.sources.find(
                (s) => s.sourceId === source.sourceId,
              )?.status !== source.status,
          )
          .map((s) => `${label(s.sourceId)}: ${s.status}`);
        if (changes.length) {
          const message = changes.join(". ");
          setAnnouncement(message);
          setHistory((previous) =>
            [`${next.serverTime} — ${message}`, ...previous].slice(0, 10),
          );
        }
        latest.current = next;
        setSnapshot(next);
        setError("");
      } catch (failure) {
        if (disposed) return;
        if (
          failure instanceof ApiError &&
          [
            "UNAUTHENTICATED",
            "FORBIDDEN",
            "NOT_FOUND",
            "ACCOUNT_DISABLED",
          ].includes(failure.code)
        ) {
          clearAccess();
          disposed = true;
        } else {
          setError("Connection unavailable");
          delay = 5000;
        }
      } finally {
        inFlight = false;
        if (!disposed && !pausedRef.current) timer = setTimeout(poll, delay);
      }
    }
    refresh.current = () => {
      clearTimeout(timer);
      void poll();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh.current();
      else clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => {
      disposed = true;
      alive.current = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      feed.current?.cancel();
    };
  }, [patientId]);
  useEffect(() => {
    if (!write) feed.current?.cancel();
  }, [write]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await run();
    } catch (failure) {
      if (!alive.current) return;
      if (
        failure instanceof ApiError &&
        [
          "UNAUTHENTICATED",
          "FORBIDDEN",
          "NOT_FOUND",
          "ACCOUNT_DISABLED",
        ].includes(failure.code)
      )
        clearAccess();
      else setNotice(errorMessage(failure));
    } finally {
      if (alive.current) {
        setBusy(false);
        refresh.current();
      }
    }
  }
  function startFeed(
    session: NonNullable<Snapshot["session"]>,
    serverTime: string,
  ) {
    if (!alive.current) return;
    feed.current?.cancel();
    feed.current = new SyntheticFeed(
      patientId,
      session,
      (message, failure) => {
        if (alive.current) {
          if (
            failure instanceof ApiError &&
            [
              "UNAUTHENTICATED",
              "FORBIDDEN",
              "NOT_FOUND",
              "ACCOUNT_DISABLED",
            ].includes(failure.code)
          )
            clearAccess();
          else {
            setNotice(message);
            refresh.current();
          }
        }
      },
      () => {
        if (alive.current) render((n) => n + 1);
      },
      serverTime,
    );
    feed.current.start();
  }
  const session = snapshot?.session;
  return (
    <section className="panel telemetry" aria-labelledby="observations-heading">
      <h2 id="observations-heading" tabIndex={-1} ref={heading}>
        Observations
      </h2>
      <p className="notice">
        Synthetic demonstration — not a connected medical device.
      </p>
      <p>
        Quality flags describe data concerns, not diagnoses or treatment alerts.
        No flags does not prove reliability.
      </p>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {denied ? (
        <p role="alert">
          Telemetry is unavailable to your account. Return to patient selection
          or sign in again.
        </p>
      ) : (
        <>
          {error && (
            <p role="status">
              {error}
              {snapshot
                ? `; showing data captured at ${snapshot.serverTime}`
                : "; no snapshot available"}
              . Retrying every five seconds.
            </p>
          )}
          {!snapshot && !error && <p>Loading observations…</p>}
          {snapshot && (
            <>
              <div className="actions">
                <button
                  onClick={() => {
                    pausedRef.current = !pausedRef.current;
                    setPaused(pausedRef.current);
                    if (!pausedRef.current) {
                      setAnnouncement(
                        "Display updates resumed; fetching a fresh snapshot.",
                      );
                      refresh.current();
                    }
                  }}
                >
                  {paused ? "Resume display updates" : "Pause display updates"}
                </button>
              </div>
              {paused && (
                <p className="notice">
                  Display paused at {snapshot.serverTime}. Synthetic ingestion
                  continues independently.
                </p>
              )}
              <p>
                Session: <strong>{session?.status ?? "Not started"}</strong> ·
                Snapshot: <time>{snapshot.serverTime}</time>
              </p>
              {session && (
                <p>
                  Started: {session.startedAt} ·{" "}
                  {session.status === "ACTIVE" ? "Expires" : "Ended"}:{" "}
                  {session.stoppedAt ?? session.expiresAt}.{" "}
                  {session.status !== "ACTIVE" &&
                    "Values below are historical."}
                </p>
              )}
              <div className="telemetry-sources">
                {snapshot.sources.map((source) => (
                  <article key={source.sourceId}>
                    <h3>{label(source.sourceId)}</h3>
                    <p>
                      <strong>{source.status}</strong>
                    </p>
                    <p>
                      {session?.status === "ACTIVE"
                        ? "Last observed"
                        : "Historical value"}
                      :{" "}
                      <strong>
                        {source.latestValue === null
                          ? "Missing"
                          : `${source.latestValue} BPM`}
                      </strong>
                    </p>
                    <p>
                      Measured: {time(source.latestMeasuredAt)}
                      <br />
                      Last received: {time(source.lastReceivedAt)}
                      <br />
                      Age at snapshot:{" "}
                      {source.ageSeconds === null
                        ? "Not available"
                        : `${source.ageSeconds} seconds`}
                      <br />
                      Flags: {source.flags.join(", ") || "None"}
                    </p>
                  </article>
                ))}
              </div>
              <Chart snapshot={snapshot} />
              <section className="scroll-chapter" aria-labelledby="readings-heading">
                <h3 id="readings-heading">Readings</h3>
                <div
                  className="telemetry-table"
                  role="region"
                  aria-label="Readings table, scroll horizontally for all columns"
                  tabIndex={0}
                >
                  <table>
                    <caption>
                      Original synthetic observations; all timestamps in UTC
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Source",
                          "Value / unit",
                          "Measured time",
                          "Received time",
                          "Flags",
                        ].map((h) => (
                          <th scope="col" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.observations.map((o) => (
                        <tr id={rowId(o.id)} key={o.id} tabIndex={-1}>
                          <th scope="row">
                            {label(o.sourceId)}
                            <small className="observation-id">{o.id}</small>
                          </th>
                          <td>
                            {o.value === null ? "Missing" : `${o.value} BPM`}
                          </td>
                          <td>
                            <time>{o.measuredAt}</time>
                          </td>
                          <td>
                            <time>{o.receivedAt}</time>
                          </td>
                          <td>{o.flags.join(", ") || "None"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!snapshot.observations.length && (
                  <p>No observations have been received.</p>
                )}
              </section>
              <section className="scroll-chapter" aria-labelledby="findings-heading">
                <h3 id="findings-heading">Reliability findings</h3>
                {snapshot.findings.length ? (
                  <ul>
                    {snapshot.findings.map((finding) => (
                      <li
                        key={`${finding.code}-${finding.sourceIds.join()}-${finding.observationIds.join()}`}
                      >
                        <strong>
                          {finding.code} ·{" "}
                          {finding.sourceIds.map(label).join(" / ")}
                        </strong>
                        <p>{finding.explanation}</p>
                        {finding.observationIds.map((id) => (
                          <a
                            key={id}
                            href={`#${rowId(id)}`}
                            onClick={(event) => {
                              event.preventDefault();
                              document.getElementById(rowId(id))?.focus();
                            }}
                          >
                            Review observation {id}
                          </a>
                        ))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No reliability findings in this snapshot.</p>
                )}
              </section>
              <section className="scroll-chapter" aria-labelledby="summary-heading">
                <h3 id="summary-heading">Telemetry handover summary</h3>
                <div className="telemetry-summary" tabIndex={0}>
                  {snapshot.summary.split("\n\n").map((paragraph, index) => {
                    const [title, ...lines] = paragraph.split("\n");
                    return <p key={index}><strong>{title}</strong>{lines.length > 0 && <span>{lines.join("\n")}</span>}</p>;
                  })}
                </div>
                <button
                  onClick={async () => {
                    const text = snapshot.summary;
                    try {
                      await navigator.clipboard.writeText(text);
                      setCopyError(false);
                      setNotice("Telemetry summary copied.");
                    } catch {
                      setCopyError(true);
                    }
                  }}
                >
                  Copy telemetry summary
                </button>
                {copyError && (
                  <>
                    <p role="alert">
                      Clipboard unavailable. Select and copy the summary below.
                    </p>
                    <label>
                      Selectable telemetry summary
                      <textarea
                        readOnly
                        value={snapshot.summary}
                        onFocus={(event) => event.currentTarget.select()}
                        rows={8}
                      />
                    </label>
                  </>
                )}
              </section>
              <section className="scroll-chapter" aria-labelledby="transitions-heading">
                <h3 id="transitions-heading">Recent status changes</h3>
                {history.length ? (
                  <ol>
                    {history.map((entry, i) => (
                      <li key={`${entry}-${i}`}>{entry}</li>
                    ))}
                  </ol>
                ) : (
                  <p>No source status transitions yet.</p>
                )}
              </section>
            </>
          )}
          {write && snapshot && (
            <section className="scroll-chapter" aria-labelledby="feed-heading">
              <h3 id="feed-heading">Synthetic feed controls</h3>
              <p>
                Synthetic feed generated by this page; leaving Observations or
                refreshing stops local transmission. Browser timers are
                approximate. Refreshing does not resume transmission
                automatically.
              </p>
              <p>
                Local feed:{" "}
                <strong>
                  {feed.current?.running
                    ? `Running — ${feed.current.mode}`
                    : "Stopped"}
                </strong>
              </p>
              <div className="actions">
                {session?.status !== "ACTIVE" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        creationId.current ??= crypto.randomUUID();
                        const created = await telemetryApi.create(
                          patientId,
                          creationId.current,
                        );
                        creationId.current = null;
                        const current = await telemetryApi.snapshot(patientId);
                        if (
                          created.status === "ACTIVE" &&
                          current.session?.id === created.id &&
                          current.session.status === "ACTIVE"
                        )
                          startFeed(current.session, current.serverTime);
                      })
                    }
                  >
                    {busy ? "Starting…" : "Start synthetic feed"}
                  </button>
                ) : (
                  <>
                    {!feed.current?.running && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const current =
                              await telemetryApi.snapshot(patientId);
                            if (
                              current.session?.id === session.id &&
                              current.session.status === "ACTIVE"
                            )
                              startFeed(current.session, current.serverTime);
                            else
                              setNotice(
                                "This session has ended. Resume display updates to review its final state.",
                              );
                          })
                        }
                      >
                        Resume synthetic feed
                      </button>
                    )}
                    {modes.map((mode) => (
                      <button
                        key={mode}
                        disabled={busy || !feed.current?.running}
                        aria-pressed={
                          feed.current?.running
                            ? feed.current.mode === mode
                            : false
                        }
                        onClick={() => feed.current?.setMode(mode)}
                      >
                        {mode}
                      </button>
                    ))}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await feed.current?.drain();
                          await telemetryApi.stop(patientId, session);
                        })
                      }
                    >
                      {feed.current?.running ? "Stop" : "Stop session"}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}
