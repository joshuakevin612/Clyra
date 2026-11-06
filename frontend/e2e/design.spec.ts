import { test, expect } from "@playwright/test";

test("keyboard journey, optional motion, native scroll and responsive review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/design-signin-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
  await page.keyboard.type("dr.north");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Clyra-demo-2026");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Patients", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Example" })
    .getByRole("button", { name: "Open", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Medication timeline", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reading-progress")).toBeHidden();
  const reading = page.getByRole("switch", { name: /Easy reading mode/ });
  if ((await reading.getAttribute("aria-checked")) !== "true")
    await reading.press("Enter");
  await expect(reading).toHaveAttribute("aria-checked", "true");
  const heading = page.getByRole("heading", {
    name: "Alex Example",
    exact: true,
  });
  await heading.focus();
  const previous = await page.evaluate(() => scrollY);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(previous);
  await expect(heading).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(heading).toBeFocused();
  await expect(page.locator(".medicine").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({
    path: "test-results/design-clinical-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Observations", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("heading", { name: "Observations", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Medication timeline", exact: true })
      .press("Enter");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Observations", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".reading-progress")).toBeHidden();
  expect(
    await page
      .locator("button")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({
    path: "test-results/design-clinical-320.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("reduced-motion sign-in keeps content, workflow and actions available at 320px", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("list", { name: "The review workflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/design-signin-320.png",
    fullPage: true,
  });
});
