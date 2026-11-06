import { test, expect } from "@playwright/test";
import path from "node:path";

// Runs against the isolated in-memory backend (scripts.integration_app on :8000).
const base = "http://127.0.0.1:5177";
const file = path.resolve("../fixtures/documents/doc_001b.txt");

test("EI-1.0 stage, review, confirm with keyboard-reachable controls", async ({
  page,
}) => {
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Example" })
    .getByRole("button", { name: "Open" })
    .click();
  await page.getByRole("button", { name: "External imports" }).click();
  await expect(
    page.getByRole("heading", { name: "External evidence imports" }),
  ).toBeVisible();

  // Client-side validation focuses the first problem.
  await page.getByRole("button", { name: "Stage evidence" }).click();
  await expect(page.getByRole("alert")).toBeFocused();

  await page.getByLabel("Source label").fill("Synthetic external pharmacy");
  await page.getByLabel("Visit date").fill("2026-11-06");
  await page.getByLabel(/Evidence file/).setInputFiles(file);
  await page.getByRole("button", { name: "Stage evidence" }).click();

  const review = page.getByRole("article", { name: "Evidence review" });
  await expect(review).toContainText("PENDING ASSOCIATION");
  await expect(review.locator("mark")).toBeVisible();
  await expect(review.getByText("not verified")).toBeVisible();

  // Navigation away to home and back keeps the session.
  const confirm = review.getByRole("button", { name: "Confirm association" });
  await expect(confirm).toBeDisabled();
  await review.getByLabel(/I confirm this external evidence/).check();
  await expect(review.getByText("Alex Example").first()).toBeVisible();
  await confirm.click();
  await expect(review).toContainText("CONFIRMED");
  await expect(
    review.getByRole("button", { name: "Compare visits" }),
  ).toBeVisible();

  // Session survives going home and back/forward.
  await page.getByRole("link", { name: "Clyra home" }).click();
  await expect(page.getByRole("heading", { name: "Patients", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Alex Example/ })).toBeVisible();
});

test("EI-1.0 tab reflows at 320px with reduced motion and no page-level scroll", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).fill("Clyra-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Alex Example" }).getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: "External imports" }).click();
  await page.getByLabel("Source label").fill("Reflow check");
  await page.getByLabel("Visit date").fill("2026-11-07");
  await page.getByLabel(/Evidence file/).setInputFiles(path.resolve("../fixtures/documents/doc_001c.txt"));
  await page.getByRole("button", { name: "Stage evidence" }).click();
  await expect(page.getByRole("article", { name: "Evidence review" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const anim = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length);
  expect(anim).toBe(0);
  await ctx.close();
});
