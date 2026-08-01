import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgressiveFilterControls } from "@/components/filters/progressive-filter-controls";
import { EMPTY_FILTER_GROUP, type FilterGroup } from "@/features/filters/model";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  navigation.push.mockReset();
  vi.unstubAllGlobals();
});

function renderControls(filters: FilterGroup = EMPTY_FILTER_GROUP) {
  return render(
    <ProgressiveFilterControls
      action="/app/catalog"
      query=""
      filters={filters}
      scope="catalog"
      scopeState={{}}
      preservedParameters={{ view: "grid" }}
      resultCount={42}
    />,
  );
}

describe("progressive filter controls", () => {
  it("searches, selects multiple set options, and keeps the popover open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              value: "LEA",
              label: "Limited Edition Alpha",
              secondary: "LEA",
              symbolUri: "/api/catalog/assets/set/lea",
            },
            {
              value: "2XM",
              label: "Double Masters",
              secondary: "2XM",
              symbolUri: "/api/catalog/assets/set/2xm",
            },
          ],
          hasMore: false,
        }),
      }),
    );
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    expect(screen.getByPlaceholderText("Search set")).toBeVisible();
    const listbox = await screen.findByRole("listbox");
    const alpha = await within(listbox).findByRole("option", { name: /Limited Edition Alpha/i });
    fireEvent.click(alpha);

    expect(screen.getByRole("listbox")).toBeVisible();
    await waitFor(() =>
      expect(navigation.push).toHaveBeenLastCalledWith(expect.stringMatching(/filters=.*LEA/)),
    );

    const masters = within(listbox).getByRole("option", { name: /Double Masters/i });
    fireEvent.click(masters);
    await waitFor(() =>
      expect(navigation.push).toHaveBeenLastCalledWith(expect.stringMatching(/LEA.*2XM|2XM.*LEA/)),
    );
  });

  it("keeps the mana-value range inactive until explicitly changed", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Mana value" }));
    const quickDialog = screen.getByRole("dialog", { name: "Mana value quick filter" });
    expect(within(quickDialog).getByRole("button", { name: "Set range" })).toBeEnabled();
    expect(
      within(quickDialog).queryByLabelText("Mana value minimum slider"),
    ).not.toBeInTheDocument();

    fireEvent.click(within(quickDialog).getByRole("button", { name: "Set range" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(expect.stringContaining("manaValue")),
    );
    expect(within(quickDialog).getByLabelText("Mana value minimum slider")).toBeVisible();
  });

  it("shows active chips and removes one shared rule everywhere", () => {
    renderControls({
      id: "root",
      operator: "and",
      children: [{ id: "rarity", field: "rarity", comparator: "isNot", value: ["common"] }],
    });
    const chips = screen.getByLabelText("Active filters");
    expect(within(chips).getByText(/Rarity: IS NOT common/)).toBeVisible();
    fireEvent.click(within(chips).getByRole("button", { name: /Remove filter/i }));
    expect(navigation.push).toHaveBeenCalledWith("/app/catalog?view=grid");
  });

  it("opens logic mode, exposes group NOT, and closes the panel with Escape", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));
    const panel = screen.getByRole("dialog", { name: "Advanced filters" });
    expect(within(panel).getByText("42 current results")).toBeVisible();
    fireEvent.click(within(panel).getByRole("button", { name: "Logic" }));
    expect(within(panel).getByRole("checkbox", { name: "NOT group" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Add group" })).toBeEnabled();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Advanced filters" })).not.toBeInTheDocument(),
    );
  });
});
