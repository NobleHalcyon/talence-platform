import { expect, test, type Page } from "@playwright/test";

import { PREVIEW_DECK_ID } from "../features/decks/preview-constants";

async function stubCardImages(page: Page) {
  await page.route("https://cards.scryfall.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          label: element.getAttribute("aria-label"),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
        };
      })
      .filter((item) => item.width > 0 && (item.right > viewportWidth + 1 || item.left < -1))
      .slice(0, 12);
    return { documentWidth, viewportWidth, offenders };
  });
  expect(
    layout.documentWidth,
    `Horizontal overflow: ${JSON.stringify(layout.offenders)}`,
  ).toBeLessThanOrEqual(layout.viewportWidth);
}

test("private deck list, lifecycle, editor controls, and analysis remain responsive", async ({
  page,
}) => {
  await stubCardImages(page);
  await page.goto("/app/decks");

  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
  await expect(page.getByText("Deterministic preview data")).toBeVisible();
  await expect(page.getByRole("link", { name: "Arcane Allocation Lab" })).toBeVisible();
  await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("dialog", { name: "Archive Arcane Allocation Lab?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("navigation", { name: "Deck status" })
    .getByRole("link", { name: "Archived" })
    .click();
  await expect(page.getByRole("link", { name: "Archived Control Shell" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeEnabled();

  await page.goto(`/app/decks/${PREVIEW_DECK_ID}`);
  await expect(page.getByRole("heading", { name: "Arcane Allocation Lab" })).toBeVisible();
  await expect(page.getByLabel("Deck count and validation summary")).toContainText("4 missing");
  await expect(page.getByText("Archived collection source is still counted")).toHaveCount(0);

  const compactTabs = page.getByRole("navigation", { name: "Deck builder surfaces" });
  if (await compactTabs.isVisible()) {
    await compactTabs.getByRole("link", { name: "Analysis" }).click();
  }
  await expect(page.getByText("Legality data is incomplete")).toBeVisible();
  await expect(page.getByText("Advisory, not exhaustive")).toBeVisible();
  await expect(page.getByText("Unpriced entries")).toBeVisible();
  if (await compactTabs.isVisible()) {
    await compactTabs.getByRole("link", { name: "Deck" }).click();
  }

  const lightningEntry = page
    .getByRole("region", { name: "Mainboard" })
    .getByRole("heading", { name: "Lightning Bolt", exact: true })
    .locator("xpath=ancestor::li");
  await lightningEntry.getByText("Edit quantity, zone, printing, or note").click();
  const quantity = lightningEntry.getByRole("group", { name: "Lightning Bolt quantity" });
  await quantity.getByRole("button", { name: "Increase lightning bolt quantity" }).click();
  await expect(quantity.getByRole("textbox")).toHaveValue("5");
  await lightningEntry.getByLabel("Zone").selectOption("sideboard");
  await lightningEntry.getByRole("button", { name: "Save entry changes" }).click();
  await expect(page).toHaveURL(/status=entry_updated/);
  await expect(page.getByRole("status").filter({ hasText: "Deck entry updated" })).toBeVisible();

  const pickerEntry = page
    .getByRole("region", { name: "Mainboard" })
    .getByRole("heading", { name: "Lightning Bolt", exact: true })
    .locator("xpath=ancestor::li");
  await pickerEntry.getByRole("link", { name: "Browse preferred printings" }).click();
  await expect(page.getByRole("heading", { name: "Choose for Lightning Bolt" })).toBeVisible();
  await expect(page.getByText("2 exact copies owned")).toBeVisible();
  await expect(page.getByRole("button", { name: /Prefer STA nonfoil/ })).toBeEnabled();

  if (await compactTabs.isVisible()) {
    await compactTabs.getByRole("link", { name: "Catalog" }).click();
    await expect(page.getByRole("heading", { name: "Find oracle cards" })).toBeVisible();
    await compactTabs.getByRole("link", { name: "Analysis" }).click();
    await expect(page.getByRole("heading", { name: "Ownership and validation" })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});

test("bounded text import visibly reviews unresolved and exact oracle names before replacement", async ({
  page,
}) => {
  await page.goto(`/app/decks/${PREVIEW_DECK_ID}/import`);

  await expect(
    page.getByRole("heading", { name: "Import into Arcane Allocation Lab" }),
  ).toBeVisible();
  await expect(page.getByText(/maximum 256 KiB/)).toBeVisible();
  const text = page.getByRole("textbox", { name: "Deck text" });
  await text.fill("[mainboard]\n1 Black Lotu\n");
  await page.getByRole("button", { name: "Parse and resolve oracle cards" }).click();
  await expect(page.getByRole("heading", { name: "Resolved decklist" })).toBeVisible();
  await expect(page.getByText("Unresolved review blocks replacement")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review atomic replacement" })).toHaveCount(0);
  await expect(
    page.getByText(/Raw source text was parsed in this request and was not persisted/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await text.fill(
    "[commander]\n1 Delver of Secrets // Insectile Aberration\n[mainboard]\n1 Black Lotus\n4 Lightning Bolt\n",
  );
  await page.getByRole("button", { name: "Parse and resolve oracle cards" }).click();
  await expect(page.getByText("Ready to confirm")).toBeVisible();
  await expect(
    page.getByLabel("Deck import resolution counts").getByText("3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review atomic replacement" }).click();
  await expect(page.getByRole("dialog", { name: "Replace every deck entry?" })).toBeVisible();
  await expect(page.getByText(/all entry notes, preferred-printing choices/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expectNoHorizontalOverflow(page);
});

test("private text and stable JSON deck exports are no-store", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The HTTP contract is viewport-independent.");

  const text = await request.get(`/app/decks/${PREVIEW_DECK_ID}/export`);
  expect(text.status()).toBe(200);
  expect(text.headers()["content-type"]).toContain("text/plain; charset=utf-8");
  expect(text.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  expect(text.headers()["content-disposition"]).toContain(`talence-deck-${PREVIEW_DECK_ID}.txt`);
  expect(await text.text()).toContain("[commander]");

  const json = await request.get(`/app/decks/${PREVIEW_DECK_ID}/export?format=json`);
  expect(json.status()).toBe(200);
  expect(json.headers()["content-type"]).toContain("application/json; charset=utf-8");
  expect(json.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  const payload = await json.json();
  expect(payload).toMatchObject({
    schema_version: 1,
    deck: {
      deck_id: PREVIEW_DECK_ID,
      format_code: "commander",
    },
  });
  expect(payload.entries[0]).toEqual(
    expect.objectContaining({
      card_id: expect.any(String),
      zone: "commander",
      quantity: 1,
    }),
  );
});
