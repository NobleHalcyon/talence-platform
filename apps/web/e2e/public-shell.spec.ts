import { expect, test } from "@playwright/test";

test("public landing explains private admission and fits the viewport", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Know every card. Trust every change.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Access requires an administrator-issued invitation.")).toBeVisible();
  await expect(page.getByRole("link", { name: /create account|register/i })).toHaveCount(0);

  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsViewport).toBe(false);
});

test("login shell has labeled fields and recovery navigation", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
