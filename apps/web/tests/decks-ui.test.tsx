import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckAnalysisInspector, DeckPersistentSummary } from "@/components/decks/deck-analysis";
import { DeckEditor } from "@/components/decks/deck-editor";
import { DeckListView } from "@/components/decks/deck-list";
import { DeckSettingsForm, DeckSourceControl } from "@/components/decks/deck-settings";
import { DeckStatusNotice } from "@/components/decks/deck-shared";
import { DeckZoneEditor } from "@/components/decks/deck-zones";
import {
  previewDeckCatalogSearch,
  previewDeckDetail,
  previewDeckList,
} from "@/features/decks/preview";
import { PREVIEW_DECK_ID } from "@/features/decks/preview-constants";

function detail() {
  const value = previewDeckDetail(PREVIEW_DECK_ID);
  if (!value) throw new Error("preview deck fixture missing");
  return value;
}

describe("deck builder UI", () => {
  it("shows finite oracle and preferred allocations as distinct values", () => {
    const value = detail();
    render(<DeckZoneEditor detail={value} returnTo={`/app/decks/${value.deck.id}`} />);

    const sideboard = screen.getByRole("heading", { name: "Sideboard" }).closest("section");
    expect(sideboard).not.toBeNull();
    const scoped = within(sideboard!);
    expect(scoped.getByText("2 required")).toBeVisible();
    expect(scoped.getByText("0 allocated")).toBeVisible();
    expect(scoped.getByText("Preferred available").nextElementSibling).toHaveTextContent("2");
    expect(scoped.getByText("Preferred allocated").nextElementSibling).toHaveTextContent("0");
    expect(scoped.getByText("Preferred missing").nextElementSibling).toHaveTextContent("2");
    expect(
      scoped.getByText(/Only “Allocated owned” contributes to whole-deck ownership/),
    ).toBeVisible();
  });

  it("keeps maybeboard, unpriced state, version evidence, and unknown legality explicit", () => {
    const value = detail();
    const withUnavailableAggregate = {
      ...value,
      valuation: {
        ...value.valuation,
        preferredPrintingValue: null,
        missingAcquisitionValue: null,
      },
    };
    render(<DeckAnalysisInspector detail={withUnavailableAggregate} />);

    expect(
      screen.getByText(/Maybeboard entries are excluded and do not reserve copies/),
    ).toBeVisible();
    expect(screen.getAllByText("Unpriced / unknown")).toHaveLength(2);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("Legality data is incomplete")).toBeVisible();
    expect(screen.getByText(value.validation.rulesVersion)).toBeVisible();
    expect(screen.getByText(value.validation.catalogVersion!)).toBeVisible();
    expect(screen.getByText(value.validation.contentHash)).toBeVisible();
    expect(screen.getByText("Advisory, not exhaustive")).toBeVisible();
  });

  it("renders complete validation aggregates and explicit truncation evidence", () => {
    const value = detail();
    const truncated = {
      ...value,
      validation: {
        ...value.validation,
        valid: false,
        summary: {
          errorCount: 77,
          warningCount: 23,
          informationCount: 9,
          unknownLegalityCount: 12,
          issueDetailLimit: 1_000,
          issueDetailReturned: 1_001,
          issueDetailTotal: 1_250,
          issuesTruncated: true,
        },
      },
    };
    render(
      <>
        <DeckPersistentSummary detail={truncated} />
        <DeckAnalysisInspector detail={truncated} />
      </>,
    );

    expect(screen.getByText("77 validation errors")).toBeVisible();
    expect(screen.getByText("77 errors")).toBeVisible();
    expect(screen.getByText("23 warnings")).toBeVisible();
    expect(screen.getByText("9 information")).toBeVisible();
    expect(screen.getByText("12 unknown-legality findings")).toBeVisible();
    expect(screen.getByText("Validation issue details are truncated")).toBeVisible();
    expect(screen.getByText(/Complete summary totals cover 1250 issues/)).toBeVisible();
    expect(screen.getByText("1001 returned / 1250 total")).toBeVisible();
  });

  it("fails collection-source replacement closed when the collection list is unavailable", () => {
    const value = detail();
    render(<DeckSourceControl detail={value} collections={[]} collectionsAvailable={false} />);

    fireEvent.click(screen.getByText("Choose collection sources"));
    expect(screen.getByText("Collection sources are unavailable")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Recalculate from selected sources" }),
    ).toBeDisabled();
    expect(
      screen.getAllByRole("checkbox").every((checkbox) => checkbox.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("retains a pinned inactive format while keeping hidden save fields coherent", () => {
    const value = detail();
    const inactive = {
      ...value.format,
      formatVersionId: "00000000-0000-4000-8000-000000007099",
      version: 0,
      versionKey: "commander-retired.0",
      rulesVersion: "commander-retired.0",
      active: false,
    };
    const pinned = {
      ...value,
      deck: {
        ...value.deck,
        formatVersionId: inactive.formatVersionId,
        rulesVersion: inactive.rulesVersion,
      },
      format: inactive,
      availableFormats: [inactive, ...value.availableFormats],
    };
    const { container } = render(<DeckSettingsForm detail={pinned} />);

    fireEvent.click(screen.getByText("Edit deck details"));
    const formatSelect = screen.getByLabelText("Format");
    expect(formatSelect).toHaveValue(inactive.formatVersionId);
    expect(
      within(formatSelect).getByRole("option", { name: /inactive, retained/ }),
    ).not.toBeDisabled();
    expect(container.querySelector<HTMLInputElement>('input[name="formatVersionId"]')).toHaveValue(
      inactive.formatVersionId,
    );
    expect(container.querySelector<HTMLInputElement>('input[name="formatCode"]')).toHaveValue(
      "commander",
    );
  });

  it("keeps archived restore enabled and renders selected archived-source warnings", () => {
    const listRender = render(
      <DeckListView page={previewDeckList("archived")} filter="archived" />,
    );
    expect(screen.getByRole("button", { name: /^Restore$/ })).toBeEnabled();
    listRender.unmount();

    const value = detail();
    render(
      <DeckEditor
        detail={{
          ...value,
          sources: value.sources.map((source, index) =>
            index === 0 ? { ...source, status: "archived" } : source,
          ),
        }}
        catalog={previewDeckCatalogSearch("", value.deck.formatCode)}
        query=""
        surface="deck"
        collections={[]}
        collectionsAvailable
        printingPicker={null}
      />,
    );
    expect(screen.getByText("Archived collection source is still counted")).toBeVisible();
    expect(screen.getByText(/Deleted collections cannot be selected/)).toBeVisible();
  });

  it("drops arbitrary or oversized request references from status notices", () => {
    const { rerender } = render(
      <DeckStatusNotice status="permission_denied" requestId={"x".repeat(10_000)} />,
    );
    expect(screen.getByText("Permission denied")).toBeVisible();
    expect(screen.queryByText(/Support reference/)).not.toBeInTheDocument();

    rerender(
      <DeckStatusNotice status="request_failed" requestId="11111111-1111-4111-8111-111111111111" />,
    );
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeVisible();
  });
});
