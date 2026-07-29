import { INVENTORY_IMPORT_LIMITS } from "./csv";
import type { InventoryImportPreviewRow } from "./types";

export function canManuallyResolveImportRow(row: InventoryImportPreviewRow): boolean {
  const inventoryStateValid =
    row.finish !== null &&
    row.condition !== null &&
    row.quantity !== null &&
    Number.isSafeInteger(row.quantity) &&
    row.quantity >= 1 &&
    row.quantity <= INVENTORY_IMPORT_LIMITS.maximumQuantityPerRow;

  return (
    inventoryStateValid &&
    (row.status === "ambiguous" || (row.status === "rejected" && row.scryfallId === null))
  );
}
