import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DecksPage from "@/app/(authenticated)/app/decks/page";
import { previewDeckFormats, previewDeckList } from "@/features/decks/preview";

const mocks = vi.hoisted(() => ({
  loadDeckFormats: vi.fn(),
  loadDeckList: vi.fn(),
  loadDeckSourceCollections: vi.fn(),
}));

vi.mock("@/features/decks/data", () => ({
  loadDeckFormats: mocks.loadDeckFormats,
  loadDeckList: mocks.loadDeckList,
  loadDeckSourceCollections: mocks.loadDeckSourceCollections,
}));

describe("deck list route", () => {
  beforeEach(() => {
    mocks.loadDeckList.mockResolvedValue({
      ok: true,
      data: previewDeckList("active"),
      preview: true,
    });
    mocks.loadDeckFormats.mockResolvedValue({
      ok: true,
      data: previewDeckFormats(),
      preview: true,
    });
    mocks.loadDeckSourceCollections.mockResolvedValue({
      ok: false,
      reason: "request_failed",
      requestId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("fails creation closed when its complete collection-source list cannot load", async () => {
    render(await DecksPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("status")).toHaveTextContent("Deck creation sources are unavailable");
    expect(screen.queryByRole("button", { name: "Create deck" })).not.toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeInTheDocument();
    expect(mocks.loadDeckSourceCollections).toHaveBeenCalledWith(false);
  });
});
