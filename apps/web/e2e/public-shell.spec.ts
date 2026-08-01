import { expect, test } from "@playwright/test";

test("public landing is the branded private-beta sign-in surface and fits the viewport", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: "Talence emblem" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Talence" })).toBeVisible();
  await expect(page.getByText("Private Beta Underway")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: /create account|register/i })).toHaveCount(0);

  const viewportOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(viewportOverflow).toEqual({ horizontal: false, vertical: false });
});

test("login route shares the username-or-email form and recovery navigation", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Username or email")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

test("sign-in failure state keeps the complete form inside the viewport", async ({ page }) => {
  await page.goto(
    "/?status=sign_in_failed&request_id=11111111-1111-4111-8111-111111111111",
  );

  await expect(page.getByText("Sign-in failed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeInViewport();

  const viewportOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(viewportOverflow).toEqual({ horizontal: false, vertical: false });
});
