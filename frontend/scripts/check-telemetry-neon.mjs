// Read-only browser review of persisted synthetic telemetry; never record secrets.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseEnv } from "node:util";
import { chromium, expect } from "@playwright/test";
const credentials = parseEnv(fs.readFileSync("../backend/.env.development-logins", "utf8"));
const cache = path.join(os.homedir(), "AppData/Local/ms-playwright");
const cached = process.platform === "win32" && fs.existsSync(cache)
  ? fs.readdirSync(cache).filter(n => /^chromium-/.test(n)).sort().at(-1) : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (cached ? path.join(cache, cached, "chrome-win64/chrome.exe") : undefined);
let browser;
let stage = "launch";
try {
  browser = await chromium.launch({ executablePath });
  const cinematic = process.argv.includes("--cinematic");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: cinematic ? "no-preference" : "reduce" });
  stage = "loading frontend";
  await page.goto("http://127.0.0.1:5177");
  stage = "motion preference selection";
  await page.waitForFunction(() => document.documentElement.dataset.experience !== undefined);
  const choice = page.getByRole("dialog", { name: "Make yourself comfortable." });
  if (await choice.isVisible()) {
    await page.getByRole("radio", { name: cinematic ? /^Cinematic/ : /^Easy reading/ }).check();
    await page.getByRole("button", { name: "Continue to Clyra", exact: true }).click();
  }
  stage = "sign in";
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill(credentials.FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
  stage = "review persisted session";
  await page.getByRole("row").filter({ hasText: "Jordan Test" }).getByRole("button", { name: "Open", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Observations", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Observations", exact: true })).toBeFocused();
  await expect(page.getByText("Values below are historical.", { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".telemetry tbody tr").first()).toBeVisible();
  await expect(page.locator(".telemetry-sources")).toContainText("ENDED");
  await expect(page.locator(".telemetry-summary")).toContainText("Synthetic data.");
  await expect(page.locator(".telemetry-summary")).toContainText("Synthetic sensor A");
  await page.locator("#summary-heading").locator("..").screenshot({ path: "../output/telemetry-summary-desktop.png" });
  await page.screenshot({ path: "../output/telemetry-neon-desktop.png" });
  stage = "review at 320px";
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("button", { name: "Copy telemetry summary", exact: true }).focus();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#summary-heading").locator("..").screenshot({ path: "../output/telemetry-summary-mobile.png" });
  await page.screenshot({ path: "../output/telemetry-neon-mobile.png" });
  await page.getByRole("button", { name: "Sign out", exact: true }).press("Enter");
  console.log("Neon browser telemetry passed: authenticated keyboard review, persisted stopped observations, summary, 320px reflow and sign-out.");
} catch {
  console.error(`Neon telemetry browser check failed at ${stage}; details withheld.`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
