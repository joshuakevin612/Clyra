import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage, request, requestPages, send } from "../api/client";
import { sourceParts } from "../api/source";
import type { PatientOutput } from "../api/generated";
import { confirmBody, stageForm, validateStage } from "../api/externalImport";
import type {
  ExternalImportOutput,
  ExternalSource,
} from "../api/externalImport";

type Page = { items: ExternalImportOutput[]; nextCursor: string | null };

function Problem({ error, message }: { error?: unknown; message?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const text = message ?? (error ? errorMessage(error) : "");
  useEffect(() => {
    if (text) ref.current?.focus();
  }, [text]);
  return text ? (
    <div className="error" role="alert" tabIndex={-1} ref={ref}>
      {text}
    </div>
  ) : null;
}
const statusLabel = (s: ExternalImportOutput["status"]) =>
  s === "CONFIRMED" ? "CONFIRMED" : "PENDING ASSOCIATION";

export function ExternalImports({
  patient,
  write,
  openTab,
  refreshPatient,
}: {
  patient: PatientOutput;
  write: boolean;
  openTab: (tab: string) => void;
  refreshPatient: () => Promise<void>;
}) {
  const [items, setItems] = useState<ExternalImportOutput[]>([]);
  const [loadError, setLoadError] = useState<unknown>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((x) => x + 1), []);

  useEffect(() => {
    let live = true;
    setLoadError(undefined);
    requestPages<Page>(
      `/patients/${encodeURIComponent(patient.id)}/external-imports`,
    )
      .then((d) => live && setItems(d.items))
      .catch((e) => live && setLoadError(e));
    return () => {
      live = false;
    };
  }, [patient.id, revision]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  return (
    <section className="panel ei">
      <h2>External evidence imports</h2>
      <p>
        Synthetic UTF-8 SYN-RX-V1 text only (maximum 2,000,000 bytes). Imported
        text is held as evidence and is not a verified medicine until you
        confirm the patient and review each entry.
      </p>
      <Problem error={loadError} />
      {write ? (
        <StageForm
          patientId={patient.id}
          onStaged={(i) => {
            setSelectedId(i.id);
            reload();
          }}
        />
      ) : (
        <p role="note">Staging an import needs FULL access to this patient.</p>
      )}
      <h3>Imports for {patient.displayName}</h3>
      {items.length ? (
        <table className="ei-list">
          <caption className="sr-only">External imports</caption>
          <thead>
            <tr>
              <th scope="col">Source label</th>
              <th scope="col">Visit date</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.sourceLabel}</td>
                <td>{i.visitDate}</td>
                <td>{statusLabel(i.status)}</td>
                <td>
                  <button
                    type="button"
                    aria-pressed={i.id === selectedId}
                    onClick={() => setSelectedId(i.id)}
                  >
                    Review evidence
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !loadError && <p>No external imports for this patient.</p>
      )}
      {selected && (
        <ImportReview
          key={selected.id}
          imp={selected}
          patientId={patient.id}
          write={write}
          onChanged={async (updated) => {
            setItems((all) =>
              all.map((i) => (i.id === updated.id ? updated : i)),
            );
            await refreshPatient();
            reload();
          }}
          openTab={openTab}
        />
      )}
    </section>
  );
}

function StageForm({
  patientId,
  onStaged,
}: {
  patientId: string;
  onStaged: (i: ExternalImportOutput) => void;
}) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // One requestId per distinct submission; kept across failed attempts so a
  // retry of an identical request returns the original resource.
  const requestId = useRef(crypto.randomUUID());
  const edited = () => {
    requestId.current = crypto.randomUUID();
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = validateStage(label, date, file);
    setError(undefined);
    setProblem(p ?? undefined);
    if (p || !file) return;
    setBusy(true);
    try {
      const out = await request<ExternalImportOutput>("/external-imports", {
        method: "POST",
        body: stageForm({
          patientId,
          sourceLabel: label,
          visitDate: date,
          requestId: requestId.current,
          file,
        }),
      });
      requestId.current = crypto.randomUUID();
      setLabel("");
      setDate("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onStaged(out);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="fields" onSubmit={submit} noValidate>
      <h3>Stage a new import</h3>
      <Problem message={problem} error={error} />
      <label>
        Source label
        <input
          value={label}
          maxLength={200}
          required
          onChange={(e) => {
            setLabel(e.target.value);
            edited();
          }}
        />
      </label>
      <label>
        Visit date
        <input
          type="date"
          value={date}
          required
          onChange={(e) => {
            setDate(e.target.value);
            edited();
          }}
        />
      </label>
      <label>
        Evidence file (.txt, UTF-8)
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          required
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            edited();
          }}
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy ? "Staging..." : "Stage evidence"}
      </button>
    </form>
  );
}

