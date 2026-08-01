import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

import { PRIVATE_BETA_FIXTURE_USERS } from "../../../scripts/seed-private-beta-fixture.mjs";
import { readLocalSupabaseStatus } from "../../../scripts/lib/local-supabase.mjs";

interface BrowserFixture {
  ownerA: {
    collectionId: string;
    email: string;
    password: string;
    workspaceId: string;
  };
  ownerB: {
    collectionId: string;
    workspaceId: string;
  };
  printingId: string;
  scryfallId: string;
}

const localSupabase = readLocalSupabaseStatus();
let fixture: BrowserFixture;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function expectNoSeriousAccessibilityViolations(page: Page, surface: string) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = scan.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
  expect(violations, `${surface} has serious or critical accessibility violations`).toEqual([]);
}

async function loadBrowserFixture(): Promise<BrowserFixture> {
  const database = new pg.Client({ connectionString: localSupabase.databaseUrl });
  await database.connect();
  try {
    const profiles = await database.query<{
      collection_id: string;
      email: string;
      workspace_id: string;
    }>(
      `
        select
          auth_user.email,
          profile.default_collection_id::text as collection_id,
          profile.default_workspace_id::text as workspace_id
        from auth.users as auth_user
        join public.profiles as profile
          on profile.user_id = auth_user.id
        where lower(auth_user.email) = any($1::text[])
      `,
      [PRIVATE_BETA_FIXTURE_USERS.map((user) => user.email.toLowerCase())],
    );
    const profileByEmail = new Map(
      profiles.rows.map((profile) => [profile.email.toLowerCase(), profile]),
    );
    const configuredOwnerA = PRIVATE_BETA_FIXTURE_USERS[0]!;
    const configuredOwnerB = PRIVATE_BETA_FIXTURE_USERS[1]!;
    const ownerA = profileByEmail.get(configuredOwnerA.email);
    const ownerB = profileByEmail.get(configuredOwnerB.email);
    invariant(ownerA && ownerB, "phase6_browser_fixture_users_missing");

    const printing = await database.query<{ printing_id: string; source_id: string }>(
      `
        select
          printing.id::text as printing_id,
          printing.source_id
        from public.catalog_printings as printing
        join public.catalog_cards as card
          on card.id = printing.card_id
        where printing.active
          and card.name = 'Lightning Bolt'
          and printing.language = 'en'
          and 'nonfoil'::public.card_finish = any(printing.finishes)
        order by printing.collector_number, printing.id
        limit 1
      `,
    );
    invariant(printing.rowCount === 1, "phase6_browser_catalog_fixture_missing");
    return {
      ownerA: {
        collectionId: ownerA.collection_id,
        email: configuredOwnerA.email,
        password: configuredOwnerA.password,
        workspaceId: ownerA.workspace_id,
      },
      ownerB: {
        collectionId: ownerB.collection_id,
        workspaceId: ownerB.workspace_id,
      },
      printingId: printing.rows[0]!.printing_id,
      scryfallId: printing.rows[0]!.source_id,
    };
  } finally {
    await database.end();
  }
}

test.beforeAll(async () => {
  fixture = await loadBrowserFixture();
});

