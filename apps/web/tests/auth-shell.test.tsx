import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoginPage from "@/app/(public)/login/page";

describe("login shell", () => {
  it("uses labeled managed-auth fields and offers recovery", async () => {
    render(await LoginPage({}));

    expect(screen.getByLabelText("Username or email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("uses the supplied gold emblem and private-beta identity", async () => {
    render(await LoginPage({}));

    expect(screen.getByRole("img", { name: "Talence emblem" })).toHaveAttribute(
      "src",
      expect.stringContaining("talence-emblem-gold.svg"),
    );
    expect(screen.getByRole("heading", { name: "Talence" })).toBeVisible();
    expect(screen.getByText("Private Beta Underway")).toBeVisible();
  });

  it("does not expose account-creation navigation", async () => {
    render(await LoginPage({}));

    expect(
      screen.queryByRole("link", { name: /create account|register/i }),
    ).not.toBeInTheDocument();
  });
});
