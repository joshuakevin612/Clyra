// Read-only signed-in browser checks. Credentials stay in memory; no traces or raw errors.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
const credentials = parseEnv(
  fs.readFileSync("../backend/.env.development-logins", "utf8"),
);
const cache = path.join(os.homedir(), "AppData/Local/ms-playwright");
const cached =
  process.platform === "win32" && fs.existsSync(cache)
    ? fs
        .readdirSync(cache)
        .filter((n) => /^chromium-/.test(n))
        .sort()
        .at(-1)
    : undefined;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (cached ? path.join(cache, cached, "chrome-win64/chrome.exe") : undefined);
let browser;
let activePage;
let stage = "launch";
try {
  browser = await chromium.launch({ executablePath });
  console.log("Browser launched.");
  for (const [username, password, heading] of [
    ["dr.north", credentials.FIXTURE_PASSWORD, "Patients"],
    ["admin.north", credentials.FIXTURE_PASSWORD, "Clinicians"],
    ["alex.example", credentials.FIXTURE_PASSWORD, "My medicines"],
    [
      credentials.SUPER_ADMIN_USERNAME,
      credentials.SUPER_ADMIN_PASSWORD,
      "Organisations",
    ],
  ]) {
    if (!username || !password) continue;
    stage = "sign-in and read check for " + username;
    if (process.argv[2] && username !== process.argv[2]) continue;
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    activePage = page;
    stage = username + ": loading frontend";
    await page.goto("http://127.0.0.1:5177");
    console.log("Frontend loaded.");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    console.log("Credentials entered in browser.");
    stage = username + ": sending login";
    await page.locator("form").evaluate((form) => form.requestSubmit());
    stage = username + ": waiting for workspace";
    console.log("Login submitted.");
    await page
      .getByRole("heading", {
        name: new RegExp(`^(${heading}|Choose a new password)$`),
      })
      .first()
      .waitFor({ timeout: 45000 });
    if (
      await page
        .getByRole("heading", { name: "Choose a new password", exact: true })
        .count()
    ) {
      console.log(
        username +
          ": authentication verified; required password change preserved.",
      );
      stage = username + ": signing out";
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .evaluate((button) => button.click());
    } else {
      if (username === "dr.north") {
        stage = username + ": opening patient record";
        await page
          .getByRole("row")
          .filter({ hasText: "Alex Example" })
          .getByRole("button", { name: "Open" })
          .click();
        stage = username + ": loading medication entries";
        await page.locator(".medicine").first().waitFor();
        stage = username + ": loading login metadata";
        await page
          .getByRole("button", { name: "Patient login", exact: true })
          .click();
        await page
          .getByRole("button", { name: /^(Disable|Enable) login$/ })
          .waitFor();
      }
      if (username === "admin.north")
        await page
          .getByRole("cell", { name: "dr.north", exact: true })
          .waitFor();
      if (username === "alex.example") {
        stage = username + ": loading medication entries";
        await page.locator(".medicine").first().waitFor();
        await page
          .getByText(
            "If anything here differs from what you were told, contact your clinician or pharmacist before changing how you take any medicine.",
            { exact: true },
          )
          .waitFor();
      }
      const alerts = await page.getByRole("alert").allTextContents();
      if (alerts.length) throw Error("Read flow returned an error.");
      console.log(
        username + ": Neon-backed workspace and authorised read verified.",
      );
      stage = username + ": signing out";
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .evaluate((button) => button.click());
    }
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    await context.close();
  }
  console.log(
    "Signed-in Neon browser verification completed. No passwords changed or clinical records written.",
  );
} catch (error) {
  console.error("Browser assertion failed:", error?.name ?? "Error");
  if (activePage) {
    await activePage
      .screenshot({ path: "../output/neon-read-check.png", fullPage: true })
      .catch(() => {});
    console.log("Failure screen saved locally; no raw error details printed.");
  }
  console.error(
    "Neon browser verification failed during " +
      stage +
      ". Raw error and browser traces withheld to protect credentials.",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
