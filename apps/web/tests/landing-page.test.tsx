import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "@/app/(public)/page";

describe("landing page", () => {
  it("describes private admission and never offers registration", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: "Know every card. Trust every change.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/Access requires an administrator-issued invitation/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /register|sign up/i })).not.toBeInTheDocument();
  });

  it("exposes the primary platform boundaries as readable content", () => {
    render(<LandingPage />);

    expect(screen.getByText("Catalog precision")).toBeVisible();
    expect(screen.getByText("Auditable inventory")).toBeVisible();
    expect(screen.getByText("Deck ownership")).toBeVisible();
    expect(screen.getByText("Machine ready")).toBeVisible();
  });
});
