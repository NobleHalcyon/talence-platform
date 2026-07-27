import { describe, expect, it } from "vitest";

import {
  balanceSelectionKey,
  canEditWorkspace,
  canOwnWorkspace,
  collectionMoveDestinations,
  valueTierFor,
} from "@/features/collections/view-model";
import type { InventoryBalanceItem } from "@/features/collections/types";

function balance(overrides: Partial<InventoryBalanceItem> = {}): InventoryBalanceItem {
  return {
    collectionId: "11111111-1111-4111-8111-111111111111",
    printing: {
      printingId: "22222222-2222-4222-8222-222222222222",
      cardId: "33333333-3333-4333-8333-333333333333",
      name: "Fixture",
      printedName: null,
      setId: "44444444-4444-4444-8444-444444444444",
      setCode: "TST",
      setName: "Test Set",
      collectorNumber: "7",
      language: "en",
      rarity: "rare",
      colors: ["U"],
      colorIdentity: ["U"],
      typeLine: "Creature",
      releasedAt: "2026-07-26",
      availableFinishes: ["nonfoil", "foil"],
      imageSmallUri: null,
      imageNormalUri: null,
      active: true,
    },
    finish: "nonfoil",
    condition: "near_mint",
    quantity: 2,
    updatedAt: "2026-07-26T12:00:00Z",
    lastTransactionId: "55555555-5555-4555-8555-555555555555",
    price: {
      unit: {
        provider: "Scryfall",
        currency: "USD",
        finish: "nonfoil",
        amount: "4.2500",
        observedAt: "2026-07-26T11:00:00Z",
        ingestedAt: "2026-07-26T12:00:00Z",
        staleAfter: "2026-07-27T11:00:00Z",
      },
      total: { currency: "USD", amount: "8.5000" },
    },
    ...overrides,
  };
}

describe("collection view model", () => {
  it("uses one centralized deterministic value-tier policy", () => {
    expect(valueTierFor(null)).toEqual({ key: "unpriced", label: "Unpriced" });
    expect(valueTierFor("0")).toMatchObject({ key: "under_1" });
    expect(valueTierFor("1.0000")).toMatchObject({ key: "1_to_5" });
    expect(valueTierFor("5")).toMatchObject({ key: "5_to_25" });
    expect(valueTierFor("25")).toMatchObject({ key: "25_to_100" });
    expect(valueTierFor("100")).toMatchObject({ key: "100_and_up" });
  });

  it("uses all balance-key dimensions for selection and mutation targeting", () => {
    expect(balanceSelectionKey(balance())).toBe(
      "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:nonfoil:near_mint",
    );
  });

  it("uses the complete shell collection set for more than 40 move destinations", () => {
    const workspaceCollections = Array.from({ length: 45 }, (_, index) => ({
      id: `collection-${index}`,
      name: `Collection ${index}`,
    }));
    const destinations = collectionMoveDestinations(
      workspaceCollections,
      workspaceCollections.slice(0, 40),
      "collection-0",
    );

    expect(destinations).toHaveLength(44);
    expect(destinations.at(-1)?.id).toBe("collection-44");
  });

  it("distinguishes editor mutations from owner-only lifecycle authority", () => {
    expect(canEditWorkspace("editor")).toBe(true);
    expect(canEditWorkspace("viewer")).toBe(false);
    expect(canOwnWorkspace("admin")).toBe(false);
    expect(canOwnWorkspace("owner")).toBe(true);
  });
});
