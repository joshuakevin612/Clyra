import { sourceParts } from "./api/source";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Users,
  Building2,
  FileClock,
  RefreshCw,
  Leaf,
} from "lucide-react";
import {
  ApiError,
  errorMessage,
  mockMode,
  request,
  requestPages,
  send,
  setSession,
} from "./api/client";
import type { User, LoginResponse } from "./api/types";
import type {
  Source,
  UploadOutput,
  JobOutput,
  DocumentOutput,
  ExtractionOutput,
  Page_MedicationOutput_,
  OrganisationOutput,
  UserOutput,
  ComparisonOutput,
  GrantOutput,
  MigrationOutput,
  PatientOutput,
  MedicationOutput,
  DiscrepancyOutput,
  PatientMedications,
  LinkOutput,
} from "./api/generated";
const notice =
  "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine.";
function ErrorBox({ error, reload }: { error: unknown; reload?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return error ? (
    <div className="error" role="alert" tabIndex={-1} ref={ref}>
      {errorMessage(error)}
      {reload && <button onClick={reload}>Reload</button>}
    </div>
  ) : null;
}
function Fields({
  names,
  busy,
  label,
  onSave,
  onReload,
}: {
  names: string[];
  busy?: boolean;
  label: string;
  onReload?: () => void;
  onSave: (data: Record<string, string>) => Promise<void>;
}) {
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="fields"
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = e.currentTarget;
        setSaving(true);
        setError(undefined);
        try {
          await onSave(
            Object.fromEntries(new FormData(f)) as Record<string, string>,
          );
          f.reset();
        } catch (err) {
          setError(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <ErrorBox
        error={error}
        reload={() => {
          onReload?.();
          window.dispatchEvent(new Event("records-changed"));
          setError(undefined);
        }}
      />
      {names.map((name) => (
        <label key={name}>
          {name
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (c) => c.toUpperCase())}
          <input
            name={name}
            required={
              !["reason", "orgId", "actorId", "action", "from", "to"].includes(
                name,
              )
            }
            type={
              /password/i.test(name)
                ? "password"
                : /date/i.test(name) || ["from", "to"].includes(name)
                  ? "date"
                  : "text"
            }
            minLength={
              /password/i.test(name) ? 12 : name === "note" ? 3 : undefined
            }
            maxLength={
              /password/i.test(name)
                ? 256
                : name === "note"
                  ? 2000
                  : name === "reason"
                    ? 1000
                    : 200
            }
            autoComplete={/password/i.test(name) ? "new-password" : "off"}
          />
        </label>
      ))}
      <button className="primary" disabled={saving || busy}>
        {saving ? "Saving…" : label}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <FileClock size={28} />
      <h3>No records to show</h3>
      <p>{children}</p>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [signup, setSignup] = useState(false);
  const [page, setPage] = useState("");
  const [error, setError] = useState<unknown>();
  const [patient, setPatient] = useState<PatientOutput | null>(null);
  useEffect(() => {
    const end = () => {
      setUser(null);
      setPatient(null);
      setPage("");
    };
    window.addEventListener("session-ended", end);
    const sync = () => {
      request<User>("/auth/me")
        .then(setUser)
        .catch(() => {});
    };
    window.addEventListener("records-changed", sync);
    return () => {
      window.removeEventListener("session-ended", end);
      window.removeEventListener("records-changed", sync);
    };
  }, []);
  async function logout() {
    try {
      await send("/auth/logout", {});
    } finally {
      setSession(null);
      setUser(null);
      setPatient(null);
      setPage("");
    }
  }
  const admin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const platform = user?.role === "SUPER_ADMIN";
  const pages = !user
    ? []
    : platform
      ? ["Organisations", "Audit log", "Access log"]
      : admin
        ? ["Clinicians", "Audit log", "Access log"]
        : user.role === "CLINICIAN"
          ? ["Patients", "Migration request"]
          : [
              "My medicines",
              "Link invitations",
              "Migrations",
              "Access grants",
              "Access log",
            ];
  const active = page || pages[0];
  if (!user)
    return (
      <div className="entry">
        <div className="entry-story">
          <a className="brand" href="/" aria-label="Clyra home">
            <Leaf />
            clyra<span>Medication continuity</span>
          </a>
          <div>
            <h1>
              A clearer record.
              <br />A considered handover.
            </h1>
            <p>
              Keep the source in sight, review differences, and carry the record
              forward.
            </p>
            <div className="record-line">
              <span>Source record</span>
              <ChevronRight />
              <span>Clinical review</span>
              <ChevronRight />
              <span>Handover</span>
            </div>
          </div>
          <footer>
            Synthetic data only. Clinical decisions belong to qualified
            healthcare professionals.
          </footer>
        </div>
        <main className="entry-form">
          <div className="form-wrap">
            <ShieldCheck size={30} />
            <h2>{signup ? "Create your patient login" : "Welcome to Clyra"}</h2>
            <p>
              {signup
                ? "Create a login, then confirm a record invitation from your clinician."
                : "Sign in to your workspace to continue."}
            </p>
            <ErrorBox error={error} />
            {signup ? (
              <Fields
                names={["displayName", "dateOfBirth", "username", "password"]}
                label="Create patient login"
                onSave={async (data) => {
                  await send("/auth/signup", data);
                  setSignup(false);
                }}
              />
            ) : (
              <form
                className="fields"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(undefined);
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  try {
                    const r = await send<LoginResponse>("/auth/login", d);
                    setSession(r.accessToken, r.expiresAt);
                    setUser(r.user);
                  } catch (err) {
                    setError(err);
                  }
                }}
              >
                <label>
                  Username
                  <input required name="username" autoComplete="username" />
                </label>
                <label>
                  Password
                  <input
                    required
                    name="password"
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <button className="primary">
                  Sign in
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
            <button
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setError(undefined);
              }}
            >
              {signup
                ? "Already have a login? Sign in"
                : "New patient? Create a login"}
            </button>
            {mockMode && (
              <aside className="demo">
                <strong>Development preview</strong>
                <p>
                  Use dr.north, admin.north, alex.example or platform.demo.
                  <br />
                  Password: <code>Clyra-demo-2026</code>
                </p>
                <small>
                  Synthetic fixture data. Changes reset when you reload.
                </small>
              </aside>
            )}
          </div>
        </main>
      </div>
    );
  if (user.mustChangePassword)
    return (
      <main className="password">
        <h1>Choose a new password</h1>
        <p>You need to change your password before opening your workspace.</p>
        <Fields
          names={["currentPassword", "newPassword"]}
          label="Change password"
          onSave={async (d) => {
            await send("/auth/change-password", {
              ...d,
              ifVersion: user.version,
            });
            setSession(null);
            setUser(null);
          }}
        />
        <button onClick={logout}>Sign out</button>
      </main>
    );
  return (
    <div className="workspace">
      <aside className="rail">
        <a className="brand" href="/" aria-label="Clyra home">
          <Leaf />
          clyra
        </a>
        <div className="workspace-label">
          {platform
            ? "Platform workspace"
            : admin
              ? "Organisation workspace"
              : user.role === "PATIENT"
                ? "Your record"
                : "Clinical workspace"}
        </div>
        <nav aria-label="Main navigation">
          {pages.map((p, i) => (
            <button
              key={p}
              className={active === p ? "selected" : ""}
              onClick={() => {
                setPage(p);
                setPatient(null);
              }}
            >
              {i === 0 ? (
                <Users size={18} />
              ) : p.includes("log") ? (
                <FileClock size={18} />
              ) : (
                <Building2 size={18} />
              )}
              <span>{p}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="avatar">{user.displayName[0]}</span>
          <strong>{user.displayName}</strong>
          <small>{user.role.replaceAll("_", " ")}</small>
          <button onClick={logout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            {user.orgId === "org_north"
              ? "Northside Clinic"
              : user.orgId === "org_riverside"
                ? "Riverside Health"
                : "Clyra"}
          </span>
          <span>
            Synthetic data {mockMode ? "preview" : "workspace"}
            <ShieldCheck size={16} />
          </span>
        </header>
        <div className="content">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            {active}
            {patient && (
              <>
                <ChevronRight size={14} />
                {patient.displayName}
              </>
            )}
          </div>
          <header className="page-heading">
            <div>
              <h1>{patient ? patient.displayName : active}</h1>
              <p>
                {patient
                  ? `${patient.id} · Born ${patient.dateOfBirth}`
                  : admin
                    ? "Manage access and review account activity."
                    : user.role === "PATIENT"
                      ? "Your record and the organisations you choose to share it with."
                      : "Review records, trace their sources, and prepare the next handover."}
              </p>
            </div>
            <Status>{user.role.replaceAll("_", " ")}</Status>
          </header>
          {user.role === "PATIENT" && (
            <aside className="notice">
              <ShieldCheck size={22} />
              <p>{notice}</p>
            </aside>
          )}
          {patient ? (
            <PatientWorkspace patient={patient} setPatient={setPatient} />
          ) : active === "Patients" ? (
            <>
              <Resource
                path="/patients"
                columns={["displayName", "dateOfBirth", "id", "accessLevel"]}
                onSelect={(r) => setPatient(r as PatientOutput)}
              />
              <details>
                <summary>Create a patient</summary>
                <Fields
                  names={["displayName", "dateOfBirth"]}
                  label="Create patient"
                  onSave={async (d) => {
                    setPatient(await send<PatientOutput>("/patients", d));
                  }}
                />
              </details>
              <details>
                <summary>Open a patient by ID</summary>
                <Fields
                  names={["patientId"]}
                  label="Open record"
                  onSave={async (d) => {
                    setPatient(
                      await request<PatientOutput>(
                        `/patients/${encodeURIComponent(d.patientId)}`,
                      ),
                    );
                  }}
                />
              </details>
            </>
          ) : active === "Link invitations" ? (
            <Invitations
              refreshUser={async () => setUser(await request<User>("/auth/me"))}
            />
          ) : active === "Migration request" ? (
            <DestinationMigration />
          ) : user.role === "PATIENT" ? (
            user.patientId ? (
              <PatientWorkspace
                patientId={user.patientId}
                section={active}
                setPatient={setPatient}
              />
            ) : (
              <Empty>
                Your login is not linked to a record yet. Check Link
                invitations.
              </Empty>
            )
          ) : (
            <AdminWorkspace key={active} platform={platform} page={active} />
          )}
        </div>
        <footer className="app-footer">
          Clyra <span>Medication continuity & safe handover</span>
          <span>Contract v1.3.1</span>
        </footer>
      </main>
    </div>
  );
}
function Resource({
  path,
  columns,
  onSelect,
}: {
  path: string;
  columns: string[];
  onSelect?: (r: unknown) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const update = () => setReload((x) => x + 1);
    window.addEventListener("records-changed", update);
    return () => window.removeEventListener("records-changed", update);
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(undefined);
    request<{ items: Record<string, unknown>[]; nextCursor: string | null }>(
      path,
    )
      .then((d) => {
        if (live) {
          setRows(d.items);
          setCursor(d.nextCursor);
        }
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, reload]);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Records</h2>
        <button
          onClick={() => setReload((x) => x + 1)}
          aria-label="Reload records"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <ErrorBox error={error} reload={() => setReload((x) => x + 1)} />
      {loading ? (
        <p role="status">Loading records…</p>
      ) : !error && !rows.length ? (
        <Empty>Records will appear here when available.</Empty>
      ) : (
        !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c.replace(/([A-Z])/g, " $1")}</th>
                  ))}
                  {onSelect && <th>Open</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    {columns.map((c) => (
                      <td key={c}>
                        {typeof r[c] === "string" || typeof r[c] === "number"
                          ? String(r[c])
                          : "—"}
                      </td>
                    ))}
                    {onSelect && (
                      <td>
                        <button onClick={() => onSelect(r)}>
                          Open
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {cursor && (
        <button
          onClick={async () => {
            try {
              const d = await request<{
                items: Record<string, unknown>[];
                nextCursor: string | null;
              }>(
                path +
                  (path.includes("?") ? "&" : "?") +
                  "cursor=" +
                  encodeURIComponent(cursor),
              );
              setRows((r) => [...r, ...d.items]);
              setCursor(d.nextCursor);
            } catch (e) {
              setError(e);
            }
          }}
        >
          Load more
        </button>
      )}
    </section>
  );
}
function AdminWorkspace({
  platform,
  page,
}: {
  platform: boolean;
  page: string;
}) {
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<OrganisationOutput | UserOutput>();
  const [error, setError] = useState<unknown>();
  const [filter, setFilter] = useState("");
  const prefix = platform ? "/superadmin" : "/admin";
  const accountPath =
    selected && "username" in selected && platform
      ? `/superadmin/organisations/${selected.orgId}/admins/${selected.id}`
      : null;
  const path =
    prefix +
    (page === "Organisations"
      ? "/organisations"
      : page === "Clinicians"
        ? "/users"
        : page === "Audit log"
          ? "/audit"
          : "/access-log");
  return (
    <>
      <ErrorBox
        error={error}
        reload={() => {
          setSelected(undefined);
          setError(undefined);
          setRevision((x) => x + 1);
        }}
      />
      {page.includes("log") && (
        <Fields
          names={
            platform
              ? ["orgId", "actorId", "action", "from", "to"]
              : ["actorId", "action", "from", "to"]
          }
          label="Filter activity"
          onSave={async (d) => {
            if (d.from) d.from += "T00:00:00.000Z";
            if (d.to) d.to += "T23:59:59.999999Z";
            setFilter(
              "?" + new URLSearchParams(Object.entries(d).filter(([, v]) => v)),
            );
            setRevision((x) => x + 1);
          }}
        />
      )}
      <Resource
        key={path + revision}
        path={path + filter}
        columns={
          page === "Organisations"
            ? ["name", "status", "id"]
            : page === "Clinicians"
              ? ["displayName", "username", "status", "id"]
              : [
                  "occurredAt",
                  "actorId",
                  page === "Audit log" ? "action" : "resource",
                  "orgId",
                ]
        }
        onSelect={
          ["Organisations", "Clinicians"].includes(page)
            ? (r) => setSelected(r as OrganisationOutput | UserOutput)
            : undefined
        }
      />
      {selected && (
        <section className="panel">
          <h2>{"name" in selected ? selected.name : selected.displayName}</h2>
          <Status>{selected.status}</Status>
          <div className="actions">
            {("name" in selected
              ? ["ACTIVE", "SUSPENDED"]
              : ["ACTIVE", "DISABLED"]
            )
              .filter((status) => status !== selected.status)
              .map((status) => (
                <button
                  key={status}
                  onClick={async () => {
                    try {
                      await send(
                        accountPath ?? path + "/" + selected.id,
                        { status, ifVersion: selected.version },
                        "PATCH",
                      );
                      setSelected(undefined);
                      setRevision((x) => x + 1);
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  {status === "ACTIVE"
                    ? "Enable"
                    : status === "SUSPENDED"
                      ? "Suspend"
                      : "Disable"}
                </button>
              ))}
          </div>
          {"name" in selected ? (
            <>
              <Resource
                path={path + "/" + selected.id + "/admins"}
                columns={["displayName", "username", "status", "id"]}
                onSelect={(r) => setSelected(r as UserOutput)}
              />
              <details>
                <summary>Add administrator</summary>
                <Fields
                  names={["displayName", "username", "password"]}
                  label="Add administrator"
                  onSave={async (d) => {
                    await send(path + "/" + selected.id + "/admins", d);
                    setRevision((x) => x + 1);
                  }}
                />
              </details>
            </>
          ) : (
            <Fields
              onReload={() => {
                setSelected(undefined);
                setRevision((x) => x + 1);
              }}
              names={["password"]}
              label="Reset password"
              onSave={async (d) => {
                await send(
                  accountPath ?? path + "/" + selected.id,
                  { ...d, ifVersion: selected.version },
                  "PATCH",
                );
                setSelected(undefined);
                setRevision((x) => x + 1);
              }}
            />
          )}
        </section>
      )}
      {["Organisations", "Clinicians"].includes(page) && (
        <details>
          <summary>
            {platform
              ? "Create organisation and first administrator"
              : "Create clinician"}
          </summary>
          <Fields
            names={
              platform
                ? ["name", "adminUsername", "adminDisplayName", "adminPassword"]
                : ["displayName", "username", "password"]
            }
            label={platform ? "Create organisation" : "Create clinician"}
            onSave={async (d) => {
              await send(path, d);
              setRevision((x) => x + 1);
            }}
          />
        </details>
      )}
    </>
  );
}
function Invitations({ refreshUser }: { refreshUser: () => Promise<void> }) {
  const [revision, setRevision] = useState(0);
  const [invite, setInvite] = useState<LinkOutput | null>(null);
  const [error, setError] = useState<unknown>();
  return (
    <>
      <Resource
        key={revision}
        path="/link-requests"
        columns={["displayName", "dateOfBirth", "status"]}
        onSelect={(r) => setInvite(r as LinkOutput)}
      />
      {invite && (
        <section className="panel">
          <h2>Confirm this is your record</h2>
          <p>
            {invite.displayName} · {invite.dateOfBirth}
          </p>
          <Status>{invite.status}</Status>
          <ErrorBox
            error={error}
            reload={() => {
              setInvite(null);
              setError(undefined);
              setRevision((x) => x + 1);
              refreshUser();
            }}
          />
          {invite.status === "PENDING" &&
            ["CONFIRM", "DECLINE"].map((decision) => (
              <button
                key={decision}
                onClick={async () => {
                  try {
                    await send(`/link-requests/${invite.id}/decision`, {
                      decision,
                      ifVersion: invite.version,
                    });
                    setInvite(null);
                    setRevision((x) => x + 1);
                    await refreshUser();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {decision}
              </button>
            ))}
        </section>
      )}
    </>
  );
}
function PatientWorkspace({
  patient: initial,
  patientId,
  section,
  setPatient,
}: {
  patient?: PatientOutput;
  patientId?: string;
  section?: string;
  setPatient: (p: PatientOutput) => void;
}) {
  const id = initial?.id ?? patientId!;
  const [tab, setTab] = useState(section ?? "Medication timeline");
  const [patient, setLocal] = useState(initial);
  const [meds, setMeds] = useState<MedicationOutput[]>([]);
  const [view, setView] = useState<PatientMedications>();
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  const clinician = !!initial;
  const base = `/patients/${id}`;
  useEffect(() => {
    setTab(section ?? "Medication timeline");
  }, [section, id]);
  useEffect(() => {
    let live = true;
    setError(undefined);
    setMeds([]);
    setView(undefined);
    request<PatientOutput>(base)
      .then((p) => {
        if (live) setLocal(p);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    if (tab === "Medication timeline")
      requestPages<Page_MedicationOutput_>(base + "/medications")
        .then((d) => {
          if (live) setMeds(d.items);
        })
        .catch((e) => {
          if (live) setError(e);
        });
    if (tab === "My medicines")
      requestPages<PatientMedications>(base + "/medications/patient-view")
        .then((d) => {
          if (live) setView(d);
        })
        .catch((e) => {
          if (live) setError(e);
        });
    return () => {
      live = false;
    };
  }, [base, tab, revision]);
  async function refresh() {
    const p = await request<PatientOutput>(base);
    setLocal(p);
    if (clinician) setPatient(p);
    setRevision((x) => x + 1);
    window.dispatchEvent(new Event("records-changed"));
  }
  useEffect(() => {
    const update = () => setRevision((x) => x + 1);
    window.addEventListener("records-changed", update);
    return () => window.removeEventListener("records-changed", update);
  }, [base]);
  const write = clinician && patient?.accessLevel === "FULL";
  return (
    <>
      <ErrorBox error={error} reload={() => setRevision((x) => x + 1)} />
      {clinician && (
        <nav className="tabs" aria-label="Patient sections">
          {[
            "Medication timeline",
            "Visits",
            "Comparison",
            "Discrepancies",
            "Documents",
            "Migrations",
            "Access grants",
            "Patient login",
            "Patient details",
          ].map((t) => (
            <button
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </nav>
      )}
      {tab === "Medication timeline" ? (
        <section className="panel">
          <h2>Medication timeline</h2>
          <p>
            Original entries and replacement history. Instructions remain as
            recorded.
          </p>
          {meds.map((m) => (
            <article className="medicine" key={m.id}>
              <header>
                <h3>{m.medicineName}</h3>
                <Status>{m.verificationStatus}</Status>
              </header>
              <p>
                {m.strength.value} {m.strength.unit} · {m.form} · {m.startDate}
              </p>
              <pre>{m.instructionText}</pre>
              <small>
                {m.id} · Visit {m.visitId}
                {m.supersedesId && ` · Replaces ${m.supersedesId}`}
                {meds.some((n) => n.supersedesId === m.id) &&
                  " · History: superseded"}
              </small>
              <details>
                <summary>Source evidence</summary>
                <pre>{m.source.quote}</pre>
                <p>
                  Document {m.source.documentId} · Page {m.source.page}
                </p>
              </details>
              {write && (
                <div className="actions">
                  {["VERIFIED", "REJECTED", "UNVERIFIED"].map(
                    (verificationStatus) => (
                      <button
                        key={verificationStatus}
                        onClick={async () => {
                          try {
                            await send(
                              `/medications/${m.id}/verification`,
                              { verificationStatus, ifVersion: m.version },
                              "PATCH",
                            );
                            await refresh();
                          } catch (e) {
                            setError(e);
                          }
                        }}
                      >
                        {verificationStatus === "VERIFIED"
                          ? "Verify"
                          : verificationStatus === "REJECTED"
                            ? "Reject"
                            : "Unverify"}
                      </button>
                    ),
                  )}
                </div>
              )}
            </article>
          ))}
          {!meds.length && !error && (
            <Empty>No medication entries are available.</Empty>
          )}
        </section>
      ) : tab === "My medicines" ? (
        <section className="panel">
          <h2>My medicines</h2>
          {view?.items.map((m, i) => (
            <article key={i} className="medicine">
              <header>
                <h3>{m.medicineName}</h3>
                <Status>{m.status}</Status>
              </header>
              <p>
                {m.strength.value} {m.strength.unit} · {m.form}
              </p>
              {m.status === "VERIFIED" && m.instructionText !== null && (
                <pre>{m.instructionText}</pre>
              )}
            </article>
          ))}
        </section>
      ) : tab === "Visits" ? (
        <>
          <Resource
            path={base + "/visits"}
            columns={["visitDate", "orgId", "id"]}
          />
          {write && (
            <details>
              <summary>Create visit</summary>
              <Fields
                names={["visitDate"]}
                label="Create visit"
                onSave={async (d) => {
                  await send(base + "/visits", {
                    ...d,
                    ifVersion: patient!.version,
                  });
                  await refresh();
                }}
              />
            </details>
          )}
        </>
      ) : tab === "Patient details" ? (
        <section className="panel">
          <h2>Patient details</h2>
          {write && (
            <Fields
              names={["displayName", "dateOfBirth"]}
              label="Save patient details"
              onSave={async (d) => {
                await send(
                  base,
                  { ...d, ifVersion: patient!.version },
                  "PATCH",
                );
                await refresh();
              }}
            />
          )}
        </section>
      ) : tab === "Comparison" ? (
        <Comparison path={base} />
      ) : tab === "Discrepancies" ? (
        <Discrepancies path={base} write={write} />
      ) : tab === "Documents" ? (
        <Documents patient={patient} write={write} refresh={refresh} />
      ) : tab === "Patient login" ? (
        <PatientLogin patient={patient} write={write} refresh={refresh} />
      ) : tab === "Access grants" ? (
        <GrantControls path={base} editable={!clinician} refresh={refresh} />
      ) : tab === "Migrations" ? (
        <>
          <MigrationControls
            path={base}
            editable={!clinician}
            refresh={refresh}
          />
          {patient && (
            <details>
              <summary>Request a migration</summary>
              <MigrationRequest
                path={base}
                patient={patient}
                clinician={clinician}
                refresh={refresh}
              />
            </details>
          )}
        </>
      ) : (
        <Resource
          path={base + "/access-log"}
          columns={["occurredAt", "actorId", "actorRole", "orgId", "resource"]}
        />
      )}
    </>
  );
}
function Discrepancies({ path, write }: { path: string; write: boolean }) {
  const [selected, setSelected] = useState<DiscrepancyOutput | null>(null);
  const [decision, setDecision] = useState("ACCEPT_LEFT");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("");
  return (
    <>
      <label>
        Discrepancy status
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setSelected(null);
          }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
      </label>
      <Resource
        key={revision}
        path={path + "/discrepancies" + (status ? "?status=" + status : "")}
        columns={["type", "medicineKey", "field", "status"]}
        onSelect={(r) => setSelected(r as DiscrepancyOutput)}
      />
      {selected && (
        <section className="panel">
          <h2>Review discrepancy</h2>
          <p>{selected.summary}</p>
          {write && (
            <>
              <label>
                Decision
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  {[
                    "ACCEPT_LEFT",
                    "ACCEPT_RIGHT",
                    "KEEP_BOTH_FLAGGED",
                    "ESCALATE",
                  ].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <Fields
                names={["note"]}
                label="Record review decision"
                onReload={() => {
                  setSelected(null);
                  setRevision((x) => x + 1);
                }}
                onSave={async (d) => {
                  await send(`/discrepancies/${selected.id}/decisions`, {
                    ...d,
                    decision,
                    ifVersion: selected.version,
                  });
                  setSelected(null);
                  setRevision((x) => x + 1);
                }}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
function GrantControls({
  path,
  editable,
  refresh,
}: {
  path: string;
  editable: boolean;
  refresh: () => Promise<void>;
}) {
  const [grant, setGrant] = useState<GrantOutput>();
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  useEffect(() => setGrant(undefined), [revision]);
  return (
    <>
      <Resource
        key={revision}
        path={path + "/access-grants"}
        columns={["orgId", "level", "version"]}
        onSelect={editable ? (r) => setGrant(r as GrantOutput) : undefined}
      />
      {editable && <NewGrant path={path} refresh={refresh} />}
      {grant && (
        <section className="panel">
          <h2>Organisation access</h2>
          <p>{grant.orgId}</p>
          <ErrorBox
            error={error}
            reload={() => {
              setError(undefined);
              setRevision((x) => x + 1);
            }}
          />
          <div className="actions">
            {["NONE", "VIEW_ONLY", "FULL"].map((level) => (
              <button
                key={level}
                disabled={grant.level === level}
                onClick={async () => {
                  try {
                    await send(`${path}/access-grants/${grant.orgId}`, {
                      level,
                      ifVersion: grant.version,
                    });
                    setGrant(undefined);
                    setRevision((x) => x + 1);
                    await refresh();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function MigrationControls({
  path,
  editable,
  refresh,
}: {
  path: string;
  editable: boolean;
  refresh: () => Promise<void>;
}) {
  const [migration, setMigration] = useState<MigrationOutput>();
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  useEffect(() => setMigration(undefined), [revision]);
  return (
    <>
      <Resource
        key={revision}
        path={path + "/migrations"}
        columns={["sourceOrgId", "destinationOrgId", "status", "createdAt"]}
        onSelect={(r) => setMigration(r as MigrationOutput)}
      />
      {migration && (
        <section className="panel">
          <h2>Migration status</h2>
          <Status>{migration.status}</Status>
          <ErrorBox
            error={error}
            reload={() => {
              setMigration(undefined);
              setError(undefined);
              setRevision((x) => x + 1);
            }}
          />
          {editable && migration.status === "PENDING_PATIENT_APPROVAL" && (
            <div className="actions">
              {["APPROVE_FULL", "APPROVE_VIEW_ONLY", "DECLINE", "CANCEL"].map(
                (decision) => (
                  <button
                    key={decision}
                    onClick={async () => {
                      try {
                        await send(
                          `/migrations/${migration.id}/${decision === "CANCEL" ? "cancel" : "decision"}`,
                          decision === "CANCEL"
                            ? { ifVersion: migration.version }
                            : { decision, ifVersion: migration.version },
                        );
                        setMigration(undefined);
                        setRevision((x) => x + 1);
                        await refresh();
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  >
                    {decision.replaceAll("_", " ")}
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
function Documents({
  patient,
  write,
  refresh,
}: {
  patient?: PatientOutput;
  write: boolean;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<DocumentOutput>();
  const [extraction, setExtraction] = useState<ExtractionOutput>();
  const [job, setJob] = useState<JobOutput>();
  const [selectedQuote, setQuote] = useState<Source>();
  const highlighted =
    doc && selectedQuote ? sourceParts(doc.rawText, selectedQuote) : null;
  const stop = useRef(false);
  useEffect(() => {
    stop.current = false;
    return () => {
      stop.current = true;
    };
  }, []);
  async function load(id: string, jobId?: string) {
    setDoc(await request<DocumentOutput>(`/documents/${id}`));
    setExtraction(undefined);
    setQuote(undefined);
    try {
      setExtraction(
        await request<ExtractionOutput>(`/documents/${id}/extraction`),
      );
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.code === "EXTRACTION_PENDING" &&
        (jobId || job?.id)
      ) {
        let current = await request<JobOutput>(
          `/extraction-jobs/${jobId ?? job!.id}`,
        );
        while (current.status === "PENDING" && !stop.current) {
          await new Promise((r) => setTimeout(r, 1500));
          if (stop.current) return;
          current = await request<JobOutput>(`/extraction-jobs/${current.id}`);
        }
        setJob(current);
        if (current.status === "COMPLETED")
          setExtraction(
            await request<ExtractionOutput>(`/documents/${id}/extraction`),
          );
      } else throw e;
    }
  }
  return (
    <section className="panel">
      <h2>Source documents</h2>
      <p>
        UTF-8 SYN-RX-V1 text only. Maximum 2 MB. Replacing a medication creates
        a separate unverified entry; the original stays in history.
      </p>
      <ErrorBox error={error} />
      {write && (
        <form
          className="fields"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            const f = new FormData(e.currentTarget);
            try {
              const file = f.get("file") as File;
              if (file.size > 2_000_000)
                throw new ApiError(
                  "VALIDATION_FAILED",
                  "Choose a file no larger than 2 MB.",
                );
              new TextDecoder("utf-8", { fatal: true }).decode(
                await file.arrayBuffer(),
              );
              f.set("patientId", patient!.id);
              f.set("ifVersion", String(patient!.version));
              const replacement = String(f.get("supersedesId") ?? "");
              f.delete("supersedesId");
              if (replacement) {
                const all = await requestPages<Page_MedicationOutput_>(
                  `/patients/${patient!.id}/medications?limit=200`,
                );
                const old = all.items.find((m) => m.id === replacement);
                if (!old)
                  throw new ApiError(
                    "NOT_FOUND",
                    "Record not found or unavailable to your account.",
                  );
                f.set("supersedesId", old.id);
                f.set("supersedesIfVersion", String(old.version));
              }
              const result = await request<UploadOutput>("/documents", {
                method: "POST",
                body: f,
              });
              await refresh();
              let current = await request<JobOutput>(
                `/extraction-jobs/${result.jobId}`,
              );
              setJob(current);
              while (current.status === "PENDING" && !stop.current) {
                await new Promise((r) => setTimeout(r, 1500));
                if (stop.current) return;
                current = await request<JobOutput>(
                  `/extraction-jobs/${result.jobId}`,
                );
                setJob(current);
              }
              if (current.status === "COMPLETED")
                await load(result.documentId, result.jobId);
            } catch (err) {
              setError(
                err instanceof TypeError
                  ? new ApiError(
                      "VALIDATION_FAILED",
                      "The file must contain valid UTF-8 text.",
                    )
                  : err,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Visit ID
            <input name="visitId" required />
          </label>
          <label>
            Replace medication ID (optional)
            <input name="supersedesId" />
          </label>
          <label>
            Source file
            <input type="file" name="file" accept=".txt,text/plain" required />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Processing…" : "Upload document"}
          </button>
        </form>
      )}
      {job && (
        <p role="status">
          {job.status}
          {job.reason && `: ${job.reason}`}
        </p>
      )}
      <details>
        <summary>Open an existing document</summary>
        <Fields
          names={["documentId"]}
          label="Open source"
          onSave={async (d) => load(d.documentId)}
        />
      </details>
      {doc && (
        <>
          <h3>Original text</h3>
          <pre>
            {highlighted ? (
              <>
                {highlighted.before}
                <mark>{highlighted.quote}</mark>
                {highlighted.after}
              </>
            ) : (
              doc.rawText
            )}
          </pre>
          <h3>Extracted evidence</h3>
          {extraction?.items.map((item, i) => (
            <article className="medicine" key={i}>
              <h3>{item.medicineName}</h3>
              <pre>{item.instructionText}</pre>
              <button onClick={() => setQuote(item.source)}>
                Highlight source quote
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
function MigrationRequest({
  path,
  patient,
  clinician,
  refresh,
}: {
  path: string;
  patient: PatientOutput;
  clinician: boolean;
  refresh: () => Promise<void>;
}) {
  const [orgs, setOrgs] = useState<OrganisationOutput[]>([]);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!clinician)
      requestPages<{ items: OrganisationOutput[]; nextCursor: string | null }>(
        "/organisations?limit=200",
      )
        .then((d) => setOrgs(d.items))
        .catch(setError);
  }, [clinician]);
  return (
    <>
      <ErrorBox error={error} />
      {!clinician && (
        <label>
          Destination organisation
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Choose organisation</option>
            {orgs
              .filter((o) => o.id !== patient.orgId)
              .map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <Fields
        names={["reason"]}
        label="Request migration"
        busy={!clinician && !destination}
        onSave={async (d) => {
          await send(path + "/migrations", {
            ...d,
            ...(!clinician ? { destinationOrgId: destination } : {}),
            ifVersion: patient.version,
          });
          await refresh();
        }}
      />
    </>
  );
}
function Comparison({ path }: { path: string }) {
  const [result, setResult] = useState<ComparisonOutput>();
  return (
    <section className="panel">
      <h2>Compare two visits</h2>
      <Fields
        names={["leftVisitId", "rightVisitId"]}
        label="Compare visits"
        onSave={async (d) =>
          setResult(
            await request<ComparisonOutput>(
              path + "/comparison?" + new URLSearchParams(d),
            ),
          )
        }
      />
      {result && (
        <div className="comparison">
          {[result.left, result.right].map((side, i) => (
            <section key={i}>
              <h3>{i === 0 ? result.leftVisitId : result.rightVisitId}</h3>
              {side.map((m) => (
                <article className="medicine" key={m.id}>
                  <h3>{m.medicineName}</h3>
                  <p>
                    {m.strength.value} {m.strength.unit} · {m.form}
                  </p>
                  <pre>{m.instructionText}</pre>
                  <Status>{m.verificationStatus}</Status>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
function DestinationMigration() {
  const [done, setDone] = useState(false);
  return (
    <section className="panel">
      <h2>Request a handover to your organisation</h2>
      <p>
        Enter the patient ID and current record version supplied by the patient.
        This request does not provide access to their clinical record before
        approval.
      </p>
      {done ? (
        <p role="status">
          Migration requested. The patient can review the request in their
          workspace.
        </p>
      ) : (
        <Fields
          names={["patientId", "ifVersion", "reason"]}
          label="Request migration"
          onSave={async (d) => {
            const ifVersion = Number(d.ifVersion);
            if (!Number.isInteger(ifVersion) || ifVersion < 1)
              throw new ApiError(
                "VALIDATION_FAILED",
                "Enter a positive whole-number record version.",
              );
            await send(
              `/patients/${encodeURIComponent(d.patientId)}/migrations`,
              { reason: d.reason, ifVersion },
            );
            setDone(true);
          }}
        />
      )}
    </section>
  );
}
function PatientLogin({
  patient,
  write,
  refresh,
}: {
  patient?: PatientOutput;
  write: boolean;
  refresh: () => Promise<void>;
}) {
  const [account, setAccount] = useState<User>();
  const [error, setError] = useState<unknown>();
  const path = `/patients/${patient?.id}/login`;
  async function reload() {
    setError(undefined);
    try {
      setAccount(await request<User>(path));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    setAccount(undefined);
    if (write && patient?.linkedUserId) void reload();
  }, [patient?.id, patient?.linkedUserId, write]);
  if (!write) return <p>Patient login management requires full access.</p>;
  return (
    <section className="panel">
      <h2>Patient login</h2>
      <ErrorBox error={error} reload={reload} />
      {account ? (
        <>
          <p>
            {account.displayName} · {account.username}
          </p>
          <Status>{account.status}</Status>
          <div className="actions">
            <button
              onClick={async () => {
                try {
                  setAccount(
                    await send<User>(
                      path,
                      {
                        status:
                          account.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                        ifVersion: account.version,
                      },
                      "PATCH",
                    ),
                  );
                  await refresh();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {account.status === "ACTIVE" ? "Disable login" : "Enable login"}
            </button>
          </div>
          <Fields
            names={["password"]}
            label="Reset login password"
            onReload={reload}
            onSave={async (d) => {
              setAccount(
                await send<User>(
                  path,
                  { ...d, ifVersion: account.version },
                  "PATCH",
                ),
              );
              await refresh();
            }}
          />
        </>
      ) : (
        !patient?.linkedUserId && (
          <>
            <Fields
              names={["username", "displayName", "password"]}
              label="Create patient login"
              onSave={async (d) => {
                setAccount(await send<User>(path, d));
                await refresh();
              }}
            />
            <h3>Invite an existing login</h3>
            <Fields
              names={["username"]}
              label="Send link invitation"
              onSave={async (d) => {
                await send(`/patients/${patient!.id}/link-request`, d);
                await refresh();
              }}
            />
          </>
        )
      )}
    </section>
  );
}
function NewGrant({
  path,
  refresh,
}: {
  path: string;
  refresh: () => Promise<void>;
}) {
  const [orgs, setOrgs] = useState<OrganisationOutput[]>([]);
  const [orgId, setOrgId] = useState("");
  const [level, setLevel] = useState<GrantOutput["level"]>("VIEW_ONLY");
  const [error, setError] = useState<unknown>();
  const [version, setVersion] = useState<number>();
  async function load() {
    try {
      const [directory, existing, patient] = await Promise.all([
        requestPages<{
          items: OrganisationOutput[];
          nextCursor: string | null;
        }>("/organisations"),
        requestPages<{ items: GrantOutput[]; nextCursor: string | null }>(
          path + "/access-grants",
        ),
        request<PatientOutput>(path),
      ]);
      setOrgs(
        directory.items.filter(
          (o) => !existing.items.some((g) => g.orgId === o.id),
        ),
      );
      setVersion(patient.version);
      setOrgId("");
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Share with another organisation</summary>
      <ErrorBox error={error} reload={load} />
      <form
        className="fields"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send(`${path}/access-grants/${orgId}`, {
              level,
              ifVersion: version,
            });
            await refresh();
            await load();
          } catch (err) {
            setError(err);
          }
        }}
      >
        <label>
          Organisation
          <select
            value={orgId}
            required
            onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">Choose organisation</option>
            {orgs.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Access level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as GrantOutput["level"])}
          >
            {["NONE", "VIEW_ONLY", "FULL"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button disabled={!orgId || !version} className="primary">
          Save access grant
        </button>
      </form>
    </details>
  );
}
