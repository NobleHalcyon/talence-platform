import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CatalogLoading from "@/app/(authenticated)/app/catalog/loading";
import {
  CatalogCardDetailView,
  CatalogPrintingDetailView,
} from "@/components/catalog/catalog-detail";
import { CatalogControls } from "@/components/catalog/catalog-controls";
import { CatalogPageState } from "@/components/catalog/catalog-page-state";
import {
  previewCatalogCardDetail,
  previewCatalogPrintingDetail,
  previewCatalogSearch,
} from "@/features/catalog/preview";
import { defaultCatalogQuery } from "@/features/catalog/query";

const navigationMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
}));

afterEach(() => {
  navigationMocks.replace.mockReset();
  vi.unstubAllGlobals();
});

function parsed(view: "grid" | "table" = "grid") {
  return { query: defaultCatalogQuery(view), notices: [] };
}

describe("catalog UI states", () => {
  it("renders the image-only grid with compact hover details and quick actions", () => {
    const query = defaultCatalogQuery("grid");
    const data = previewCatalogSearch(query);
    render(
      <CatalogPageState
        parsed={{ query, notices: [] }}
        result={{ ok: true, data, preview: true }}
      />,
    );

    expect(screen.getByRole("heading", { name: "2 results" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View Black Lotus" })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/catalog/cards/"),
    );
    expect(screen.queryByRole("link", { name: "View Lightning Bolt" })).not.toBeInTheDocument();
    expect(screen.getByText("Nonfoil $25,000.00")).toBeInTheDocument();
    expect(screen.getAllByText("Price unavailable")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add to collection" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Add to deck" })).toHaveLength(2);
    expect(screen.queryByLabelText("Catalog freshness")).not.toBeInTheDocument();
    expect(screen.queryByText(/Oracle mode:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ingested/i)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    const viewToggle = screen.getByRole("group", { name: "Catalog result view" });
    expect(Array.from(viewToggle.querySelectorAll("a"), (link) => link.textContent)).toEqual([
      "Grid",
      "Table",
    ]);
  });

  it("renders the empty state with one safe broadening action", () => {
    const query = defaultCatalogQuery();
    render(
      <CatalogPageState
        parsed={{ query, notices: [] }}
        result={{
          ok: true,
          preview: false,
          data: {
            ...previewCatalogSearch(query),
            items: [],
            resultCount: 0,
            totalCount: 0,
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "No printings match" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear search" })).toBeVisible();
  });

  it("renders a safe error state with request correlation", () => {
    render(
      <CatalogPageState
        parsed={parsed()}
        result={{
          ok: false,
          reason: "request_failed",
          requestId: "11111111-1111-4111-8111-111111111111",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Catalog results are unavailable" })).toBeVisible();
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeVisible();
  });

  it("renders a labeled loading state", () => {
    render(<CatalogLoading />);

    expect(screen.getByRole("status", { name: "Loading catalog results" })).toBeVisible();
  });

  it("opens the progressive advanced panel with human-readable selectors", () => {
    render(
      <CatalogPageState
        parsed={parsed()}
        result={{
          ok: true,
          preview: true,
          data: previewCatalogSearch(defaultCatalogQuery("grid")),
        }}
      />,
    );

    const filterTrigger = screen.getByRole("button", { name: "Advanced filters" });
    expect(filterTrigger).toBeEnabled();
    fireEvent.click(filterTrigger);
    const drawer = screen.getByRole("dialog", { name: "Advanced filters" });
    expect(drawer).toBeVisible();
    expect(screen.getByRole("button", { name: "Language" })).toBeEnabled();
    expect(drawer.querySelector('[name="lang"]')).not.toBeInTheDocument();
    const variants = screen.getByRole("checkbox", { name: "Return all variants" });
    expect(variants).not.toBeChecked();
    expect(variants).toHaveAccessibleDescription(
      "Select this to return all individual printings of a card. Leave this unchecked to only return one result per card.",
    );
  });

  it("renders one advanced trigger in the quick-filter row", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<CatalogControls query={defaultCatalogQuery("grid")} />);

    const buttons = Array.from(container.querySelectorAll("button"));
    const filterTrigger = buttons.find((button) => button.textContent === "Advanced filters");

    expect(filterTrigger).toBeEnabled();
    expect(filterTrigger?.parentElement?.getAttribute("aria-label")).toBe("Quick filters");
    expect(container.querySelectorAll('[name="lang"]')).toHaveLength(0);
  });

  it("requests a complete-row page size when the viewport crosses a grid tier", async () => {
    const activeMedia = new Set(["(min-width: 58rem)", "(min-width: 44rem)", "(min-width: 27rem)"]);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((media: string) => ({
        matches: activeMedia.has(media),
        media,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    render(<CatalogControls query={defaultCatalogQuery("grid")} />);

    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/app/catalog?page_size=24&view=grid", {
        scroll: false,
      });
    });
  });

  it("broadens preview results through an explicit shared language rule", () => {
    const query = {
      ...defaultCatalogQuery("grid"),
      filters: {
        id: "root",
        operator: "and" as const,
        children: [
          {
            id: "language",
            field: "language" as const,
            comparator: "is" as const,
            value: ["en", "ja"],
          },
        ],
      },
    };
    const data = previewCatalogSearch(query);

    expect(data.items.map((item) => item.language)).toContain("en");
    expect(data.items.map((item) => item.language)).toContain("ja");
    expect(data.resultCount).toBe(3);
  });

  it("returns one representative per Oracle card unless variants are requested", () => {
    const oracle = previewCatalogSearch({
      ...defaultCatalogQuery("grid"),
      query: "Black Lotus",
    });
    const variants = previewCatalogSearch({
      ...defaultCatalogQuery("grid"),
      query: "Black Lotus",
      returnAllVariants: true,
    });
    const alphaSet = previewCatalogSearch({
      ...defaultCatalogQuery("grid"),
      query: "Black Lotus",
      filters: {
        id: "root",
        operator: "and",
        children: [{ id: "set-lea", field: "set", comparator: "is", value: ["LEA"] }],
      },
    });

    expect(oracle.totalCount).toBe(1);
    expect(oracle.items[0]?.set.code).toBe("2ED");
    expect(variants.totalCount).toBe(2);
    expect(variants.items.map((item) => item.set.code)).toEqual(["2ED", "LEA"]);
    expect(alphaSet.totalCount).toBe(1);
    expect(alphaSet.items[0]?.set.code).toBe("LEA");
  });

  it("renders direct provider images and switches ordered printing faces", () => {
    const detail = previewCatalogPrintingDetail("00000000-0000-4000-8000-000000000102");
    if (!detail) {
      throw new Error("preview fixture missing");
    }

    render(<CatalogPrintingDetailView detail={detail} backHref="/app/catalog?view=grid" preview />);

    const front = screen.getByRole("img", { name: /Delver of Secrets, face 1/ });
    expect(front).toHaveAttribute("src", expect.stringMatching(/^https:\/\/cards\.scryfall\.io\//));
    expect(front).not.toHaveAttribute("src", expect.stringContaining("_next/image"));

    fireEvent.click(screen.getByRole("button", { name: "Show next face" }));
    expect(screen.getByRole("img", { name: /Insectile Aberration, face 2/ })).toBeVisible();
  });

  it("makes a truncated card-printing list explicit and links back to catalog search", () => {
    const detail = previewCatalogCardDetail("00000000-0000-4000-8000-000000000001");
    if (!detail) {
      throw new Error("preview card fixture missing");
    }

    render(
      <CatalogCardDetailView
        detail={{
          ...detail,
          printingCount: 251,
          printingsTruncated: true,
        }}
        backHref="/app/catalog?view=grid"
        preview
      />,
    );

    expect(screen.getByRole("heading", { name: "Printings (251)" })).toBeVisible();
    expect(screen.getByText(/Showing the newest 2 of 251 printings/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse catalog matches" })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/catalog?q=Black+Lotus&view=table"),
    );
  });

  it("does not expose an import action in ordinary catalog results", () => {
    render(
      <CatalogPageState
        parsed={parsed()}
        result={{
          ok: true,
          preview: true,
          data: previewCatalogSearch(defaultCatalogQuery("grid")),
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /sync|import/i })).not.toBeInTheDocument();
  });
});
