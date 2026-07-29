import type { InventoryBalanceItem } from "./types";

export const VALUE_TIER_THRESHOLDS = Object.freeze([
  { key: "under_1", label: "Under 1", minimum: 0, maximumExclusive: 1 },
  { key: "1_to_5", label: "1 to under 5", minimum: 1, maximumExclusive: 5 },
  { key: "5_to_25", label: "5 to under 25", minimum: 5, maximumExclusive: 25 },
  { key: "25_to_100", label: "25 to under 100", minimum: 25, maximumExclusive: 100 },
  {
    key: "100_and_up",
    label: "100 and up",
    minimum: 100,
    maximumExclusive: Number.POSITIVE_INFINITY,
  },
] as const);

function decimal(value: string | null | undefined): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function valueTierFor(amount: string | null | undefined): {
  key: string;
  label: string;
} {
  const numeric = decimal(amount);
  if (numeric === null) {
    return { key: "unpriced", label: "Unpriced" };
  }
  const tier = VALUE_TIER_THRESHOLDS.find(
    ({ minimum, maximumExclusive }) => numeric >= minimum && numeric < maximumExclusive,
  );
  return tier ?? { key: "unpriced", label: "Unpriced" };
}

export function balanceSelectionKey(item: InventoryBalanceItem): string {
  return [item.collectionId, item.printing.printingId, item.finish, item.condition].join(":");
}

export interface CollectionMoveDestination {
  id: string;
  name: string;
  status?: string;
}

export function collectionMoveDestinations(
  workspaceCollections: readonly CollectionMoveDestination[] | null,
  previewFallback: readonly CollectionMoveDestination[],
  sourceCollectionId: string,
): CollectionMoveDestination[] {
  const source = workspaceCollections ?? previewFallback;
  return source.filter(
    (collection) =>
      collection.id !== sourceCollectionId &&
      (collection.status === undefined || collection.status === "active"),
  );
}

export function canEditWorkspace(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canOwnWorkspace(role: string | null | undefined): boolean {
  return role === "owner";
}
