import { expect, test } from "@playwright/test";

test("phone catalog preview supports results, faces, filters, and details without overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-specific catalog smoke.");
  await page.route("https://cards.scryfall.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
    });
  });

  await page.goto("/app/catalog");

  await expect(page.getByLabel("Search the catalog")).toBeVisible();
  await expect(page.getByText("Browse exact printings")).toHaveCount(0);
  const viewToggle = page.getByRole("group", { name: "Catalog result view" });
  await expect(viewToggle.getByRole("link")).toHaveText(["Grid", "Table"]);
  await expect(viewToggle.getByRole("link", { name: "Grid" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Catalog freshness")).toHaveCount(0);
  await expect(page.getByText(/Oracle mode:/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /View Delver of Secrets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Lightning Bolt" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  const providerImage = page.getByRole("img", { name: /Delver of Secrets, face 1/ });
  await expect(providerImage).toHaveAttribute("src", /^https:\/\/cards\.scryfall\.io\//);
  await expect(providerImage).not.toHaveAttribute("src", /_next\/image/);

  await page.getByRole("button", { name: /^Filter(?: \(\d+\))?$/ }).click();
  let drawer = page.getByRole("dialog", { name: "Filters" });
  const variants = drawer.getByRole("checkbox", { name: "Return all variants" });
  await expect(variants).not.toBeChecked();
  await expect(variants).toHaveAttribute("aria-describedby");
  await variants.check();
  await drawer.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/variants=all/);
  await expect(page.getByRole("heading", { name: "3 results" })).toBeVisible();

  await page.getByRole("link", { name: /View Delver of Secrets/ }).click();
  await expect(
    page.getByRole("heading", { name: "Delver of Secrets // Insectile Aberration" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show next face" }).click();
  await expect(page.getByRole("img", { name: /Insectile Aberration, face 2/ })).toBeVisible();
  await page.getByRole("link", { name: "Back to catalog" }).click();

  await page.getByRole("button", { name: /^Filter(?: \(\d+\))?$/ }).click();
  drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByLabel("Language code").fill("all");
  await drawer.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/lang=all/);
  await expect(page.getByRole("link", { name: /View Black Lotus/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Lightning Bolt" })).toBeVisible();

  await page.getByRole("button", { name: /^Filter(?: \(\d+\))?$/ }).click();
  drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByLabel("Language code").fill("ja");
  await drawer.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/lang=ja/);
  await expect(page.getByRole("link", { name: "View Lightning Bolt" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View Black Lotus/ })).toHaveCount(0);
  await page.getByRole("link", { name: "View Lightning Bolt" }).click();
  await expect(page.getByRole("heading", { name: "Lightning Bolt" })).toBeVisible();
  await expect(page.getByText(/Scryfall estimate/)).toBeVisible();
  await expect(page.getByText(/ingested/).first()).toBeVisible();

  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsViewport).toBe(false);
});
