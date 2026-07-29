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

  await page.goto("/app/catalog?view=grid");

  await expect(page.getByRole("heading", { name: "Browse exact printings" })).toBeVisible();
  await expect(page.getByText("Deterministic preview data")).toBeVisible();
  await expect(page.getByRole("link", { name: /Delver of Secrets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lightning Bolt" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  const providerImage = page.getByRole("img", { name: /Delver of Secrets, face 1/ });
  await expect(providerImage).toHaveAttribute("src", /^https:\/\/cards\.scryfall\.io\//);
  await expect(providerImage).not.toHaveAttribute("src", /_next\/image/);

  await page.getByRole("link", { name: /Delver of Secrets/ }).click();
  await expect(
    page.getByRole("heading", { name: "Delver of Secrets // Insectile Aberration" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show next face" }).click();
  await expect(page.getByRole("img", { name: /Insectile Aberration, face 2/ })).toBeVisible();
  await page.getByRole("link", { name: "Back to catalog" }).click();

  await page.getByRole("button", { name: /^Filters/ }).click();
  let drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByLabel("Language code").fill("all");
  await drawer.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/lang=all/);
  await expect(page.getByRole("link", { name: /Black Lotus/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lightning Bolt" })).toBeVisible();

  await page.getByRole("button", { name: /^Filters/ }).click();
  drawer = page.getByRole("dialog", { name: "Filters" });
  await drawer.getByLabel("Language code").fill("ja");
  await drawer.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/lang=ja/);
  await expect(page.getByRole("link", { name: "Lightning Bolt" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Black Lotus/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Lightning Bolt" }).click();
  await expect(page.getByRole("heading", { name: "Lightning Bolt" })).toBeVisible();
  await expect(page.getByText(/Scryfall estimate/)).toBeVisible();
  await expect(page.getByText(/ingested/).first()).toBeVisible();

  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsViewport).toBe(false);
});
