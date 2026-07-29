import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionSummaryView } from "@/components/collections/collection-summary";
import { CollectionHistoryView } from "@/components/collections/collection-history";
import { CollectionReadErrorState } from "@/components/collections/collection-shared";
import type { CollectionSummary, InventoryHistoryPage } from "@/features/collections/types";

function summary(priceProviders: string[]): CollectionSummary {
  return {
    totalQuantity: 2,
    uniquePrintings: 1,
    uniqueCards: 1,
    estimatedValues: [{ currency: "USD", amount: "12.3400" }],
    priceProviders,
    unpricedQuantity: 0,
    stalePricedQuantity: 0,
    finishBreakdown: [],
    conditionBreakdown: [],
    latestTransactionAt: "2026-07-26T12:30:00Z",
    oldestPriceObservedAt: "2026-07-26T10:00:00Z",
    latestPriceObservedAt: "2026-07-26T11:00:00Z",
    oldestPriceIngestedAt: "2026-07-26T10:30:00Z",
    latestPriceIngestedAt: "2026-07-26T11:30:00Z",
  };
}

describe("collection price provenance", () => {
  it("shows mixed providers and both observed and ingested freshness", () => {
    render(<CollectionSummaryView summary={summary(["scryfall", "market_fixture"])} />);

    expect(screen.getByText("Sources: Scryfall, Market Fixture")).toBeInTheDocument();
    expect(screen.getByText(/Observed .* to .* UTC/)).toBeInTheDocument();
    expect(screen.getByText(/Ingested .* to .* UTC/)).toBeInTheDocument();
  });

  it("labels a missing aggregate provider instead of implying one", () => {
    render(<CollectionSummaryView summary={summary([])} />);

    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
  });
});

describe("collection read failures", () => {
  it("renders permission denial explicitly without suggesting a retry", () => {
    render(
      <CollectionReadErrorState
        reason="permission_denied"
        requestId="11111111-1111-4111-8111-111111111111"
        subject="transaction history"
        genericTitle="Transaction history could not be loaded"
        retryHref="/app/collections/fixture/history"
      />,
    );

    expect(screen.getByRole("heading", { name: "Permission denied" })).toBeInTheDocument();
    expect(
      screen.getByText(/workspace access does not allow this transaction history/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to collections" })).toHaveAttribute(
      "href",
      "/app/collections",
    );
    expect(screen.queryByRole("link", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps transient failures safely retryable", () => {
    render(
      <CollectionReadErrorState
        reason="request_failed"
        requestId="22222222-2222-4222-8222-222222222222"
        subject="CSV import"
        genericTitle="Import is unavailable"
        retryHref="/app/collections/fixture/import"
      />,
    );

    expect(screen.getByRole("heading", { name: "Import is unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/app/collections/fixture/import",
    );
  });
});

describe("bounded collection history", () => {
  it("labels a five-line header preview and links to all 5,000 deltas", () => {
    const history: InventoryHistoryPage = {
      collection: {
        id: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        name: "Fixture",
        slug: "fixture",
        description: null,
        coverPrintingId: null,
        status: "active",
        isDefault: false,
        createdAt: "2026-07-26T10:00:00Z",
        updatedAt: "2026-07-26T10:00:00Z",
        archivedAt: null,
        deletedAt: null,
      },
      nextCursor: null,
      transactions: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          collectionId: "11111111-1111-4111-8111-111111111111",
          source: "csv_import",
          actorLabel: "Fixture user",
          actorKind: "user",
          occurredAt: "2026-07-26T10:00:00Z",
          committedAt: "2026-07-26T10:00:01Z",
          note: null,
          externalReference: null,
          idempotencyReference: "csv_import_••••fixture",
          reversesTransactionId: null,
          reversedByTransactionId: null,
          transferGroupId: null,
          pairedTransactionId: null,
          reversible: false,
          lineCount: 5_000,
          linesTruncated: true,
          lines: Array.from({ length: 5 }, (_, index) => ({
            id: `line-${index + 1}`,
            lineNumber: index + 1,
            printingId: "44444444-4444-4444-8444-444444444444",
            name: `Card ${index + 1}`,
            setCode: "TST",
            collectorNumber: String(index + 1),
            language: "en",
            finish: "nonfoil",
            condition: "near_mint",
            quantityDelta: 1,
            quantityBefore: 0,
            quantityAfter: 1,
          })),
        },
      ],
    };

    render(<CollectionHistoryView history={history} occurredAt="2026-07-26T11:00:00.000Z" />);

    expect(screen.getByText("5,000 lines")).toBeInTheDocument();
    expect(screen.getByText("First 5 shown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all 5,000 lines" })).toHaveAttribute(
      "href",
      "/app/collections/11111111-1111-4111-8111-111111111111/history/33333333-3333-4333-8333-333333333333",
    );
    expect(screen.queryByText("Card 6")).not.toBeInTheDocument();
  });
});
