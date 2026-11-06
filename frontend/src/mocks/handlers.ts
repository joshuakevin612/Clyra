import { http, HttpResponse } from "msw";
import { telemetryMock } from "./telemetry";
import originalFixture from "../../../fixtures/data.json";
import meadowbrook from "../../../fixtures/meadowbrook.json";
const fixture = {
  organisations: [...originalFixture.organisations, ...meadowbrook.organisations],
  users: [...originalFixture.users, ...meadowbrook.users],
  patients: [...originalFixture.patients, ...meadowbrook.patients],
  visits: [...originalFixture.visits, ...meadowbrook.visits],
  documents: [...originalFixture.documents, ...meadowbrook.documents],
};
import expected from "../../../fixtures/expected/discrepancies.json";
import type * as G from "../api/generated";
const rawFiles = import.meta.glob("../../../fixtures/documents/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const stamp = () => new Date().toISOString(),
  uid = (prefix: string) =>
    `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const notice =
  "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine.";
class Failure extends Error {
  constructor(
    public code: G.ErrorBody["code"],
    public status = 422,
    message?: string,
  ) {
    super(message ?? code.replaceAll("_", " "));
  }
}
function fail(
  code: G.ErrorBody["code"],
  status = 422,
  message?: string,
): never {
  throw new Failure(code, status, message);
}
function key(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b\d+(?:\.\d+)?\s*(?:mcg|mg|ml|iu|g)\b/g, "")
    .replace(/[^\p{L}\p{N}\s-]|_/gu, "")
    .replace(
      /\b(?:tablets?|tabs?|capsules?|caps?|liquids?|injections?|patch(?:es)?|inhalers?)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
function extract(raw: string, documentId: string): G.ExtractedFields[] {
  const lines = raw.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (lines[0]?.replace(/[\r\n]+$/, "") !== "SYN-RX-V1")
    throw Error("Only SYN-RX-V1 is supported.");
  const ordered = [
    "medicineName",
    "strength",
    "form",
    "instructionText",
    "startDate",
    "endDate",
    "prescriberName",
  ];
  let fields: Record<string, string> = {},
    sources: Record<string, G.Source> = {},
    offset = lines[0].length;
  const result: G.ExtractedFields[] = [];
  function finish() {
    if (!Object.keys(fields).length) return;
    if (Object.keys(fields).join() !== ordered.join())
      throw Error("Incomplete or out-of-order medication fields.");
    const match = fields.strength.match(/^(\d+(?:\.\d+)?) (MG|MCG|G|ML|IU)$/);
    if (
      !match ||
      ![
        "TABLET",
        "CAPSULE",
        "LIQUID",
        "INJECTION",
        "PATCH",
        "INHALER",
        "OTHER",
      ].includes(fields.form)
    )
      throw Error("Invalid strength or form.");
    for (const d of [fields.startDate, fields.endDate])
      if (
        d !== "null" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))
      )
        throw Error("Invalid date.");
    if (fields.endDate !== "null" && fields.startDate > fields.endDate)
      throw Error("startDate must be on or before endDate.");
    result.push({
      medicineName: fields.medicineName,
      medicineKey: key(fields.medicineName),
      strength: {
        value: Number(match[1]),
        unit: match[2] as G.Strength["unit"],
      },
      form: fields.form as G.MedicationOutput["form"],
      instructionText: fields.instructionText,
      startDate: fields.startDate,
      endDate: fields.endDate === "null" ? null : fields.endDate,
      prescriberName:
        fields.prescriberName === "null" ? null : fields.prescriberName,
      source: sources.instructionText,
      fieldSources: { ...sources },
    });
    fields = {};
    sources = {};
  }
  for (const line of lines.slice(1)) {
    const text = line.replace(/[\r\n]+$/, "");
    if (text === "---") finish();
    else if (text) {
      const index = text.indexOf(": "),
        name = text.slice(0, index),
        value = text.slice(index + 2);
      if (index < 0 || !ordered.includes(name) || name in fields)
        throw Error("Invalid SYN-RX-V1 field.");
      fields[name] = value;
      const start = Array.from(raw.slice(0, offset + index + 2)).length;
      sources[name] = {
        documentId,
        page: 1,
        quote: value,
        charStart: start,
        charEnd: start + Array.from(value).length,
      };
    }
    offset += line.length;
  }
  finish();
  if (!result.length) throw Error("No medication fields found.");
  return result;
}
const users: G.UserOutput[] = fixture.users.map((u) => ({
  ...u,
  version: 1,
  status: "ACTIVE",
  mustChangePassword: false,
  role: u.role as G.UserOutput["role"],
}));
users.push({
  id: "usr_platform",
  version: 1,
  username: "platform.demo",
  displayName: "Platform owner (synthetic)",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  orgId: null,
  patientId: null,
  mustChangePassword: true,
});
const passwords = new Map(users.map((u) => [u.id, "Clyra-demo-2026"]));
const orgs: G.OrganisationOutput[] = fixture.organisations.map((o) => ({
  ...o,
  version: 1,
  status: "ACTIVE",
}));
const patients: G.PatientOutput[] = fixture.patients.map((p) => ({
  ...p,
  version: 1,
  linkedUserId: p.id === "pat_001" ? "usr_alex" : meadowbrook.patients.find(m => m.id === p.id)?.linkedUserId ?? null,
}));
const visits: G.VisitOutput[] = fixture.visits.map((v) => ({
  ...v,
  version: 1,
}));
const grants: G.GrantOutput[] = patients.map((p) => ({
  id: uid("acc"),
  version: 1,
  patientId: p.id,
  orgId: p.orgId!,
  level: "FULL",
}));
grants.push({
  id: uid("acc"),
  version: 1,
  patientId: "pat_001",
  orgId: "org_riverside",
  level: "VIEW_ONLY",
});
const docs: G.DocumentOutput[] = [],
  meds: G.MedicationOutput[] = [],
  extractions = new Map<string, G.ExtractedFields[]>(),
  jobs: G.JobOutput[] = [];
for (const d of fixture.documents) {
  const rawText = rawFiles[`../../../fixtures/documents/${d.id}.txt`];
  const fields = extract(rawText, d.id);
  docs.push({
    id: d.id,
    version: 1,
    patientId: d.patientId,
    visitId: d.visitId,
    rawText,
    createdAt: "2026-01-01T00:00:00Z",
  });
  extractions.set(d.id, fields);
  fields.forEach((f, i) => {
    const { fieldSources, ...rest } = f;
    meds.push({
      ...rest,
      id: `med_${d.id.slice(4)}_${i}`,
      version: 1,
      patientId: d.patientId,
      visitId: d.visitId,
      sourceDocumentId: d.id,
      supersedesId: null,
      verificationStatus: "UNVERIFIED",
      createdAt:
        visits.find((v) => v.id === d.visitId)!.visitDate + "T00:00:00Z",
      verifiedAt: null,
    });
  });
}
const discrepancies: G.DiscrepancyOutput[] = expected.map((d, i) => ({
  ...d,
  id: `disc_${i + 1}`,
  version: 1,
  patientId: "pat_001",
  type: d.type as G.DiscrepancyOutput["type"],
  field: d.field as G.DiscrepancyOutput["field"],
  summary: `${d.type}: ${d.medicineKey} (${d.field})`,
  status: "OPEN",
  hasDecision: false,
  detectedAt: "2026-03-01T00:00:00Z",
}));
const links: G.LinkOutput[] = [];
const linkPatients = new Map<string, string>();
const migrations: G.MigrationOutput[] = [
  {
    id: "mig_001",
    version: 1,
    patientId: "pat_001",
    sourceOrgId: "org_north",
    destinationOrgId: "org_riverside",
    status: "PENDING_PATIENT_APPROVAL",
    createdAt: "2026-03-01T00:00:00Z",
    completedAt: null,
    reason: "Synthetic handover",
  },
];
const audit: G.AuditOutput[] = [],
  access: G.AccessOutput[] = [];
const sessions = new Map<string, { userId: string; expires: number }>();
function version(row: { version: number }, body: { ifVersion?: number }) {
  if (row.version !== body.ifVersion) fail("VERSION_CONFLICT", 409);
}
function requireRole(u: G.UserOutput, ...roles: string[]) {
  if (!roles.includes(u.role)) fail("FORBIDDEN", 403);
}
function patient(u: G.UserOutput, id: string, write = false, clinical = false) {
  const p = patients.find((p) => p.id === id) ?? fail("NOT_FOUND", 404);
  if (u.role === "PATIENT") {
    if (write || clinical) fail("FORBIDDEN", 403);
    if (u.patientId !== id) fail("NOT_FOUND", 404);
  } else {
    requireRole(u, "CLINICIAN");
    const level =
      grants.find((g) => g.patientId === id && g.orgId === u.orgId)?.level ??
      "NONE";
    if (level === "NONE") fail("NOT_FOUND", 404);
    if (write && level !== "FULL") fail("FORBIDDEN", 403);
  }
  return p;
}
function revoke(id: string) {
  for (const [k, v] of sessions) if (v.userId === id) sessions.delete(k);
}
function log(
  u: G.UserOutput,
  action: string,
  targetId: string,
  patientId: string | null = null,
) {
  audit.push({
    id: uid("aud"),
    orgId: u.orgId,
    patientId,
    actorId: u.id,
    actorRole: u.role,
    action,
    targetId,
    occurredAt: stamp(),
    before: null,
    after: null,
    note: null,
  });
}
function read(
  u: G.UserOutput,
  resource: string,
  resourceId: string,
  patientId: string | null = null,
) {
  access.push({
    id: uid("acc"),
    orgId: u.orgId,
    patientId,
    actorId: u.id,
    actorRole: u.role,
    resource,
    resourceId,
    occurredAt: stamp(),
  });
}
function setGrant(
  patientId: string,
  orgId: string,
  level: G.GrantOutput["level"],
) {
  let g = grants.find((g) => g.patientId === patientId && g.orgId === orgId);
  if (g) {
    g.level = level;
    g.version++;
  } else {
    g = { id: uid("acc"), version: 1, patientId, orgId, level };
    grants.push(g);
  }
  return g;
}
function page<T extends { id?: string }>(items: T[], url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 50),
    cursor = url.searchParams.get("cursor");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    fail("VALIDATION_FAILED");
  const start = cursor ? items.findIndex((x) => x.id === cursor) + 1 : 0;
  const batch = items.slice(start, start + limit);
  return {
    items: batch,
    nextCursor:
      start + limit < items.length ? (batch.at(-1)?.id ?? null) : null,
  };
}
function patchAccount(
  u: G.UserOutput,
  member: G.UserOutput,
  body: G.AccountPatch,
  pid?: string,
) {
  version(member, body);
  if (
    body.status === "DISABLED" &&
    member.role === "ADMIN" &&
    users.filter(
      (x) =>
        x.role === "ADMIN" && x.orgId === member.orgId && x.status === "ACTIVE",
    ).length <= 1
  )
    fail("LAST_ADMIN_PROTECTED", 409);
  if (body.password) {
    if (body.password.length < 12) fail("VALIDATION_FAILED");
    passwords.set(member.id, body.password);
    member.mustChangePassword = true;
    revoke(member.id);
  }
  if (body.status) {
    member.status = body.status;
    if (body.status === "DISABLED") revoke(member.id);
  }
  member.version++;
  log(
    u,
    body.password
      ? "USER_PASSWORD_RESET"
      : body.status === "ACTIVE"
        ? "USER_ENABLED"
        : "USER_DISABLED",
    member.id,
    pid,
  );
  return member;
}
function createAccount(
  u: G.UserOutput,
  body: G.Account,
  role: G.UserOutput["role"],
  orgId: string | null,
  patientId: string | null = null,
) {
  if (
    users.some((x) => x.username === body.username) ||
    !body.username ||
    !body.displayName ||
    body.password.length < 12
  )
    fail("VALIDATION_FAILED");
  const member: G.UserOutput = {
    id: uid("usr"),
    version: 1,
    username: body.username,
    displayName: body.displayName,
    role,
    status: "ACTIVE",
    orgId,
    patientId,
    mustChangePassword: true,
  };
  users.push(member);
  passwords.set(member.id, body.password);
  log(u, "USER_CREATED", member.id, patientId);
  return member;
}
export const handlers = [
  http.all("*/api/v1/*", async ({ request }) => {
    try {
      const url = new URL(request.url),
        path = url.pathname.replace("/api/v1", ""),
        method = request.method;
      const body = request.headers
        .get("Content-Type")
        ?.includes("application/json")
        ? await request.json()
        : {};
      const b = body as G.AccountPatch &
        G.Account &
        G.PatientPatch &
        Omit<G.MigrationDecision, "decision"> &
        G.MigrationBody &
        Omit<G.Review, "decision"> &
        G.Verification &
        G.LinkBody &
        Omit<G.LinkDecision, "decision"> & {
          decision:
            | G.MigrationDecision["decision"]
            | G.Review["decision"]
            | G.LinkDecision["decision"];
        } & G.GrantBody &
        G.VisitBody &
        G.OrgBody &
        Omit<G.OrgPatch, "status"> &
        G.Signup &
        G.PasswordBody;
      const json = (v: unknown, status = 200) =>
        new HttpResponse(JSON.stringify(v), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/auth/login") {
        const u = users.find((u) => u.username === b.username);
        if (!u || passwords.get(u.id) !== b.password)
          fail("INVALID_CREDENTIALS", 401);
        if (
          u.status !== "ACTIVE" ||
          (u.orgId && orgs.find((o) => o.id === u.orgId)?.status !== "ACTIVE")
        )
          fail("ACCOUNT_DISABLED", 403);
        const token = uid("token"),
          expires = Date.now() + 8 * 3600000;
        sessions.set(token, { userId: u.id, expires });
        return json({
          accessToken: token,
          tokenType: "Bearer",
          expiresAt: new Date(expires).toISOString(),
          user: u,
        });
      }
      if (path === "/auth/signup") {
        const synthetic = users[0];
        const u = createAccount(synthetic, b, "PATIENT", null);
        u.mustChangePassword = false;
        return json(u, 201);
      }
      const token =
          request.headers.get("Authorization")?.replace("Bearer ", "") ?? "",
        session = sessions.get(token);
      if (!session || session.expires < Date.now())
        fail("UNAUTHENTICATED", 401);
      const u = users.find((u) => u.id === session.userId)!;
      if (u.status !== "ACTIVE") fail("ACCOUNT_DISABLED", 403);
      if (path === "/auth/logout") {
        sessions.delete(token);
        return json({ revoked: true });
      }
      if (path === "/auth/me") return json(u);
      if (path === "/auth/change-password") {
        version(u, b);
        if (passwords.get(u.id) !== b.currentPassword)
          fail("INVALID_CREDENTIALS", 401);
        if (b.newPassword.length < 12) fail("VALIDATION_FAILED");
        passwords.set(u.id, b.newPassword);
        u.mustChangePassword = false;
        u.version++;
        revoke(u.id);
        return json(u);
      }
      if (u.mustChangePassword)
        fail("FORBIDDEN", 403, "Change your password first.");
      const telemetry = path.match(/^\/patients\/([^/]+)\/telemetry(\/.*)$/);
      if (telemetry) {
        requireRole(u, "CLINICIAN");
        patient(u, telemetry[1], method !== "GET", true);
        const result = telemetryMock(telemetry[1], u.id, telemetry[2], method, body, url, fail);
        if (result.action) log(u, result.action, result.targetId, telemetry[1]);
        if (method === "GET") read(u, "TELEMETRY", result.targetId, telemetry[1]);
        return json(result.value, result.status);
      }
      if (path === "/organisations") {
        requireRole(u, "PATIENT", "CLINICIAN");
        return json(
          page(
            orgs.filter((o) => o.status === "ACTIVE"),
            url,
          ),
        );
      }
      if (path.startsWith("/superadmin") || path.startsWith("/admin/")) {
        const platform = path.startsWith("/superadmin");
        requireRole(u, platform ? "SUPER_ADMIN" : "ADMIN");
        const parts = path.split("/");
        if (path.endsWith("/audit") || path.endsWith("/access-log")) {
          read(u, path.endsWith("/audit") ? "AUDIT" : "ACCESS_LOG", u.id);
          let rows = (path.endsWith("/audit") ? audit : access).filter(
            (e) => platform || e.orgId === u.orgId,
          );
          for (const field of ["orgId", "actorId", "action", "from", "to"]) {
            const value = url.searchParams.get(field);
            if (value)
              rows = rows.filter((e) =>
                field === "from"
                  ? e.occurredAt >= value
                  : field === "to"
                    ? e.occurredAt <=
                      (value.length === 10
                        ? value + "T23:59:59.999999Z"
                        : value)
                    : field === "action"
                      ? ("action" in e ? e.action : e.resource) === value
                      : e[field as "orgId" | "actorId"] === value,
              );
          }
          return json(page(rows, url));
        }
        if (platform && parts[2] === "organisations") {
          if (parts.length === 3) {
            if (method === "GET") return json(page(orgs, url));
            const o: G.OrganisationOutput = {
              id: uid("org"),
              version: 1,
              name: b.name,
              status: "ACTIVE",
            };
            orgs.push(o);
            const admin = createAccount(
              u,
              {
                username: b.adminUsername,
                displayName: b.adminDisplayName,
                password: b.adminPassword,
              },
              "ADMIN",
              o.id,
            );
            return json({ ...o, admin }, 201);
          }
          const o =
            orgs.find((o) => o.id === parts[3]) ?? fail("NOT_FOUND", 404);
          if (parts.length === 4) {
            version(o, b);
            o.status = b.status as G.OrganisationOutput["status"];
            o.version++;
            if (o.status === "SUSPENDED")
              users
                .filter((x) => x.orgId === o.id)
                .forEach((x) => revoke(x.id));
            log(u, "ORGANISATION_STATUS_CHANGED", o.id);
            return json(o);
          }
          if (parts[4] === "admins") {
            if (parts[5]) {
              const member =
                users.find(
                  (x) =>
                    x.id === parts[5] && x.orgId === o.id && x.role === "ADMIN",
                ) ?? fail("NOT_FOUND", 404);
              return json(patchAccount(u, member, b));
            }
            if (method === "GET")
              return json(
                page(
                  users.filter((x) => x.orgId === o.id && x.role === "ADMIN"),
                  url,
                ),
              );
            return json(createAccount(u, b, "ADMIN", o.id), 201);
          }
        }
        if (!platform && parts[2] === "users") {
          if (parts[3]) {
            const member =
              users.find(
                (x) =>
                  x.id === parts[3] &&
                  x.orgId === u.orgId &&
                  x.role === "CLINICIAN",
              ) ?? fail("NOT_FOUND", 404);
            return json(patchAccount(u, member, b));
          }
          if (method === "GET")
            return json(
              page(
                users.filter(
                  (x) => x.orgId === u.orgId && x.role === "CLINICIAN",
                ),
                url,
              ),
            );
          return json(createAccount(u, b, "CLINICIAN", u.orgId), 201);
        }
        fail("NOT_FOUND", 404);
      }
      if (u.role === "ADMIN" || u.role === "SUPER_ADMIN")
        fail("NOT_FOUND", 404);
      if (path === "/link-requests") {
        requireRole(u, "PATIENT");
        return json(
          page(
            links.filter((l) => l.userId === u.id),
            url,
          ),
        );
      }
      const linkMatch = path.match(/^\/link-requests\/([^/]+)\/decision$/);
      if (linkMatch) {
        requireRole(u, "PATIENT");
        const l =
          links.find((l) => l.id === linkMatch[1] && l.userId === u.id) ??
          fail("NOT_FOUND", 404);
        version(l, b);
        if (l.status !== "PENDING") fail("VERSION_CONFLICT", 409);
        l.status = b.decision as G.LinkOutput["status"];
        l.version++;
        if (b.decision === "CONFIRM") {
          if (u.patientId) fail("VERSION_CONFLICT", 409);
          const p = patients.find((p) => p.id === linkPatients.get(l.id))!;
          if (p.linkedUserId) fail("VERSION_CONFLICT", 409);
          p.linkedUserId = u.id;
          p.version++;
          u.patientId = p.id;
          u.orgId = p.orgId;
          u.version++;
        }
        log(u, "LINK_" + b.decision, l.id);
        return json(l);
      }
      const migrationMatch = path.match(
        /^\/migrations\/([^/]+)(?:\/(decision|cancel))?$/,
      );
      if (migrationMatch) {
        const m =
          migrations.find((m) => m.id === migrationMatch[1]) ??
          fail("NOT_FOUND", 404);
        if (
          u.role === "PATIENT"
            ? u.patientId !== m.patientId
            : ![m.sourceOrgId, m.destinationOrgId].includes(u.orgId!)
        )
          fail("NOT_FOUND", 404);
        if (method === "GET") return json(m);
        requireRole(u, "PATIENT");
        if (m.status !== "PENDING_PATIENT_APPROVAL")
          fail("MIGRATION_NOT_PENDING", 409);
        version(m, b);
        const p = patient(u, m.patientId);
        m.version++;
        if (migrationMatch[2] === "cancel") m.status = "CANCELLED";
        else if (b.decision === "DECLINE") m.status = "DECLINED";
        else {
          m.status = "COMPLETED";
          m.completedAt = stamp();
          setGrant(p.id, m.destinationOrgId, "FULL");
          setGrant(
            p.id,
            m.sourceOrgId,
            b.decision === "APPROVE_VIEW_ONLY" ? "VIEW_ONLY" : "NONE",
          );
          p.orgId = m.destinationOrgId;
          u.orgId = m.destinationOrgId;
          u.version++;
        }
        p.version++;
        log(u, "MIGRATION_" + m.status, m.id, p.id);
        return json(m);
      }
      if (path === "/patients") {
        requireRole(u, "CLINICIAN", "PATIENT");
        if (method === "GET") {
          const visible = patients.filter((p) =>
            u.role === "PATIENT"
              ? u.patientId === p.id
              : grants.some(
                  (g) =>
                    g.patientId === p.id &&
                    g.orgId === u.orgId &&
                    g.level !== "NONE",
                ),
          );
          read(u, "PATIENT", u.id);
          return json(
            page(
              visible.map((p) => ({
                ...p,
                ...(u.role === "CLINICIAN"
                  ? {
                      accessLevel: grants.find(
                        (g) => g.patientId === p.id && g.orgId === u.orgId,
                      )!.level,
                    }
                  : {}),
              })),
              url,
            ),
          );
        }
        requireRole(u, "CLINICIAN");
        const p: G.PatientOutput = {
          id: uid("pat"),
          version: 1,
          displayName: b.displayName,
          dateOfBirth: b.dateOfBirth,
          orgId: u.orgId,
          linkedUserId: null,
        };
        patients.push(p);
        setGrant(p.id, u.orgId!, "FULL");
        log(u, "PATIENT_CREATED", p.id, p.id);
        return json({ ...p, accessLevel: "FULL" }, 201);
      }
      const pm = path.match(/^\/patients\/([^/]+)(?:\/(.*))?$/);
      if (pm) {
        const id = pm[1],
          sub = pm[2] ?? "";
        if (sub === "migrations" && method === "POST") {
          requireRole(u, "PATIENT", "CLINICIAN");
          const p = patients.find((p) => p.id === id) ?? fail("NOT_FOUND", 404);
          if (u.role === "PATIENT") patient(u, id);
          version(p, b);
          const destination =
            u.role === "PATIENT" ? b.destinationOrgId : u.orgId;
          if (
            !destination ||
            destination === p.orgId ||
            !orgs.some((o) => o.id === destination && o.status === "ACTIVE")
          )
            fail("VALIDATION_FAILED");
          if (
            !p.linkedUserId ||
            users.find((x) => x.id === p.linkedUserId)?.status !== "ACTIVE"
          )
            fail("VALIDATION_FAILED");
          if (
            migrations.some(
              (m) =>
                m.patientId === id && m.status === "PENDING_PATIENT_APPROVAL",
            )
          )
            fail("VERSION_CONFLICT", 409);
          const m: G.MigrationOutput = {
            id: uid("mig"),
            version: 1,
            patientId: id,
            sourceOrgId: p.orgId!,
            destinationOrgId: destination,
            status: "PENDING_PATIENT_APPROVAL",
            createdAt: stamp(),
            completedAt: null,
            reason: b.reason,
          };
          migrations.push(m);
          p.version++;
          log(u, "MIGRATION_REQUESTED", m.id, id);
          return json(m, 201);
        }
        const p = patient(
          u,
          id,
          method !== "GET" && !sub.startsWith("access-grants"),
          u.role === "PATIENT" &&
            ["medications", "comparison", "discrepancies"].includes(sub),
        );
        if (method === "GET")
          read(u, sub.toUpperCase() || "PATIENT", p.id, p.id);
        if (!sub) {
          if (method === "PATCH") {
            version(p, b);
            p.displayName = b.displayName;
            p.dateOfBirth = b.dateOfBirth;
            p.version++;
            log(u, "PATIENT_UPDATED", p.id, id);
          }
          return json({
            ...p,
            ...(u.role === "CLINICIAN"
              ? {
                  accessLevel: grants.find(
                    (g) => g.patientId === id && g.orgId === u.orgId,
                  )!.level,
                }
              : {}),
          });
        }
        if (sub === "login") {
          patient(u, id, true);
          if (method === "GET")
            return json(
              users.find((x) => x.patientId === id) ?? fail("NOT_FOUND", 404),
            );
          if (method === "PATCH") {
            const member =
              users.find((x) => x.patientId === id) ?? fail("NOT_FOUND", 404);
            return json(patchAccount(u, member, b, id));
          }
          if (p.linkedUserId) fail("VERSION_CONFLICT", 409);
          const member = createAccount(u, b, "PATIENT", p.orgId, id);
          p.linkedUserId = member.id;
          p.version++;
          return json(member, 201);
        }
        if (sub === "link-request") {
          const member =
            users.find(
              (x) =>
                x.username === b.username &&
                x.role === "PATIENT" &&
                x.status === "ACTIVE" &&
                !x.patientId,
            ) ?? fail("NOT_FOUND", 404);
          if (p.linkedUserId) fail("VERSION_CONFLICT", 409);
          const l: G.LinkOutput = {
            id: uid("lnk"),
            version: 1,
            userId: member.id,
            status: "PENDING",
            displayName: p.displayName,
            dateOfBirth: p.dateOfBirth,
          };
          links.push(l);
          linkPatients.set(l.id, id);
          log(u, "LINK_REQUESTED", l.id, id);
          return json(l, 201);
        }
        if (sub === "visits") {
          if (method === "GET")
            return json(
              page(
                visits.filter((v) => v.patientId === id),
                url,
              ),
            );
          version(p, b);
          const v: G.VisitOutput = {
            id: uid("vis"),
            version: 1,
            patientId: id,
            orgId: u.orgId,
            visitDate: b.visitDate,
          };
          visits.push(v);
          p.version++;
          log(u, "VISIT_CREATED", v.id, id);
          return json(v, 201);
        }
        if (sub === "medications") {
          requireRole(u, "CLINICIAN");
          return json(
            page(
              meds.filter((m) => m.patientId === id),
              url,
            ),
          );
        }
        if (sub === "medications/patient-view") {
          const groups = new Map<string, G.MedicationOutput[]>();
          for (const m of meds.filter(
            (m) => m.patientId === id && m.verificationStatus !== "REJECTED",
          ))
            groups.set(m.medicineKey, [
              ...(groups.get(m.medicineKey) ?? []),
              m,
            ]);
          const result = Array.from(groups.values()).map((group) => {
            const verified = group.filter(
              (m) => m.verificationStatus === "VERIFIED",
            );
            const m = (verified.length ? verified : group)
              .sort((a, b) =>
                (a.createdAt + a.id).localeCompare(b.createdAt + b.id),
              )
              .at(-1)!;
            return {
              id: m.id,
              medicineName: m.medicineName,
              status: verified.length ? "VERIFIED" : "AWAITING_REVIEW",
              strength: m.strength,
              form: m.form,
              instructionText: verified.length ? m.instructionText : null,
              startDate: m.startDate,
              prescriberName: m.prescriberName,
              verifiedAt: m.verifiedAt,
              sourceVisitDate: visits.find((v) => v.id === m.visitId)!
                .visitDate,
            };
          });
          const resultPage = page(result, url);
          return json({
            ...resultPage,
            items: resultPage.items.map(({ id, ...rest }) => rest),
            notice,
          });
        }
        if (sub === "comparison") {
          requireRole(u, "CLINICIAN");
          const left = url.searchParams.get("leftVisitId"),
            right = url.searchParams.get("rightVisitId");
          if (
            !visits.some((v) => v.id === left && v.patientId === id) ||
            !visits.some((v) => v.id === right && v.patientId === id)
          )
            fail("NOT_FOUND", 404);
          return json({
            leftVisitId: left,
            rightVisitId: right,
            left: meds.filter((m) => m.visitId === left),
            right: meds.filter((m) => m.visitId === right),
          });
        }
        if (sub === "discrepancies") {
          requireRole(u, "CLINICIAN");
          const status = url.searchParams.get("status");
          return json(
            page(
              discrepancies.filter(
                (d) => d.patientId === id && (!status || d.status === status),
              ),
              url,
            ),
          );
        }
        if (sub === "migrations")
          return json(
            page(
              migrations.filter((m) => m.patientId === id),
              url,
            ),
          );
        if (sub === "access-log") {
          requireRole(u, "PATIENT");
          return json(
            page(
              access.filter((a) => a.patientId === id),
              url,
            ),
          );
        }
        if (sub.startsWith("access-grants")) {
          const orgId = sub.split("/")[1];
          if (method === "GET")
            return json(
              page(
                grants.filter((g) => g.patientId === id),
                url,
              ),
            );
          requireRole(u, "PATIENT");
          const old = grants.find(
            (g) => g.patientId === id && g.orgId === orgId,
          );
          version(old ?? p, b);
          if (!orgs.some((o) => o.id === orgId)) fail("NOT_FOUND", 404);
          const g = setGrant(id, orgId, b.level);
          p.version++;
          log(u, "ACCESS_GRANT_CHANGED", g.id, id);
          return json(g);
        }
      }
      const dm = path.match(/^\/discrepancies\/([^/]+)\/decisions$/);
      if (dm) {
        const d =
          discrepancies.find((d) => d.id === dm[1]) ?? fail("NOT_FOUND", 404);
        patient(u, d.patientId, true);
        version(d, b);
        if (!b.note || b.note.trim().length < 3) fail("VALIDATION_FAILED");
        d.hasDecision = true;
        d.status = ["ACCEPT_LEFT", "ACCEPT_RIGHT"].includes(b.decision)
          ? "RESOLVED"
          : "OPEN";
        d.version++;
        log(u, "DISCREPANCY_DECIDED", d.id, d.patientId);
        return json(
          {
            id: uid("disc"),
            version: 1,
            discrepancyId: d.id,
            decision: b.decision,
            note: b.note,
            actorId: u.id,
            createdAt: stamp(),
          },
          201,
        );
      }
      const mm = path.match(/^\/medications\/([^/]+)\/verification$/);
      if (mm) {
        const m = meds.find((m) => m.id === mm[1]) ?? fail("NOT_FOUND", 404);
        patient(u, m.patientId, true);
        version(m, b);
        if (
          b.verificationStatus === "VERIFIED" &&
          discrepancies.some(
            (d) =>
              d.patientId === m.patientId &&
              d.medicineKey === m.medicineKey &&
              d.status === "OPEN" &&
              ["CONFLICT", "MISSING"].includes(d.type) &&
              !d.hasDecision,
          )
        )
          fail("VERSION_CONFLICT", 409);
        m.verificationStatus = b.verificationStatus;
        m.verifiedAt = b.verificationStatus === "VERIFIED" ? stamp() : null;
        m.version++;
        log(u, "MEDICATION_" + b.verificationStatus, m.id, m.patientId);
        return json(m);
      }
      if (path === "/documents" && method === "POST") {
        const f = await request.formData(),
          p = patient(u, String(f.get("patientId")), true);
        version(p, { ifVersion: Number(f.get("ifVersion")) });
        const visit =
          visits.find(
            (v) => v.id === f.get("visitId") && v.patientId === p.id,
          ) ?? fail("NOT_FOUND", 404);
        const file = f.get("file") as File;
        if (!file || file.size > 2_000_000) fail("VALIDATION_FAILED");
        let raw: string;
        try {
          raw = new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          );
        } catch {
          fail("VALIDATION_FAILED", 422, "Upload valid UTF-8 text.");
        }
        const doc: G.DocumentOutput = {
          id: uid("doc"),
          version: 1,
          patientId: p.id,
          visitId: visit.id,
          rawText: raw!,
          createdAt: stamp(),
        };
        const job: G.JobOutput = {
          id: uid("job"),
          version: 1,
          documentId: doc.id,
          status: "COMPLETED",
          reason: null,
        };
        let fields: G.ExtractedFields[] = [];
        try {
          fields = extract(raw!, doc.id);
        } catch (e) {
          job.status = "FAILED";
          job.reason = e instanceof Error ? e.message : "Extraction failed.";
        }
        const oldId = f.get("supersedesId");
        let old: G.MedicationOutput | undefined;
        if (oldId) {
          old =
            meds.find((m) => m.id === oldId && m.patientId === p.id) ??
            fail("NOT_FOUND", 404);
          version(old, { ifVersion: Number(f.get("supersedesIfVersion")) });
          if (meds.some((m) => m.supersedesId === oldId))
            fail("VERSION_CONFLICT", 409);
          if (
            job.status === "COMPLETED" &&
            (fields.length !== 1 || fields[0].medicineKey !== old.medicineKey)
          )
            fail(
              "VALIDATION_FAILED",
              422,
              "A replacement must contain one matching medicine.",
            );
        }
        docs.push(doc);
        jobs.push(job);
        p.version++;
        if (job.status === "COMPLETED") {
          extractions.set(doc.id, fields);
          for (const field of fields) {
            const { fieldSources, ...values } = field;
            meds.push({
              ...values,
              id: uid("med"),
              version: 1,
              patientId: p.id,
              visitId: visit.id,
              sourceDocumentId: doc.id,
              supersedesId: old?.id ?? null,
              verificationStatus: "UNVERIFIED",
              createdAt: stamp(),
              verifiedAt: null,
            });
          }
        }
        if (job.status === "COMPLETED") detect(p.id, u);
        log(u, "DOCUMENT_UPLOADED", doc.id, p.id);
        return json(
          { documentId: doc.id, jobId: job.id, status: job.status },
          202,
        );
      }
      const docm = path.match(/^\/documents\/([^/]+)(?:\/(extraction))?$/);
      if (docm) {
        const d = docs.find((d) => d.id === docm[1]) ?? fail("NOT_FOUND", 404);
        patient(u, d.patientId, false, true);
        read(u, docm[2] ? "EXTRACTION" : "DOCUMENT", d.id, d.patientId);
        if (!docm[2]) return json(d);
        const job = jobs.find((j) => j.documentId === d.id);
        return json({
          documentId: d.id,
          status: job?.status === "FAILED" ? "FAILED" : "COMPLETED",
          reason: job?.reason ?? null,
          items: extractions.get(d.id) ?? [],
          nextCursor: null,
        });
      }
      const jm = path.match(/^\/extraction-jobs\/([^/]+)$/);
      if (jm) {
        const j = jobs.find((j) => j.id === jm[1]) ?? fail("NOT_FOUND", 404);
        const d = docs.find((d) => d.id === j.documentId)!;
        patient(u, d.patientId, false, true);
        return json(j);
      }
      fail("NOT_FOUND", 404);
    } catch (e) {
      const f =
        e instanceof Failure
          ? e
          : new Failure(
              "INTERNAL_ERROR",
              500,
              "The synthetic request could not be completed.",
            );
      return HttpResponse.json(
        { error: { code: f.code, message: f.message, details: [] } },
        { status: f.status },
      );
    }
  }),
];
// Same deterministic comparison rules as backend/app/domain.py; no automatic resolutions.
function detect(patientId: string, actor: G.UserOutput) {
  const completed = new Set(
    docs
      .filter((d) => d.patientId === patientId && extractions.has(d.id))
      .map((d) => d.visitId),
  );
  const ordered = visits
    .filter((v) => v.patientId === patientId && completed.has(v.id))
    .sort((a, b) => (a.visitDate + a.id).localeCompare(b.visitDate + b.id));
  const all = meds.filter((m) => m.patientId === patientId),
    superseded = new Set(
      all
        .filter(
          (m) =>
            m.supersedesId &&
            all.find((old) => old.id === m.supersedesId)?.visitId === m.visitId,
        )
        .map((m) => m.supersedesId),
    );
  const list = (id: string) =>
    all
      .filter((m) => m.visitId === id && !superseded.has(m.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  function add(
    type: G.DiscrepancyOutput["type"],
    field: G.DiscrepancyOutput["field"],
    a: G.MedicationOutput,
    b: G.MedicationOutput | null,
    v: G.VisitOutput,
  ) {
    if (
      discrepancies.some(
        (d) =>
          d.patientId === patientId &&
          d.type === type &&
          d.field === field &&
          d.leftEntryId === a.id &&
          d.rightEntryId === (b?.id ?? null) &&
          d.visitId === v.id,
      )
    )
      return;
    const d: G.DiscrepancyOutput = {
      id: uid("disc"),
      version: 1,
      patientId,
      type,
      field,
      medicineKey: a.medicineKey,
      leftEntryId: a.id,
      rightEntryId: b?.id ?? null,
      visitId: v.id,
      summary: `${type}: ${a.medicineKey} (${field})`,
      status: "OPEN",
      hasDecision: false,
      detectedAt: stamp(),
    };
    discrepancies.push(d);
    log(actor, "DISCREPANCY_DETECTED", d.id, patientId);
  }
  for (const v of ordered) {
    const entries = list(v.id);
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i],
          b = entries[j];
        if (
          a.medicineKey === b.medicineKey &&
          a.form === b.form &&
          JSON.stringify(a.strength) === JSON.stringify(b.strength)
        )
          add("DUPLICATE", "medicine", a, b, v);
      }
  }
  for (let i = 1; i < ordered.length; i++) {
    const left = list(ordered[i - 1].id),
      right = list(ordered[i].id);
    for (const medicineKey of new Set(left.map((m) => m.medicineKey))) {
      const old = left.filter((m) => m.medicineKey === medicineKey),
        next = right.filter((m) => m.medicineKey === medicineKey);
      if (!next.length) {
        const active = old.find(
          (m) => !m.endDate || m.endDate >= ordered[i].visitDate,
        );
        if (active) add("MISSING", "medicine", active, null, ordered[i]);
      } else {
        const seen = new Set<string>();
        for (const a of old)
          for (const b of next) {
            if (
              (a.endDate ?? "9999-12-31") < b.startDate ||
              (b.endDate ?? "9999-12-31") < a.startDate
            )
              continue;
            for (const field of [
              "strength",
              "form",
              "instructionText",
            ] as const)
              if (
                !seen.has(field) &&
                JSON.stringify(a[field]) !== JSON.stringify(b[field])
              ) {
                add("CONFLICT", field, a, b, ordered[i]);
                seen.add(field);
              }
          }
      }
    }
  }
}
