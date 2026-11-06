import { test, expect, type Page } from "@playwright/test";
async function open(page: Page, user = "dr.north") {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .press("Enter");
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Example" })
    .getByRole("button", { name: "Open", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Observations", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Observations", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("No telemetry session has been started.", { exact: true }),
  ).toBeVisible();
}
test("keyboard review, independent pause, evidence focus, clipboard fallback and stop", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Start synthetic feed", exact: true })
    .press("Enter");
  const rows = page.locator(".telemetry tbody tr");
  await expect(rows).toHaveCount(2, { timeout: 10000 });
  const pause = page.getByRole("button", {
    name: "Pause display updates",
    exact: true,
  });
  await pause.press("Enter");
  await expect(page.getByText(/Display paused at/)).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("button", { name: "Resume display updates", exact: true })
    .press("Enter");
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(6);
  await page
    .getByRole("button", { name: "Conflict", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("link", { name: /^Review observation/ }).first(),
  ).toBeVisible({ timeout: 10000 });
  const evidence = page
    .getByRole("link", { name: /^Review observation/ })
    .first();
  const target = await evidence.getAttribute("href");
  await evidence.press("Enter");
  await expect(page.locator(target!)).toBeFocused();
  await page.waitForTimeout(2200);
  await expect(page.locator(target!)).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page
    .getByRole("button", { name: "Copy telemetry summary", exact: true })
    .press("Enter");
  await expect(page.getByLabel("Selectable telemetry summary")).toBeVisible();
  await expect(page.getByLabel("Selectable telemetry summary")).toHaveValue(
    await page.locator(".telemetry-summary").innerText(),
  );
  await page.getByRole("button", { name: "Stop", exact: true }).press("Enter");
  await expect(
    page.getByText("Values below are historical.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/telemetry-desktop.png",
    fullPage: true,
  });
});
test("320px reflow, reduced motion, and returning never resumes a feed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page
    .getByRole("button", { name: "Start synthetic feed", exact: true })
    .press("Enter");
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(2, {
    timeout: 10000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/telemetry-mobile.png",
    fullPage: true,
  });
  // MSW data is intentionally memory-only; returning to the view preserves its active session.
  await page
    .getByRole("button", { name: "Medication timeline", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Observations", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Resume synthetic feed", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(7000);
  await expect(page.locator(".telemetry-sources")).toContainText("STALE");
  await page
    .getByRole("button", { name: "Resume synthetic feed", exact: true })
    .press("Enter");
  await expect
    .poll(() => page.locator(".telemetry-sources").innerText())
    .not.toContain("STALE");
});
test("connection loss retains timestamped history; revocation clears evidence even with display paused", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Start synthetic feed", exact: true })
    .press("Enter");
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(2, {
    timeout: 10000,
  });
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) =>
      String(input).includes("telemetry/snapshot")
        ? Promise.reject(new TypeError("offline"))
        : original(input, init);
    (
      window as unknown as { restoreTelemetryFetch: () => void }
    ).restoreTelemetryFetch = () => {
      window.fetch = original;
    };
  });
  await expect(
    page.getByText(/Connection unavailable; showing data captured at/),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Pause display updates", exact: true })
    .press("Enter");
  await page.evaluate(() => {
    (
      window as unknown as { restoreTelemetryFetch: () => void }
    ).restoreTelemetryFetch();
    const original = window.fetch;
    window.fetch = (input, init) =>
      String(input).includes("/readings")
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "FORBIDDEN",
                  message: "Access revoked",
                  details: [],
                },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            ),
          )
        : original(input, init);
  });
  await expect(page.getByRole("alert")).toContainText(
    "Telemetry is unavailable to your account",
    { timeout: 10000 },
  );
  await expect(page.locator(".telemetry tbody tr")).toHaveCount(0);
  await expect(page.locator(".telemetry-summary")).toHaveCount(0);
});
test("view-only clinician can review but has no synthetic controls", async ({
  page,
}) => {
  await open(page, "dr.riverside");
  await expect(
    page.getByRole("heading", { name: "Synthetic feed controls", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy telemetry summary", exact: true }),
  ).toBeVisible();
});
