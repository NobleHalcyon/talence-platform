import { expect, test, type Page } from "@playwright/test";

import { PREVIEW_COLLECTION_ID } from "../features/collections/preview-constants";

const FIRST_TRANSACTION_ID = "00000000-0000-4000-8000-000000004001";
const PREVIEW_IMPORT_JOB_ID = "00000000-0000-4000-8000-000000008001";

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
          overflowX: getComputedStyle(element).overflowX,
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

test("collection list and structured, gallery, and analytical inventory stay editable and responsive", async ({
  page,
}) => {
  await stubCardImages(page);
  await page.goto("/app/collections");

  await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
  await expect(page.getByText("Deterministic preview data")).toBeVisible();
  await expect(
    page.getByText(
      "Private, workspace-scoped inventory containers with exact-printing balances and immutable transaction history.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Main Collection" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Trade Binder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Convention Box" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("navigation", { name: "Collection status" })
    .getByRole("link", { name: "Archived" })
    .click();
  await expect(page).toHaveURL(/status_filter=archived/);
  await expect(page.getByRole("link", { name: "Convention Box" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Main Collection" })).toHaveCount(0);

  await page.goto(`/app/collections/${PREVIEW_COLLECTION_ID}`);
  await expect(page.getByRole("heading", { name: "Main Collection" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Collection inventory" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Black Lotus quantity" })).toHaveValue("1");
  await expect(page.getByText("Unpriced quantity")).toBeVisible();

  const blackLotusQuantity = page.getByRole("group", {
    name: "Black Lotus quantity",
  });
  await blackLotusQuantity.getByRole("button", { name: "Increase black lotus quantity" }).click();
  await expect(page.getByRole("textbox", { name: "Black Lotus quantity" })).toHaveValue("2");
  await blackLotusQuantity
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page).toHaveURL(/status=inventory_added/);
  await expect(page.getByRole("status").filter({ hasText: "Inventory added" })).toBeVisible();

  await page.getByRole("button", { name: "Gallery" }).click();
  await expect(page).toHaveURL(/view=gallery/);
  await expect(page.getByLabel("Collection inventory gallery")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gallery" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Analytical" }).click();
  await expect(page).toHaveURL(/view=analytical/);
  await expect(page.getByRole("heading", { name: "Whole collection baseline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Filtered analysis" })).toBeVisible();
  await expect(page.getByText("Grouped estimate")).toBeVisible();
  await expect(page.getByRole("region", { name: "Sets" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Value tiers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analytical" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("link", { name: "Load more inventory" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto(
    `/app/collections/${PREVIEW_COLLECTION_ID}?view=analytical&q=Black%20Lotus&set=LEA&finish=nonfoil&condition=near_mint`,
  );
  await expect(page.getByRole("searchbox", { name: "Search inventory" })).toHaveValue(
    "Black Lotus",
  );
  await expect(page.getByRole("textbox", { name: "Set code" })).toHaveValue("LEA");
  await expect(page.getByLabel("Finish", { exact: true })).toHaveValue("nonfoil");
  await expect(page.getByLabel("Condition", { exact: true })).toHaveValue("near_mint");
  await expect(page.getByText("1/1 priced")).toBeVisible();
  const filteredSets = page.getByRole("region", { name: "Sets" });
  await expect(filteredSets.getByRole("row", { name: /Limited Edition Alpha/ })).toBeVisible();
  await expect(filteredSets.getByRole("row", { name: /Innistrad/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("immutable history, exact lines, and staged CSV review remain usable on compact and wide screens", async ({
  page,
}) => {
  await stubCardImages(page);
  await page.goto(`/app/collections/${PREVIEW_COLLECTION_ID}/history`);

  await expect(page.getByRole("heading", { name: "Main Collection history" })).toBeVisible();
  await expect(
    page.getByText(
      "Review actor, source, exact deltas, safe references, transfer pairs, and compensating reversal relationships.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Added an exact Alpha printing.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reverse transaction" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reverse transaction" }).first().click();
  await expect(page.getByRole("dialog", { name: "Create compensating reversal?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/app/collections/${PREVIEW_COLLECTION_ID}/history/${FIRST_TRANSACTION_ID}`);
  await expect(page.getByRole("heading", { name: "1 exact deltas" })).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: `Transaction ${FIRST_TRANSACTION_ID.slice(-8)} exact lines`,
    }),
  ).toContainText("Black Lotus");
  await expectNoHorizontalOverflow(page);

  await page.goto(`/app/collections/${PREVIEW_COLLECTION_ID}/import`);
  await expect(page.getByRole("heading", { name: "Import into Main Collection" })).toBeVisible();
  await expect(
    page.getByText(
      "Parse a bounded private CSV, review exact resolution, then commit included matches as one idempotent additive transaction.",
    ),
  ).toBeVisible();

  const csv = [
    "scryfall_id,set_code,collector_number,language,name,finish,condition,quantity",
    "00000000-0000-4000-8000-000000000101,,,,Black Lotus,nonfoil,near_mint,1",
    ",DUP,1,en,Ambiguous fixture,nonfoil,near_mint,1",
    "ffffffff-ffff-4fff-8fff-ffffffffffff,,,,Missing fixture,nonfoil,near_mint,1",
  ].join("\n");
  await page.getByLabel("Inventory CSV").setInputFiles({
    name: "responsive-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: "Parse and stage preview" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Preview ready" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staged preview" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Ambiguity blocks confirmation" }),
  ).toBeVisible();
  await expect(page.getByLabel("Resolve row 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm one transaction" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Download safe error report" })).toHaveAttribute(
    "href",
    /^data:text\/csv;charset=utf-8,/,
  );
  await expectNoHorizontalOverflow(page);
});

test("private collection CSV routes export safely and fail closed for an unpersisted preview job", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The HTTP contract is viewport-independent.");

  const exportResponse = await request.get(`/app/collections/${PREVIEW_COLLECTION_ID}/export`);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/csv; charset=utf-8");
  expect(exportResponse.headers()["content-disposition"]).toContain(
    `talence-collection-${PREVIEW_COLLECTION_ID}.csv`,
  );
  expect(exportResponse.headers()["cache-control"]).toBe("private, no-store");
  const exportedCsv = await exportResponse.text();
  expect(exportedCsv).toContain(
    "scryfall_id,oracle_id,name,set_code,collector_number,language,finish,condition,quantity",
  );
  expect(exportedCsv).toContain("Black Lotus");
  expect(exportedCsv).toContain("price_provider");
  expect(exportedCsv).not.toContain("undefined");

  const errorResponse = await request.get(
    `/app/collections/${PREVIEW_COLLECTION_ID}/import/${PREVIEW_IMPORT_JOB_ID}/errors`,
  );
  expect(errorResponse.status()).toBe(404);
  expect(errorResponse.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  expect(await errorResponse.text()).toBe("Not found");
});
