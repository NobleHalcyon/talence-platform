import type { CardCondition, CardFinish, PriceObservation, ResourceStatus } from "@talence/domain";

import type { FilterGroup } from "@/features/filters/model";

export const COLLECTION_VIEWS = ["structured", "gallery", "analytical"] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];

export const COLLECTION_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type CollectionStatusFilter = (typeof COLLECTION_STATUS_FILTERS)[number];

export interface CollectionInventoryQuery {
  query: string;
  filters: FilterGroup;
  sort: "name" | "quantity_desc" | "value_desc" | "updated_desc";
  cursor: string | null;
  view: CollectionView;
}

export interface CollectionRecord {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  coverPrintingId: string | null;
  status: ResourceStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface CollectionListItem extends CollectionRecord {
  permissions: {
    canEdit: boolean;
    canArchive: boolean;
    canDelete: boolean;
  };
  totalQuantity: number;
  uniquePrintings: number;
  estimatedValue: MoneyAmount | null;
  priceProviders: string[];
  unpricedQuantity: number;
  latestTransactionAt: string | null;
}

export interface CollectionListPage {
  workspaceId: string;
  permissions: {
    canCreate: boolean;
  };
  items: CollectionListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MoneyAmount {
  currency: string;
  amount: string;
}

export interface CollectionPriceContext {
  unit: PriceObservation | null;
  total: MoneyAmount | null;
}

export interface CollectionPrinting {
  printingId: string;
  cardId: string | null;
  name: string;
  printedName: string | null;
  setId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  language: string;
  rarity: string | null;
  colors: string[];
  colorIdentity: string[];
  typeLine: string | null;
  releasedAt: string | null;
  availableFinishes: CardFinish[];
  imageSmallUri: string | null;
  imageNormalUri: string | null;
  active: boolean;
}

export interface InventoryBalanceItem {
  collectionId: string;
  printing: CollectionPrinting;
  finish: CardFinish;
  condition: CardCondition;
  quantity: number;
  updatedAt: string;
  lastTransactionId: string;
  price: CollectionPriceContext;
}

export interface InventoryExportRow {
  scryfallId: string | null;
  oracleId: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  language: string;
  finish: CardFinish;
  condition: CardCondition;
  quantity: number;
  price: {
    provider: string;
    currency: string;
    amount: string;
    observedAt: string;
    ingestedAt: string;
    staleAfter: string | null;
  } | null;
}

export interface QuantityBreakdown {
  key: string;
  label: string;
  quantity: number;
  value: MoneyAmount | null;
  unpricedQuantity: number;
}

export interface CollectionSummary {
  totalQuantity: number;
  uniquePrintings: number;
  uniqueCards: number;
  estimatedValues: MoneyAmount[];
  priceProviders: string[];
  unpricedQuantity: number;
  stalePricedQuantity: number;
  finishBreakdown: QuantityBreakdown[];
  conditionBreakdown: QuantityBreakdown[];
  latestTransactionAt: string | null;
  oldestPriceObservedAt: string | null;
  latestPriceObservedAt: string | null;
  oldestPriceIngestedAt: string | null;
  latestPriceIngestedAt: string | null;
}

export interface CollectionDetail {
  collection: CollectionRecord;
  permissions: {
    canEdit: boolean;
    canArchive: boolean;
    canDelete: boolean;
  };
  summary: CollectionSummary;
}

export interface CollectionInventoryResult {
  collectionId: string;
  currency: string;
  balances: InventoryBalanceItem[];
  nextCursor: string | null;
  resultCount: number;
  totalCount: number | null;
  hasMore: boolean;
}

export interface CollectionInventoryPage {
  collection: CollectionRecord;
  balances: InventoryBalanceItem[];
  summary: CollectionSummary;
  nextCursor: string | null;
  resultCount: number;
  totalCount: number | null;
}

export interface AnalyticalGroup {
  group: "set" | "color" | "color_identity" | "rarity" | "finish" | "condition" | "value_tier";
  key: string | string[];
  label: string;
  quantity: number;
  pricedQuantity: number;
  unpricedQuantity: number;
  staleQuantity: number;
  estimatedValue: string | null;
  priceProviders: string[];
  oldestPriceObservedAt: string | null;
  latestPriceObservedAt: string | null;
  oldestPriceIngestedAt: string | null;
  latestPriceIngestedAt: string | null;
}

export interface CollectionAnalytics {
  collectionId: string;
  currency: string;
  filters: {
    query: string | null;
    expression: FilterGroup;
  };
  quantityTotal: number;
  pricedQuantity: number;
  unpricedQuantity: number;
  staleQuantity: number;
  estimatedValue: string | null;
  priceProviders: string[];
  oldestPriceObservedAt: string | null;
  latestPriceObservedAt: string | null;
  oldestPriceIngestedAt: string | null;
  latestPriceIngestedAt: string | null;
  groups: {
    sets: AnalyticalGroup[];
    colors: AnalyticalGroup[];
    colorIdentities: AnalyticalGroup[];
    rarities: AnalyticalGroup[];
    finishes: AnalyticalGroup[];
    conditions: AnalyticalGroup[];
    valueTiers: AnalyticalGroup[];
  };
}

export interface InventoryTransactionLine {
  id: string;
  lineNumber: number;
  printingId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  language: string;
  finish: CardFinish;
  condition: CardCondition;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
}

export interface InventoryTransaction {
  id: string;
  collectionId: string;
  source: "manual" | "csv_import" | "device" | "transfer" | "reversal" | "admin_correction";
  actorLabel: string;
  actorKind: "user" | "device" | "system";
  occurredAt: string;
  committedAt: string;
  note: string | null;
  externalReference: string | null;
  idempotencyReference: string | null;
  reversesTransactionId: string | null;
  reversedByTransactionId: string | null;
  transferGroupId: string | null;
  pairedTransactionId: string | null;
  reversible: boolean;
  lineCount: number;
  linesTruncated: boolean;
  lines: InventoryTransactionLine[];
}

export interface InventoryHistoryPage {
  collection: CollectionRecord;
  transactions: InventoryTransaction[];
  nextCursor: string | null;
}

export interface InventoryTransactionLinesPage {
  transactionId: string;
  collectionId: string;
  lineCount: number;
  afterLineNumber: number;
  lines: InventoryTransactionLine[];
  nextAfterLineNumber: number | null;
  hasMore: boolean;
}

export type ImportResolutionStrategy = "scryfall_id" | "set_collector_language";
export type ImportRowStatus = "matched" | "ambiguous" | "rejected" | "excluded";
export type InventoryImportJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface InventoryImportInputRow {
  rowNumber: number;
  scryfallId: string | null;
  oracleId: string | null;
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: Exclude<CardFinish, "unknown"> | null;
  condition: Exclude<CardCondition, "unknown"> | null;
  quantity: number | null;
  strategy: ImportResolutionStrategy | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw?: {
    scryfallId: string | null;
    oracleId: string | null;
    name: string | null;
    setCode: string | null;
    collectorNumber: string | null;
    language: string | null;
    finish: string | null;
    condition: string | null;
    quantity: string | null;
  };
}

export interface ImportPrintingCandidate {
  printingId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  language: string;
  availableFinishes: CardFinish[];
  imageSmallUri: string | null;
  active: boolean;
}

export interface InventoryImportPreviewRow extends InventoryImportInputRow {
  status: ImportRowStatus;
  included: boolean;
  proposedPrintingId: string | null;
  proposedPrinting: ImportPrintingCandidate | null;
  candidates: ImportPrintingCandidate[];
  suggestion: string | null;
}

export interface InventoryImportPreview {
  jobId: string;
  collectionId: string;
  status: InventoryImportJobStatus;
  createdAt: string;
  stagingCompletedAt: string | null;
  originalFilename: string;
  parserVersion: string;
  sourceSha256: string;
  storagePath: string | null;
  rows: InventoryImportPreviewRow[];
  afterRowNumber: number;
  previousAfterRowNumber: number | null;
  nextAfterRowNumber: number | null;
  hasMore: boolean;
  counts: {
    total: number;
    matched: number;
    ambiguous: number;
    rejected: number;
    excluded: number;
  };
  canCommit: boolean;
}

export interface InventoryImportErrorReportRow {
  rowNumber: number;
  status: ImportRowStatus;
  errorCode: string | null;
  errorMessage: string | null;
  suggestion: string | null;
  raw: {
    scryfallId: string | null;
    setCode: string | null;
    collectorNumber: string | null;
    language: string | null;
    name: string | null;
    finish: string | null;
    condition: string | null;
    quantity: string | null;
  };
}

export interface InventoryImportErrorReportPage {
  rows: InventoryImportErrorReportRow[];
  afterRowNumber: number;
  previousAfterRowNumber: number | null;
  nextAfterRowNumber: number | null;
  hasMore: boolean;
}

export interface InventoryMutationResult {
  transactionId: string;
  replayed: boolean;
  committedAt: string;
  lines: Array<{
    printingId: string;
    finish: CardFinish;
    condition: CardCondition;
    quantityBefore: number;
    quantityAfter: number;
  }>;
}

export type CollectionLoadFailureReason =
  | "configuration_required"
  | "invalid_response"
  | "not_found"
  | "permission_denied"
  | "request_failed";

export type CollectionLoadResult<T> =
  | { ok: true; data: T; preview: boolean }
  | {
      ok: false;
      reason: CollectionLoadFailureReason;
      requestId: string;
    };

export interface CollectionRpcError {
  code?: string;
  message?: string;
  details?: unknown;
}

export interface CollectionRpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: CollectionRpcError | null }>;
}
