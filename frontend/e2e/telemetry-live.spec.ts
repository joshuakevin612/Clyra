import { test, expect } from "@playwright/test";

test("live telemetry: healthy feed, every fault, recovery, persistence and unchanged clinical records", async ({ page }) => {
  test.setTimeout(180000);
  const api = "http://127.0.0.1:8000/api/v1";
  const marker = await page.request.get("http://127.0.0.1:8000/openapi.json");
  expect(marker.headers()["x-clyra-database-mode"]).toBe("ephemeral");
  const liveBase = process.env.CLYRA_LIVE_BASE ?? "http://127.0.0.1:5177";
  const proxyMode = await page.request.get(`${liveBase}/api/v1/auth/me`);
  expect(proxyMode.headers()["x-clyra-database-mode"]).toBe("ephemeral");
  await page.goto(liveBase);
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  const login = page.waitForResponse(r => r.url().endsWith("/auth/login"));
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
  const headers = { Authorization: `Bearer ${(await (await login).json()).accessToken}` };
  const read = async (path: string) => {
    const response = await page.request.get(api + path, { headers });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const before = await read("/patients/pat_003");
  const previousSession = (await read("/patients/pat_003/telemetry/snapshot")).session;
  if (previousSession?.status === "ACTIVE") {
    const stopped = await page.request.post(`${api}/patients/pat_003/telemetry/sessions/${previousSession.id}/stop`, { headers, data: { ifVersion: previousSession.version } });
    expect(stopped.status()).toBe(200);
  }
  const medications = await read("/patients/pat_003/medications");
  const visits = await read("/patients/pat_003/visits");
  await page.getByRole("row").filter({ hasText: "Jordan Test" }).getByRole("button", { name: "Open", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Observations", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Observations", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Start synthetic feed", exact: true }).press("Enter");
  const snapshot = () => read("/patients/pat_003/telemetry/snapshot");
  await expect.poll(async () => (await snapshot()).observations.length, { timeout: 12000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(20000);
  const healthy = await snapshot();
  expect(healthy.observations.length).toBeGreaterThanOrEqual(20);
  expect(healthy.findings).toEqual([]);
  const sessionId = healthy.session.id;
  // Count newly produced findings so historical flags cannot satisfy a later fault check.
  for (const [mode, code] of [["Spike", "SPIKE"], ["Repeated", "REPEATED"], ["Fluctuation", "FLUCTUATION"], ["Delayed", "DELAYED"], ["Missing", "MISSING"], ["Conflict", "CONFLICT"]]) {
    const count = (s: any) => s.findings.filter((f: any) => f.code === code).length;
    const previous = count(await snapshot());
    await page.getByRole("button", { name: mode, exact: true }).press("Enter");
    await expect.poll(async () => count(await snapshot()), { timeout: 18000, message: `${mode} produces a new ${code} finding` }).toBeGreaterThan(previous);
    await expect(page.locator("#findings-heading").locator("..")).toContainText(code, { timeout: 5000 });
    await page.getByRole("button", { name: "Normal", exact: true }).press("Enter");
    // Let Normal send a fresh pair before the next fault; a stale-source finding
    // already produced by Delayed must clear before Missing can produce a new one.
    await expect.poll(async () => (await snapshot()).sources.every((s: any) => s.status !== "STALE"), { timeout: 10000 }).toBe(true);
    await page.waitForTimeout(2200);
  }
  const evidence = page.getByRole("link", { name: /^Review observation/ }).first();
  const target = await evidence.getAttribute("href");
  await evidence.press("Enter");
  await expect(page.locator(target!)).toBeFocused();
  await page.waitForTimeout(2200);
  await expect(page.locator(target!)).toBeFocused();
  await page.getByRole("button", { name: "Both offline", exact: true }).press("Enter");
  await expect.poll(async () => (await snapshot()).sources.every((s: any) => s.status === "STALE"), { timeout: 12000 }).toBe(true);
  await page.getByRole("button", { name: "Normal", exact: true }).press("Enter");
  await expect.poll(async () => (await snapshot()).sources.every((s: any) => s.status !== "STALE"), { timeout: 10000 }).toBe(true);
  const liveCount = (await snapshot()).observations.length;
  await page.getByRole("button", { name: "Pause display updates", exact: true }).press("Enter");
  const frozenRows = await page.locator(".telemetry tbody tr").count();
  await expect.poll(async () => (await snapshot()).observations.length).toBeGreaterThan(liveCount);
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(frozenRows);
  await page.getByRole("button", { name: "Resume display updates", exact: true }).press("Enter");
  await expect.poll(() => page.locator(".telemetry tbody tr").count()).toBeGreaterThan(frozenRows);
  await page.getByRole("button", { name: "Stop", exact: true }).press("Enter");
  await expect(page.getByText("Values below are historical.", { exact: false })).toBeVisible();
  const stopped = await snapshot();
  expect(stopped.session).toMatchObject({ id: sessionId, status: "STOPPED", version: 2 });
  expect(stopped.sources.every((s: any) => s.status === "ENDED")).toBe(true);
  const codes = new Set(stopped.findings.map((f: any) => f.code));
  for (const code of ["SPIKE", "REPEATED", "FLUCTUATION", "DELAYED", "CONFLICT"]) expect(codes.has(code)).toBe(true);
  await page.screenshot({ path: "test-results/telemetry-live.png", fullPage: true });
  await page.reload();
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
  await page.getByRole("row").filter({ hasText: "Jordan Test" }).getByRole("button", { name: "Open", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Observations", exact: true }).press("Enter");
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(stopped.observations.length);
  expect((await snapshot()).session.id).toBe(sessionId);
  expect(await read("/patients/pat_003")).toEqual(before);
  expect(await read("/patients/pat_003/medications")).toEqual(medications);
  expect(await read("/patients/pat_003/visits")).toEqual(visits);
});
