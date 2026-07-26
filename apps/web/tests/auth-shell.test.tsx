import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoginPage from "@/app/(public)/login/page";

describe("login shell", () => {
  it("uses labeled managed-auth fields and offers recovery", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("does not expose account-creation navigation", () => {
    render(<LoginPage />);

    expect(
      screen.queryByRole("link", { name: /create account|register/i }),
    ).not.toBeInTheDocument();
  });
});
