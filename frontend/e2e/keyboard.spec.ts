import { test, expect } from "@playwright/test";

test("on-screen keyboard types into focused fields and signs in without a physical keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "On-screen keyboard" }).click();
  const keys = page.getByRole("group", { name: "On-screen keyboard" });
  await expect(keys).toBeVisible();
  await page.getByLabel("Username", { exact: true }).click();
  const press = async (s: string) => {
    for (const ch of s) await keys.getByRole("button", { name: ch, exact: true }).click();
  };
  await keys.getByRole("button", { name: "Shift" }).click();
  await press("D");
  await press("r.north");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("Dr.north");
  await keys.getByRole("button", { name: "Backspace" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("Dr.nort");
  await press("h");
  await page.getByLabel("Username", { exact: true }).fill("dr.north");
  await page.getByLabel("Password", { exact: true }).click();
  await keys.getByRole("button", { name: "Caps lock" }).click();
  await press("C");
  await keys.getByRole("button", { name: "Caps lock" }).click();
  await press("lyra-demo-");
  await press("2026");
  await keys.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "Patients", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(keys).toBeHidden();
});
