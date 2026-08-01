import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LandingPage from "@/app/(public)/page";
import { getVerifiedAuthState } from "@/lib/auth/auth-state";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/auth-state", () => ({
  getVerifiedAuthState: vi.fn(),
}));

describe("unauthenticated landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVerifiedAuthState).mockResolvedValue({ status: "unauthenticated" });
  });

  it("is the private-beta sign-in surface and never offers registration", async () => {
    render(await LandingPage({}));

    expect(screen.getByRole("heading", { name: "Talence" })).toBeVisible();
    expect(screen.getByText("Private Beta Underway")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.getByLabelText("Username or email")).toBeRequired();
    expect(screen.queryByRole("link", { name: /register|sign up/i })).not.toBeInTheDocument();
  });

  it("sends an authenticated visitor directly to the dashboard", async () => {
    vi.mocked(getVerifiedAuthState).mockResolvedValue({
      status: "authenticated",
      claims: { sub: "11111111-1111-4111-8111-111111111111" } as never,
    });
    mocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });

    await expect(LandingPage({})).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });
});
