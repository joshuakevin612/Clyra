import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
const base = "http://localhost/api/v1";
it("Meadowbrook demo has a three-clinician roster and six linked patients with tenant isolation", async () => {
  const admin = await auth("admin.meadow");
  const clinicians = await (await fetch(base + "/admin/users", { headers: admin })).json();
  expect(clinicians.items.map((u: {username: string}) => u.username).sort()).toEqual(["dr.ethan", "dr.maya", "dr.sofia"]);
  const doctor = await auth("dr.maya");
  const patients = await (await fetch(base + "/patients", { headers: doctor })).json();
  expect(patients.items).toHaveLength(6);
  expect((await fetch(base + "/patients/pat_001", { headers: doctor })).status).toBe(404);
  const meds = await (await fetch(base + "/patients/pat_meadow_01/medications", { headers: doctor })).json();
  expect(meds.items).toHaveLength(4);
  const patient = await auth("ava.meadow");
  expect((await fetch(base + "/patients/pat_meadow_01/medications/patient-view", { headers: patient })).status).toBe(200);
  expect((await fetch(base + "/patients/pat_meadow_02/medications/patient-view", { headers: patient })).status).toBe(404);
});
async function auth(username: string) {
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "Clyra-demo-2026" }),
  });
  return { Authorization: "Bearer " + (await r.json()).accessToken };
}
describe("canonical fixture mocks", () => {
  it("enforces tenant isolation and preserves raw instructions", async () => {
    const headers = await auth("dr.north");
    expect((await fetch(base + "/patients/pat_002", { headers })).status).toBe(
      404,
    );
    const meds = await (
      await fetch(base + "/patients/pat_001/medications", { headers })
    ).json();
    expect(meds.items[0].instructionText).toBe(
      "Synthetic source instruction.  Preserve exactly. ",
    );
  });
  it("produces the four expected discrepancies and clean control", async () => {
    const headers = await auth("dr.north");
    expect(
      (
        await (
          await fetch(base + "/patients/pat_001/discrepancies", { headers })
        ).json()
      ).items,
    ).toHaveLength(4);
    expect(
      (
        await (
          await fetch(base + "/patients/pat_003/discrepancies", { headers })
        ).json()
      ).items,
    ).toHaveLength(0);
  });
  it("never exposes clinical routes to administrators", async () => {
    const headers = await auth("admin.north");
    expect((await fetch(base + "/patients", { headers })).status).toBe(404);
    const result = await (
      await fetch(base + "/admin/users", { headers })
    ).json();
    expect(result.items[0].username).toBe("dr.north");
    expect(JSON.stringify(result)).not.toMatch(
      /instructionText|rawText|medicineName|extractedFields/,
    );
  });
  it("patient view hides unverified instructions", async () => {
    const headers = await auth("alex.example");
    const result = await (
      await fetch(base + "/patients/pat_001/medications/patient-view", {
        headers,
      })
    ).json();
    expect(result.items.length).toBeGreaterThan(0);
    for (const m of result.items) {
      expect(m.status).toBe("AWAITING_REVIEW");
      expect(m.instructionText).toBeNull();
    }
    expect(result.notice).toContain("contact your clinician or pharmacist");
  });
});
it("mock source replacement preserves history and starts unverified", async () => {
  const headers = await auth("dr.north");
  const p = await (await fetch(base + "/patients/pat_003", { headers })).json();
  const form = new FormData();
  form.set("patientId", p.id);
  form.set("visitId", "vis_003a");
  form.set("ifVersion", String(p.version));
  form.set("supersedesId", "med_003a_0");
  form.set("supersedesIfVersion", "1");
  form.set(
    "file",
    new File(
      [
        "SYN-RX-V1\nmedicineName: Example medicine 5 mg\nstrength: 5 MG\nform: TABLET\ninstructionText: Synthetic replacement.  Preserve exactly. \nstartDate: 2026-01-01\nendDate: null\nprescriberName: Synthetic Clinician\n",
      ],
      "synthetic.txt",
      { type: "text/plain" },
    ),
  );
  const response = await fetch(base + "/documents", {
    method: "POST",
    headers,
    body: form,
  });
  const result = await response.json();
  expect(response.status).toBe(202);
  expect(result.status).toBe("COMPLETED");
  const entries = await (
    await fetch(base + "/patients/pat_003/medications", { headers })
  ).json();
  expect(entries.items).toHaveLength(2);
  expect(entries.items[0].supersedesId).toBeNull();
  expect(entries.items[1].supersedesId).toBe("med_003a_0");
  expect(entries.items[1].verificationStatus).toBe("UNVERIFIED");
});
