import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

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

function parsed(view: "grid" | "table" = "grid") {
  return { query: defaultCatalogQuery(view), notices: [] };
}

describe("catalog UI states", () => {
  it("renders a successful result with explicit available and unavailable prices", () => {
    const query = defaultCatalogQuery("grid");
    const data = previewCatalogSearch(query);
    render(
      <CatalogPageState
        parsed={{ query, notices: [] }}
        result={{ ok: true, data, preview: true }}
      />,
    );

    expect(screen.getByRole("heading", { name: "2 results" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Black Lotus" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Lightning Bolt" })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Price unavailable").some((element) => element.tagName === "SPAN"),
    ).toBe(true);
    expect(screen.getAllByText(/Scryfall estimate/)).toHaveLength(1);
    expect(screen.getAllByText(/ingested/).length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
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

  it("opens a compact filter drawer with labeled controls", () => {
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

    const filterTrigger = screen.getByRole("button", { name: "Filters" });
    expect(filterTrigger).toBeEnabled();
    fireEvent.click(filterTrigger);
    const drawer = screen.getByRole("dialog", { name: "Filters" });
    expect(drawer).toBeVisible();
    expect(screen.getAllByLabelText("Language code")).toHaveLength(2);
    expect(
      screen.getAllByText('English is the default. Enter "all" to include every language.'),
    ).toHaveLength(2);
    expect(drawer.querySelector('[name="lang"]')).toBeInTheDocument();
  });

  it("keeps the mobile filter trigger disabled in server markup until hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<CatalogControls query={defaultCatalogQuery("grid")} />);

    const filterTrigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Filters",
    );

    expect(filterTrigger).toBeDisabled();
  });

  it("broadens preview results only through the explicit all-language sentinel", () => {
    const query = { ...defaultCatalogQuery("grid"), language: "all" };
    const data = previewCatalogSearch(query);

    expect(data.items.map((item) => item.language)).toContain("en");
    expect(data.items.map((item) => item.language)).toContain("ja");
    expect(data.resultCount).toBe(3);
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
    expect(screen.getByText(/Showing the newest 1 of 251 printings/)).toBeVisible();
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
