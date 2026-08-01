import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PRIVATE_BETA_FIXTURE_USERS } from "../../../scripts/seed-private-beta-fixture.mjs";

const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/catalog/assets/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: tinySvg });
  });
  await page.route("**/api/catalog/facets**", async (route) => {
    const field = new URL(route.request().url()).searchParams.get("field");
    const items =
      field === "set"
        ? [
            {
              value: "LEA",
              label: "Limited Edition Alpha",
              secondary: "LEA · 1993-08-05",
              symbolUri: "/api/catalog/assets/set/lea",
            },
            {
              value: "2XM",
              label: "Double Masters",
              secondary: "2XM · 2020-08-07",
              symbolUri: "/api/catalog/assets/set/2xm",
            },
          ]
        : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ field, items, nextCursor: null, hasMore: false }),
    });
  });
});

test("progressive catalog filtering remains usable and accessible", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/app/catalog");
  if (new URL(page.url()).pathname === "/login") {
    const fixture = PRIVATE_BETA_FIXTURE_USERS[0]!;
    await page.getByLabel("Username or email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app(?:\/|$)/);
    await page.goto("/app/catalog");
  }
  await expect(page.getByRole("button", { name: "Color identity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Card type" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rarity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mana value" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const setFacetResponse = page.waitForResponse((response) =>
    response.url().includes("/api/catalog/facets?field=set"),
  );
  const setTrigger = page.getByRole("button", { name: "Set", exact: true });
  await setTrigger.click();
  await expect(setTrigger).toHaveAttribute("aria-expanded", "true");
  expect(pageErrors).toEqual([]);
  const setList = page.getByRole("listbox");
  await expect(setList).toBeVisible();
  expect((await setFacetResponse).ok()).toBe(true);
  await expect(setList.getByRole("option", { name: /Limited Edition Alpha/ })).toBeVisible();
  await setList.getByRole("option", { name: /Limited Edition Alpha/ }).click();
  await expect(setList).toBeVisible();
  await setList.getByRole("option", { name: /Double Masters/ }).click();
  await expect(setList).toBeVisible();
  await expect(page).toHaveURL(/filters=/, { timeout: 15_000 });
  expect(consoleErrors).toEqual([]);
  await expect(page.getByLabel("Active filters")).toContainText("LEA/2XM");

  await page.keyboard.press("Escape");
  const advancedTrigger = page.getByRole("button", { name: "Advanced filters (1)" });
  await advancedTrigger.click();
  const panel = page.getByRole("dialog", { name: "Advanced filters" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (testInfo.project.name === "mobile-chromium") {
    expect(box!.width).toBeGreaterThanOrEqual(400);
    expect(box!.height).toBeGreaterThanOrEqual(800);
  } else {
    expect(box!.width).toBeGreaterThanOrEqual(520);
    expect(box!.width).toBeLessThanOrEqual(600);
  }
  await expect(panel.getByLabel("Sort")).toHaveCount(0);
  await expect(page.getByLabel("Sort")).toBeVisible();
  await panel.getByRole("button", { name: "Logic" }).click();
  await expect(panel.getByRole("checkbox", { name: "NOT group" })).toBeVisible();
  await panel.getByRole("button", { name: "Add group" }).click();
  await expect(panel.getByRole("checkbox", { name: "NOT group" })).toHaveCount(2);

  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(advancedTrigger).toBeFocused();
});
