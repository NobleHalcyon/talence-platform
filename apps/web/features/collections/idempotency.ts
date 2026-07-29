import type { CardCondition, CardFinish } from "@talence/domain";

import type { InventoryBalanceItem } from "./types";

export interface InventoryEditAttempt {
  idempotencyKey: string;
  lineId: string;
}

export interface BulkAttemptInput {
  collectionId: string;
  destinationCollectionId: string;
  operation: string;
  occurredAt: string;
  note: string;
  lines: string;
  selected: Array<{
    printingId: string;
    finish: CardFinish;
    condition: CardCondition;
    lastTransactionId: string;
  }>;
}

export function inventoryEditAttempt(
  item: Pick<InventoryBalanceItem, "condition" | "finish" | "lastTransactionId" | "printing">,
): InventoryEditAttempt {
  const balanceIdentity = [item.printing.printingId, item.finish, item.condition].join(":");

  return {
    idempotencyKey: `inventory-edit:${item.lastTransactionId}:${balanceIdentity}`,
    lineId: `edit:${item.lastTransactionId}:${balanceIdentity}`,
  };
}

function fnv1a64(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
}

export function bulkAttemptIdempotencyKey(input: BulkAttemptInput): string {
  return `bulk-inventory:${fnv1a64(JSON.stringify(input))}`;
}
