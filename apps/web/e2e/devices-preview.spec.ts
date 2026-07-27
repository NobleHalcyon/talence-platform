import { expect, test, type Page } from "@playwright/test";

import { PREVIEW_DEVICE_ID } from "../features/devices/preview-constants";

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

test("device list and one-time registration credential remain responsive", async ({ page }) => {
  await page.goto("/app/devices");

  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(page.getByText("Deterministic preview data")).toBeVisible();
  await expect(page.getByRole("link", { name: "Workshop Sorter" })).toBeVisible();
  await expect(page.getByText("mtg-20260727T120000Z-a1b2c3d4-s1")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Device status" })
    .getByRole("link", { name: "Suspended" })
    .click();
  await expect(page.getByRole("link", { name: "Intake Scanner" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Workshop Sorter" })).toHaveCount(0);

  await page.goto("/app/devices");
  await page.getByLabel("Device name").fill("Bench Scanner");
  await page.getByLabel("Device type").selectOption("scanner");
  await page.getByLabel("Serial number (optional)").fill("PREVIEW-SCAN-01");
  await page.getByRole("button", { name: "Register device and issue credential" }).click();
  const raw = page.getByLabel("Raw device credential");
  await expect(raw).toHaveText(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(/displayed once/)).toBeVisible();
  await page.getByLabel("I stored this credential in the device's secret storage.").check();
  await page.getByRole("button", { name: "I have stored it" }).click();
  await expect(raw).toHaveCount(0);
  await expect(page.getByText("Credential acknowledged")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Bench Scanner" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("device detail exposes grants and lifecycle controls but no motion controls", async ({
  page,
}) => {
  await page.goto(`/app/devices/${PREVIEW_DEVICE_ID}`);

  await expect(page.getByRole("heading", { name: "Workshop Sorter", level: 1 })).toBeVisible();
  await expect(page.getByText("abcdef123456", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Inventory read").first()).toBeChecked();
  await expect(page.getByLabel("Inventory write").first()).toBeChecked();
  await expect(page.getByLabel("Run summaries").first()).toBeChecked();
  await expect(
    page.getByText(/no remote start, movement command, or robot checkpoint/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /start motion|move robot|remote start/i }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("dialog", { name: "Suspend Workshop Sorter?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Rotate credential" }).click();
  const raw = page.getByLabel("Raw device credential");
  await expect(raw).toHaveText(/^tlc_dev_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await page.getByLabel("I stored this credential in the device's secret storage.").check();
  await page.getByRole("button", { name: "I have stored it" }).click();
  await expect(raw).toHaveCount(0);
  await expect(page.getByText("Rotated credential acknowledged")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