function ImportReview({
  imp,
  patientId,
  write,
  onChanged,
  openTab,
}: {
  imp: ExternalImportOutput;
  patientId: string;
  write: boolean;
  onChanged: (i: ExternalImportOutput) => Promise<void>;
  openTab: (tab: string) => void;
}) {
  const [source, setSource] = useState<ExternalSource>();
  const [error, setError] = useState<unknown>();
  const [active, setActive] = useState(0);
  const [current, setCurrent] = useState(imp);
  useEffect(() => setCurrent(imp), [imp]);
  useEffect(() => {
    let live = true;
    setError(undefined);
    request<ExternalSource>(
      `/external-imports/${encodeURIComponent(imp.id)}/source`,
    )
      .then((s) => live && setSource(s))
      .catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [imp.id, current.status]);

  const entry = source?.entries[active];
  const parts =
    source && entry ? sourceParts(source.rawText, entry.source) : null;
  return (
    <article className="ei-review" aria-label="Evidence review">
      <h3>{current.sourceLabel}</h3>
      <p>
        {statusLabel(current.status)} · Visit date {current.visitDate} · Import{" "}
        {current.id}
      </p>
      <p>
        SHA-256 <code>{current.sha256}</code>
      </p>
      <Problem error={error} />
      {source && (
        <div className="ei-source-grid">
          <div>
            <h4>Extracted entries (not verified)</h4>
            <ul className="ei-entries">
              {source.entries.map((en, i) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-pressed={i === active}
                    onClick={() => setActive(i)}
                  >
                    {en.medicineName} {en.strength.value} {en.strength.unit} ·{" "}
                    {en.form}
                  </button>
                </li>
              ))}
            </ul>
            {entry && <pre>{entry.instructionText}</pre>}
          </div>
          <div>
            <h4>Original source text</h4>
            <pre
              className="ei-raw"
              tabIndex={0}
              aria-label="Original source text"
            >
              {parts ? (
                <>
                  {parts.before}
                  <mark>{parts.quote}</mark>
                  {parts.after}
                </>
              ) : (
                source.rawText
              )}
            </pre>
            {entry && !parts && (
              <Problem message="The highlighted quote does not match the source text, so it is not shown." />
            )}
          </div>
        </div>
      )}
      {current.status === "PENDING_ASSOCIATION" ? (
        write ? (
          <ConfirmPanel
            imp={current}
            patientId={patientId}
            onDone={async (u) => {
              setCurrent(u);
              await onChanged(u);
            }}
            onRefresh={async () => {
              const u = await request<ExternalImportOutput>(
                `/external-imports/${encodeURIComponent(imp.id)}`,
              );
              setCurrent(u);
              await onChanged(u);
            }}
          />
        ) : (
          <p role="note">Confirming an association needs FULL access.</p>
        )
      ) : (
        <div>
          <p>
            Confirmed {current.confirmedAt}. Visit {current.visitId} · Document{" "}
            {current.documentId} · Job {current.jobId}. Entries begin as
            unverified and are reviewed in the standard workflow.
          </p>
          <div className="actions">
            <button
              type="button"
              onClick={() => openTab("Medication timeline")}
            >
              Review medication entries
            </button>
            <button type="button" onClick={() => openTab("Discrepancies")}>
              Open discrepancies
            </button>
            <button type="button" onClick={() => openTab("Comparison")}>
              Compare visits
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ConfirmPanel({
  imp,
  patientId,
  onDone,
  onRefresh,
}: {
  imp: ExternalImportOutput;
  patientId: string;
  onDone: (i: ExternalImportOutput) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [fresh, setFresh] = useState<PatientOutput>();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const load = useCallback(async () => {
    setAgreed(false);
    try {
      setFresh(
        await request<PatientOutput>(
          `/patients/${encodeURIComponent(patientId)}`,
        ),
      );
    } catch (e) {
      setError(e);
    }
  }, [patientId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function confirm() {
    if (!fresh || !agreed) return;
    setBusy(true);
    setError(undefined);
    try {
      const out = await send<ExternalImportOutput>(
        `/external-imports/${encodeURIComponent(imp.id)}/confirm`,
        confirmBody(imp, fresh.version),
      );
      setConflict(false);
      await onDone(out);
    } catch (e) {
      // Never auto-resubmit: reload the patient so the user re-reviews first.
      if ((e as { code?: string }).code === "VERSION_CONFLICT") {
        setConflict(true);
        await load();
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ei-confirm" aria-labelledby="ei-confirm-h">
      <h4 id="ei-confirm-h">Confirm patient association</h4>
      <Problem error={error} />
      {conflict && (
        <p role="status">
          The record changed or this import was already confirmed. Review the
          details below and confirm again, or refresh the import status.
        </p>
      )}
      {fresh ? (
        <dl>
          <dt>Patient name</dt>
          <dd>{fresh.displayName}</dd>
          <dt>Date of birth</dt>
          <dd>{fresh.dateOfBirth}</dd>
          <dt>Patient ID</dt>
          <dd>{fresh.id}</dd>
        </dl>
      ) : (
        <p>Loading current patient details...</p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={agreed}
          disabled={!fresh}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        I confirm this external evidence belongs to the patient shown above.
      </label>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!fresh || !agreed || busy}
          onClick={confirm}
        >
          {busy ? "Confirming..." : "Confirm association"}
        </button>
        <button type="button" onClick={() => onRefresh().catch(setError)}>
          Refresh import status
        </button>
      </div>
    </section>
  );
}