test("real private-beta critical journey remains secure, accessible, and workspace isolated", async ({
  page,
}) => {
  await page.route("https://cards.scryfall.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
    });
  });

  const loginResponse = await page.goto("/login");
  invariant(loginResponse, "phase6_login_response_missing");
  const headers = loginResponse.headers();
  expect(headers["content-security-policy"]).toContain("https://cards.scryfall.io");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9]+'/);
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-request-id"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  const identifier = page.getByLabel("Username or email");
  const password = page.getByLabel("Password");
  await identifier.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await expectNoSeriousAccessibilityViolations(page, "login");

  await identifier.fill(fixture.ownerA.email);
  await password.fill(fixture.ownerA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/catalog?q=Lightning%20Bolt&view=table");
  await expect(page.getByRole("heading", { name: "Browse exact printings" })).toBeVisible();
  const resultRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "Lightning Bolt", exact: true }).first() })
    .first();
  await expect(resultRow).toContainText("Magic 2010");
  const addButton = resultRow.getByRole("button", { name: "Add to collection" });
  await addButton.click();
  const addDialog = page.getByRole("dialog", { name: "Add Lightning Bolt" });
  await expect(addDialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(addDialog).toHaveCount(0);
  await expect(addButton).toBeFocused();
  await addButton.click();
  await addDialog.getByRole("button", { name: "Commit additive transaction" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/collections/${fixture.ownerA.collectionId}.*status=inventory_added`),
  );
  await expect(page.getByRole("status").filter({ hasText: "Inventory added" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lightning Bolt quantity" })).toHaveValue("1");
  await expectNoSeriousAccessibilityViolations(page, "collection inventory");

  await page.goto(`/app/collections/${fixture.ownerA.collectionId}/import`);
  const csv = [
    "scryfall_id,set_code,collector_number,language,name,finish,condition,quantity",
    `${fixture.scryfallId},,,,Lightning Bolt,nonfoil,near_mint,2`,
  ].join("\n");
  await page.getByLabel("Inventory CSV").setInputFiles({
    name: "phase6-private-beta.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: "Parse and stage preview" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preview ready" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staged preview" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Matched" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "inventory import preview");
  await page.getByRole("button", { name: "Confirm one transaction" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/collections/${fixture.ownerA.collectionId}.*status=import_committed`),
  );

  await page.goto("/app/decks");
  await page.getByText("Create deck", { exact: true }).click();
  await page.getByLabel("Deck name").fill("Phase 6 Critical Journey");
  await page.getByLabel("Description").fill("Created by the real private-beta browser journey.");
  await page.getByRole("button", { name: "Create private deck" }).click();
  await expect(page).toHaveURL(/\/app\/decks\/[0-9a-f-]+/);
  await expect(
    page.getByRole("heading", { name: "Phase 6 Critical Journey", level: 1 }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "deck builder");

  await page.goto("/app/devices");
  await page.getByLabel("Device name").fill("Phase 6 Browser Sorter");
  await page.getByLabel("Device type").selectOption("talence_sorter");
  await page.getByLabel("Manufacturer (optional)").fill("Talence");
  await page.getByLabel("Model (optional)").fill("Critical Journey");
  await page.getByLabel("Serial number (optional)").fill(`PHASE6-${randomUUID()}`);
  await page.getByRole("button", { name: "Register device and issue credential" }).click();
  const rawCredential = page.getByLabel("Raw device credential");
  await expect(rawCredential).toHaveText(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await page.getByLabel("I stored this credential in the device's secret storage.").check();
  await page.getByRole("button", { name: "I have stored it" }).click();
  await expect(rawCredential).toHaveCount(0);
  await page.getByRole("link", { name: "Open Phase 6 Browser Sorter" }).click();
  await page.getByLabel("Inventory read").check();
  await page.getByLabel("Inventory write").check();
  await page.getByLabel("Run summaries").check();
  await page.getByRole("button", { name: "Save explicit grants" }).click();
  await expect(page.getByText("Collection grants updated")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /start motion|move robot|remote start/i }),
  ).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page, "device grants");

  await page.goto(`/app/collections/${fixture.ownerB.collectionId}`);
  await expect(page.getByRole("heading", { name: "Permission denied" })).toBeVisible();
  await expect(page.getByText(/Your current workspace access does not allow/)).toBeVisible();
  expect(fixture.ownerA.workspaceId).not.toBe(fixture.ownerB.workspaceId);

  await page.goto("/app/admin/operations");
  await expect(page.getByRole("heading", { name: "Security and usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "External services" })).toBeVisible();
  await page.getByRole("button", { name: "Disable Collection Analytics" }).click();
  await expect(page.getByText("Operational control updated")).toBeVisible();
  await page.getByRole("button", { name: "Enable Collection Analytics" }).click();
  await expect(page.getByText("Operational control updated")).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent safe audit events" })).toContainText(
    "operational.control.toggled",
  );
  await expectNoSeriousAccessibilityViolations(page, "operations controls");
});
