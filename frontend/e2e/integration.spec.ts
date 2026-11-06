import { test, expect } from "@playwright/test";
import fs from "node:fs";
const password = "Clyra-demo-2026";
async function login(page, username, base = "http://127.0.0.1:5176") {
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("mock clinician sees fixture history and tenant-safe error", async ({
  page,
}) => {
  await login(page, "dr.north");
  await expect(
    page.getByRole("heading", { name: "Patients", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Example" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Medication timeline", exact: true }),
  ).toBeVisible();
  await expect(page.locator("pre").first()).toHaveText(
    "Synthetic source instruction.  Preserve exactly. ",
  );
  await page.screenshot({
    path: "../output/clinical-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Discrepancies", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(5);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Patients", exact: true }).click();
  await page.getByText("Open a patient by ID", { exact: true }).click();
  await page.getByLabel("Patient Id", { exact: true }).fill("pat_002");
  await page.getByRole("button", { name: "Open record", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Record not found or unavailable",
  );
});
test("patient notice, no unverified instructions, mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "alex.example");
  await expect(
    page.getByText(
      "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine.",
    ),
  ).toBeVisible();
  await expect(page.getByText("AWAITING_REVIEW").first()).toBeVisible();
  await expect(page.locator("pre")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../output/patient-mobile.png",
    fullPage: true,
  });
});
test("admin only sees account metadata", async ({ page }) => {
  await login(page, "admin.north");
  await expect(
    page.getByRole("heading", { name: "Clinicians", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("dr.north", { exact: true })).toBeVisible();
  await expect(page.locator("pre")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Patients", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../output/admin-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("row")
    .filter({ hasText: "dr.north" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(
    page.getByRole("button", { name: "Disable", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Disable", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("To", { exact: true }).fill("2026-11-05");
  const filtered = page.waitForResponse((r) =>
    r.url().includes("/admin/audit?"),
  );
  await page
    .getByRole("button", { name: "Filter activity", exact: true })
    .click();
  const response = await filtered;
  expect(new URL(response.url()).searchParams.get("to")).toBe(
    "2026-11-05T23:59:59.999999Z",
  );
});
test("live backend: patient account version and source workflow", async ({
  page,
}) => {
  const mode = await page.request.get("http://127.0.0.1:8000/openapi.json");
  test.skip(
    mode.headers()["x-clyra-database-mode"] !== "ephemeral",
    "The write workflow runs only against the isolated fixture API, never Neon.",
  );

  const liveBase = process.env.CLYRA_LIVE_BASE ?? "http://127.0.0.1:5177";
  const proxyMode = await page.request.get(`${liveBase}/api/v1/auth/me`);
  expect(proxyMode.headers()["x-clyra-database-mode"]).toBe("ephemeral");
  await login(page, "dr.north", liveBase);
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Example" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(page.locator("pre").first()).toHaveText(
    "Synthetic source instruction.  Preserve exactly. ",
  );
  await page
    .getByRole("button", { name: "Patient login", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Disable login", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disable login", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable login", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable login", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByLabel("Visit ID", { exact: true }).fill("vis_001a");
  await page.getByLabel("Source file", { exact: true }).setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: fs.readFileSync("../fixtures/documents/doc_001a.txt"),
  });
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("COMPLETED");
  await expect(
    page.getByRole("heading", { name: "Original text", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Highlight source quote" })
    .first()
    .click();
  await expect(page.locator("mark")).toHaveText(
    "Synthetic source instruction.  Preserve exactly. ",
  );
});
// Browser-level handover approval verifies the UI sends grant and migration versions.
test("mock patient approves handover then revokes source access", async ({
  page,
}) => {
  await login(page, "alex.example");
  await page.getByRole("button", { name: "Migrations", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "PENDING_PATIENT_APPROVAL" })
    .getByRole("button", { name: "Open" })
    .click();
  await page
    .getByRole("button", { name: "APPROVE VIEW ONLY", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "COMPLETED", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Access grants", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "org_north" })
    .getByRole("button", { name: "Open" })
    .click();
  await page.getByRole("button", { name: "NONE", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "org_north" }),
  ).toContainText("NONE");
});
test("mock platform password change revokes session and requires sign in", async ({
  page,
}) => {
  await login(page, "platform.demo");
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("Current Password", { exact: true }).fill(password);
  await page
    .getByLabel("New Password", { exact: true })
    .fill("New-clyra-demo-2026");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Clyra" }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("platform.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill("New-clyra-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organisations", exact: true }),
  ).toBeVisible();
});
