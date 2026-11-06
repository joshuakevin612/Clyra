import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:5176", localStorage: [{name: "clyra-experience", value: "cinematic"}] }] } });
async function observations(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
  await page.getByRole("row").filter({ hasText: "Alex Example" }).getByRole("button", { name: "Open", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Observations", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Observations", exact: true })).toBeFocused();
  await expect(page.locator(".telemetry-summary")).toContainText("No telemetry session");
}

test("scroll accents reverse with native scroll; clinical content and focus stay still", async ({ page }) => {
  await observations(page);
  const heading = page.getByRole("heading", { name: "Observations", exact: true });
  const supported = await page.evaluate(() => CSS.supports("animation-timeline", "view()"));
  const scale = () => page.locator("#summary-heading").evaluate(el => {
    const transform = getComputedStyle(el, "::after").transform;
    return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
  });
  const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  if (supported) await expect.poll(scale).toBeGreaterThan(0.95);
  await page.evaluate(() => scrollTo(0, 0));
  if (supported) await expect.poll(scale).toBeLessThan(0.5);
  await expect(heading).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(initialHeight);
  expect(await page.locator(".telemetry-chart, .telemetry-summary, .telemetry table, .telemetry-sources").evaluateAll(els => els.every(el => getComputedStyle(el).transform === "none" && el.getAnimations().length === 0))).toBe(true);
  await page.screenshot({ path: "test-results/motion-desktop.png" });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole("button", { name: "Copy telemetry summary", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/motion-mobile.png" });
});

test("user can disable motion with keyboard and preference survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Easy reading mode off", exact: true }).press("Enter");
  await expect(page.getByRole("switch", { name: "Easy reading mode on", exact: true })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("OS reduced motion applies immediately and storage failure cannot block sign-in", async ({ page }) => {
  await page.addInitScript(() => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === "clyra-motion") throw new Error("Preference storage unavailable");
      return read.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === "clyra-motion") throw new Error("Preference storage unavailable");
      write.call(this, key, value);
    };
  });
  await observations(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByRole("switch", { name: "Easy reading mode on", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator(".reading-progress")).toBeHidden();
  await expect(page.getByRole("button", { name: "Start synthetic feed", exact: true })).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
});
