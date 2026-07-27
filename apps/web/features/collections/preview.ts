import "server-only";

import type { PriceObservation } from "@talence/domain";

import { previewCatalogPrintingDetail } from "@/features/catalog/preview";

import { INVENTORY_IMPORT_PARSER_VERSION } from "./csv";
import {
  PREVIEW_ARCHIVED_COLLECTION_ID,
  PREVIEW_COLLECTION_ID,
  PREVIEW_TRADE_COLLECTION_ID,
  PREVIEW_WORKSPACE_ID,
} from "./preview-constants";
import type {
  AnalyticalGroup,
  CollectionAnalytics,
  CollectionDetail,
  CollectionInventoryQuery,
  CollectionInventoryResult,
  CollectionListPage,
  CollectionPrinting,
  CollectionRecord,
  ImportPrintingCandidate,
  InventoryHistoryPage,
  InventoryImportInputRow,
  InventoryImportPreview,
  InventoryImportPreviewRow,
} from "./types";
import { valueTierFor } from "./view-model";

export {
  PREVIEW_ARCHIVED_COLLECTION_ID,
  PREVIEW_COLLECTION_ID,
  PREVIEW_TRADE_COLLECTION_ID,
  PREVIEW_WORKSPACE_ID,
};

const CREATED_AT = "2026-07-25T09:00:00Z";
const UPDATED_AT = "2026-07-26T18:30:00Z";
const PRICE_OBSERVED_AT = "2026-07-26T12:00:00Z";
const PRICE_INGESTED_AT = "2026-07-26T12:30:00Z";
const PRICE_STALE_AFTER = "2026-07-27T12:00:00Z";

function collection(
  id: string,
  name: string,
  slug: string,
  fields: Partial<CollectionRecord> = {},
): CollectionRecord {
  return {
    id,
    workspaceId: PREVIEW_WORKSPACE_ID,
    name,
    slug,
    description: null,
    coverPrintingId: null,
    status: "active",
    isDefault: id === PREVIEW_COLLECTION_ID,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    archivedAt: null,
    deletedAt: null,
    ...fields,
  };
}

const COLLECTIONS: CollectionRecord[] = [
  collection(PREVIEW_COLLECTION_ID, "Main Collection", "main-collection", {
    description: "The default collection for cards ready to build with.",
    coverPrintingId: "00000000-0000-4000-8000-000000000102",
  }),
  collection(PREVIEW_TRADE_COLLECTION_ID, "Trade Binder", "trade-binder", {
    description: "Cards available for in-person trades.",
  }),
  collection(PREVIEW_ARCHIVED_COLLECTION_ID, "Convention Box", "convention-box", {
    description: "A completed event inventory snapshot.",
    status: "archived",
    archivedAt: "2026-07-26T08:00:00Z",
  }),
];

function printing(printingId: string): CollectionPrinting {
  const detail = previewCatalogPrintingDetail(printingId);
  if (!detail) throw new Error(`Missing deterministic preview printing ${printingId}`);
  const item = detail.printing;
  return {
    printingId: item.printingId,
    cardId: item.cardId,
    name: item.name,
    printedName: item.printedName,
    setId: item.set.id,
    setCode: item.set.code,
    setName: item.set.name,
    collectorNumber: item.collectorNumber,
    language: item.language,
    rarity: item.rarity,
    colors: item.colors,
    colorIdentity: item.colorIdentity,
    typeLine: item.typeLine,
    releasedAt: item.releasedAt,
    availableFinishes: item.finishes.filter(
      (finish): finish is "nonfoil" | "foil" | "etched" =>
        finish === "nonfoil" || finish === "foil" || finish === "etched",
    ),
    imageSmallUri: item.faces[0]?.imageSmallUri ?? null,
    imageNormalUri: item.faces[0]?.imageNormalUri ?? null,
    active: true,
  };
}

function price(amount: string, finish: "nonfoil" | "foil" | "etched"): PriceObservation {
  return {
    provider: "Scryfall",
    currency: "USD",
    finish,
    amount,
    observedAt: PRICE_OBSERVED_AT,
    ingestedAt: PRICE_INGESTED_AT,
    staleAfter: PRICE_STALE_AFTER,
  };
}

const PREVIEW_BALANCES: CollectionInventoryResult["balances"] = [
  {
    collectionId: PREVIEW_COLLECTION_ID,
    printing: printing("00000000-0000-4000-8000-000000000101"),
    finish: "nonfoil",
    condition: "near_mint",
    quantity: 1,
    updatedAt: UPDATED_AT,
    lastTransactionId: "00000000-0000-4000-8000-000000004001",
    price: {
      unit: price("25000.0000", "nonfoil"),
      total: { currency: "USD", amount: "25000.0000" },
    },
  },
  {
    collectionId: PREVIEW_COLLECTION_ID,
    printing: printing("00000000-0000-4000-8000-000000000102"),
    finish: "nonfoil",
    condition: "lightly_played",
    quantity: 4,
    updatedAt: "2026-07-26T17:00:00Z",
    lastTransactionId: "00000000-0000-4000-8000-000000004002",
    price: { unit: null, total: null },
  },
  {
    collectionId: PREVIEW_COLLECTION_ID,
    printing: printing("00000000-0000-4000-8000-000000000103"),
    finish: "foil",
    condition: "near_mint",
    quantity: 2,
    updatedAt: "2026-07-26T16:00:00Z",
    lastTransactionId: "00000000-0000-4000-8000-000000004003",
    price: {
      unit: price("8.4500", "foil"),
      total: { currency: "USD", amount: "16.9000" },
    },
  },
];

const SUMMARY = {
  totalQuantity: 7,
  uniquePrintings: 3,
  uniqueCards: 3,
  estimatedValues: [{ currency: "USD", amount: "25016.9000" }],
  priceProviders: ["scryfall"],
  unpricedQuantity: 4,
  stalePricedQuantity: 0,
  finishBreakdown: [
    {
      key: "nonfoil",
      label: "Nonfoil",
      quantity: 5,
      value: { currency: "USD", amount: "25000.0000" },
      unpricedQuantity: 4,
    },
    {
      key: "foil",
      label: "Foil",
      quantity: 2,
      value: { currency: "USD", amount: "16.9000" },
      unpricedQuantity: 0,
    },
  ],
  conditionBreakdown: [
    {
      key: "near_mint",
      label: "Near mint",
      quantity: 3,
      value: { currency: "USD", amount: "25016.9000" },
      unpricedQuantity: 0,
    },
    {
      key: "lightly_played",
      label: "Lightly played",
      quantity: 4,
      value: null,
      unpricedQuantity: 4,
    },
  ],
  latestTransactionAt: UPDATED_AT,
  oldestPriceObservedAt: PRICE_OBSERVED_AT,
  latestPriceObservedAt: PRICE_OBSERVED_AT,
  oldestPriceIngestedAt: PRICE_INGESTED_AT,
  latestPriceIngestedAt: PRICE_INGESTED_AT,
} satisfies CollectionDetail["summary"];

export function previewCollectionList(
  includeArchived: boolean,
  defaultCollectionId: string | null = PREVIEW_COLLECTION_ID,
): CollectionListPage {
  return {
    workspaceId: PREVIEW_WORKSPACE_ID,
    permissions: { canCreate: true },
    items: COLLECTIONS.filter(
      (item) => item.status === "active" || (includeArchived && item.status === "archived"),
    ).map((item) => ({
      ...item,
      isDefault: item.id === defaultCollectionId,
      permissions: {
        canEdit: true,
        canArchive: item.status === "active" && item.id !== defaultCollectionId,
        canDelete: item.id !== defaultCollectionId && item.id !== PREVIEW_COLLECTION_ID,
      },
      totalQuantity: item.id === PREVIEW_COLLECTION_ID ? 7 : 0,
      uniquePrintings: item.id === PREVIEW_COLLECTION_ID ? 3 : 0,
      estimatedValue:
        item.id === PREVIEW_COLLECTION_ID ? { currency: "USD", amount: "25016.9000" } : null,
      priceProviders: item.id === PREVIEW_COLLECTION_ID ? ["scryfall"] : [],
      unpricedQuantity: item.id === PREVIEW_COLLECTION_ID ? 4 : 0,
      latestTransactionAt: item.id === PREVIEW_COLLECTION_ID ? UPDATED_AT : null,
    })),
    nextCursor: null,
    hasMore: false,
  };
}

export function previewCollectionDetail(
  collectionId: string,
  defaultCollectionId: string | null = PREVIEW_COLLECTION_ID,
): CollectionDetail | null {
  const found = COLLECTIONS.find((item) => item.id === collectionId);
  if (!found) return null;
  const empty = found.id !== PREVIEW_COLLECTION_ID;
  return {
    collection: { ...found, isDefault: found.id === defaultCollectionId },
    permissions: {
      canEdit: true,
      canArchive: !found.isDefault,
      canDelete: !found.isDefault && empty,
    },
    summary: empty
      ? {
          totalQuantity: 0,
          uniquePrintings: 0,
          uniqueCards: 0,
          estimatedValues: [],
          priceProviders: [],
          unpricedQuantity: 0,
          stalePricedQuantity: 0,
          finishBreakdown: [],
          conditionBreakdown: [],
          latestTransactionAt: null,
          oldestPriceObservedAt: null,
          latestPriceObservedAt: null,
          oldestPriceIngestedAt: null,
          latestPriceIngestedAt: null,
        }
      : SUMMARY,
  };
}

export function previewCollectionInventory(
  collectionId: string,
  filters: {
    query?: string | null;
    setCode?: string | null;
    finish?: string | null;
    condition?: string | null;
    sort?: string;
  } = {},
): CollectionInventoryResult | null {
  if (!COLLECTIONS.some((item) => item.id === collectionId)) return null;
  let balances =
    collectionId === PREVIEW_COLLECTION_ID ? PREVIEW_BALANCES.map((item) => ({ ...item })) : [];
  const query = filters.query?.toLocaleLowerCase("en-US") ?? "";
  balances = balances.filter((item) => {
    if (
      query &&
      ![
        item.printing.name,
        item.printing.setName,
        item.printing.setCode,
        item.printing.collectorNumber,
      ]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(query)
    ) {
      return false;
    }
    if (filters.setCode && item.printing.setCode !== filters.setCode) return false;
    if (filters.finish && item.finish !== filters.finish) return false;
    if (filters.condition && item.condition !== filters.condition) return false;
    return true;
  });
  balances.sort((left, right) => {
    if (filters.sort === "quantity_desc") return right.quantity - left.quantity;
    if (filters.sort === "value_desc") {
      return (right.price.total?.amount ?? "").localeCompare(left.price.total?.amount ?? "");
    }
    if (filters.sort === "updated_desc") return right.updatedAt.localeCompare(left.updatedAt);
    return (
      left.printing.name.localeCompare(right.printing.name) ||
      left.printing.printingId.localeCompare(right.printing.printingId)
    );
  });
  return {
    collectionId,
    currency: "USD",
    balances,
    nextCursor: null,
    resultCount: balances.length,
    hasMore: false,
  };
}

function group(
  type: AnalyticalGroup["group"],
  key: string | string[],
  label: string,
  quantity: number,
  estimatedValue: string | null,
  unpricedQuantity = 0,
): AnalyticalGroup {
  return {
    group: type,
    key,
    label,
    quantity,
    pricedQuantity: quantity - unpricedQuantity,
    unpricedQuantity,
    staleQuantity: 0,
    estimatedValue,
    priceProviders: estimatedValue ? ["scryfall"] : [],
    oldestPriceObservedAt: estimatedValue ? PRICE_OBSERVED_AT : null,
    latestPriceObservedAt: estimatedValue ? PRICE_OBSERVED_AT : null,
    oldestPriceIngestedAt: estimatedValue ? PRICE_INGESTED_AT : null,
    latestPriceIngestedAt: estimatedValue ? PRICE_INGESTED_AT : null,
  };
}

function previewAnalyticsGroups(
  balances: CollectionInventoryResult["balances"],
  type: AnalyticalGroup["group"],
  identify: (item: CollectionInventoryResult["balances"][number]) => {
    key: string | string[];
    label: string;
  },
): AnalyticalGroup[] {
  const values = new Map<
    string,
    {
      key: string | string[];
      label: string;
      quantity: number;
      unpricedQuantity: number;
      estimatedValue: number;
      hasPrice: boolean;
    }
  >();
  for (const item of balances) {
    const identity = identify(item);
    const mapKey = JSON.stringify(identity.key);
    const current = values.get(mapKey) ?? {
      ...identity,
      quantity: 0,
      unpricedQuantity: 0,
      estimatedValue: 0,
      hasPrice: false,
    };
    current.quantity += item.quantity;
    if (item.price.total) {
      current.estimatedValue += Number(item.price.total.amount);
      current.hasPrice = true;
    } else {
      current.unpricedQuantity += item.quantity;
    }
    values.set(mapKey, current);
  }
  return [...values.values()].map((item) =>
    group(
      type,
      item.key,
      item.label,
      item.quantity,
      item.hasPrice ? item.estimatedValue.toFixed(4) : null,
      item.unpricedQuantity,
    ),
  );
}

function titleCaseKey(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function previewCollectionAnalytics(
  collectionId: string,
  filters: CollectionInventoryQuery,
): CollectionAnalytics | null {
  const inventory = previewCollectionInventory(collectionId, filters);
  if (!inventory) return null;
  const { balances } = inventory;
  const pricedBalances = balances.filter((item) => item.price.total);
  const quantityTotal = balances.reduce((total, item) => total + item.quantity, 0);
  const pricedQuantity = pricedBalances.reduce((total, item) => total + item.quantity, 0);
  const estimatedValue = pricedBalances.reduce(
    (total, item) => total + Number(item.price.total?.amount ?? 0),
    0,
  );
  const hasPrice = pricedBalances.length > 0;
  const labelForPhysicalState = (value: string) =>
    ({
      nonfoil: "Nonfoil",
      foil: "Foil",
      etched: "Etched",
      near_mint: "Near mint",
      lightly_played: "Lightly played",
      moderately_played: "Moderately played",
      heavily_played: "Heavily played",
      damaged: "Damaged",
    })[value] ?? titleCaseKey(value);

  return {
    collectionId,
    currency: "USD",
    filters: {
      query: filters.query ? filters.query.toLocaleLowerCase("en-US") : null,
      setCode: filters.setCode ? filters.setCode.toLocaleLowerCase("en-US") : null,
      finish: filters.finish || null,
      condition: filters.condition || null,
    },
    quantityTotal,
    pricedQuantity,
    unpricedQuantity: quantityTotal - pricedQuantity,
    staleQuantity: 0,
    estimatedValue: hasPrice ? estimatedValue.toFixed(4) : null,
    priceProviders: hasPrice ? ["scryfall"] : [],
    oldestPriceObservedAt: hasPrice ? PRICE_OBSERVED_AT : null,
    latestPriceObservedAt: hasPrice ? PRICE_OBSERVED_AT : null,
    oldestPriceIngestedAt: hasPrice ? PRICE_INGESTED_AT : null,
    latestPriceIngestedAt: hasPrice ? PRICE_INGESTED_AT : null,
    groups: {
      sets: previewAnalyticsGroups(balances, "set", (item) => ({
        key: item.printing.setCode,
        label: item.printing.setName,
      })),
      colors: previewAnalyticsGroups(balances, "color", (item) => ({
        key: item.printing.colors,
        label: item.printing.colors.length ? item.printing.colors.join("") : "Colorless",
      })),
      colorIdentities: previewAnalyticsGroups(balances, "color_identity", (item) => ({
        key: item.printing.colorIdentity,
        label: item.printing.colorIdentity.length
          ? item.printing.colorIdentity.join("")
          : "Colorless",
      })),
      rarities: previewAnalyticsGroups(balances, "rarity", (item) => {
        const rarity = item.printing.rarity ?? "unknown";
        return { key: rarity, label: titleCaseKey(rarity) };
      }),
      finishes: previewAnalyticsGroups(balances, "finish", (item) => ({
        key: item.finish,
        label: labelForPhysicalState(item.finish),
      })),
      conditions: previewAnalyticsGroups(balances, "condition", (item) => ({
        key: item.condition,
        label: labelForPhysicalState(item.condition),
      })),
      valueTiers: previewAnalyticsGroups(balances, "value_tier", (item) => {
        const tier = valueTierFor(item.price.unit?.amount);
        return { key: tier.key, label: tier.label };
      }),
    },
  };
}

export function previewCollectionHistory(collectionId: string): InventoryHistoryPage | null {
  const detail = previewCollectionDetail(collectionId);
  if (!detail) return null;
  return {
    collection: detail.collection,
    nextCursor: null,
    transactions:
      collectionId === PREVIEW_COLLECTION_ID
        ? [
            {
              id: "00000000-0000-4000-8000-000000004001",
              collectionId,
              source: "manual",
              actorLabel: "Avery Collector",
              actorKind: "user",
              occurredAt: UPDATED_AT,
              committedAt: UPDATED_AT,
              note: "Added an exact Alpha printing.",
              externalReference: null,
              idempotencyReference: "manual_••••4001",
              reversesTransactionId: null,
              reversedByTransactionId: null,
              transferGroupId: null,
              pairedTransactionId: null,
              reversible: true,
              lineCount: 1,
              linesTruncated: false,
              lines: [
                {
                  id: "00000000-0000-4000-8000-000000005001",
                  lineNumber: 1,
                  printingId: PREVIEW_BALANCES[0]!.printing.printingId,
                  name: PREVIEW_BALANCES[0]!.printing.name,
                  setCode: PREVIEW_BALANCES[0]!.printing.setCode,
                  collectorNumber: PREVIEW_BALANCES[0]!.printing.collectorNumber,
                  language: PREVIEW_BALANCES[0]!.printing.language,
                  finish: "nonfoil",
                  condition: "near_mint",
                  quantityDelta: 1,
                  quantityBefore: 0,
                  quantityAfter: 1,
                },
              ],
            },
            {
              id: "00000000-0000-4000-8000-000000004002",
              collectionId,
              source: "csv_import",
              actorLabel: "Avery Collector",
              actorKind: "user",
              occurredAt: "2026-07-26T17:00:00Z",
              committedAt: "2026-07-26T17:00:00Z",
              note: "Convention intake",
              externalReference: "inventory-import-preview",
              idempotencyReference: "csv_••••4002",
              reversesTransactionId: null,
              reversedByTransactionId: null,
              transferGroupId: null,
              pairedTransactionId: null,
              reversible: true,
              lineCount: 1,
              linesTruncated: false,
              lines: [
                {
                  id: "00000000-0000-4000-8000-000000005002",
                  lineNumber: 1,
                  printingId: PREVIEW_BALANCES[1]!.printing.printingId,
                  name: PREVIEW_BALANCES[1]!.printing.name,
                  setCode: PREVIEW_BALANCES[1]!.printing.setCode,
                  collectorNumber: PREVIEW_BALANCES[1]!.printing.collectorNumber,
                  language: PREVIEW_BALANCES[1]!.printing.language,
                  finish: "nonfoil",
                  condition: "lightly_played",
                  quantityDelta: 4,
                  quantityBefore: 0,
                  quantityAfter: 4,
                },
              ],
            },
          ]
        : [],
  };
}

function candidate(
  printingId: string,
  fields: Partial<ImportPrintingCandidate> = {},
): ImportPrintingCandidate {
  const item = printing(printingId);
  return {
    printingId: item.printingId,
    name: item.name,
    setCode: item.setCode,
    collectorNumber: item.collectorNumber,
    language: item.language,
    availableFinishes: item.availableFinishes,
    imageSmallUri: item.imageSmallUri,
    active: item.active,
    ...fields,
  };
}

const IMPORT_CANDIDATES: ImportPrintingCandidate[] = [
  candidate("00000000-0000-4000-8000-000000000101"),
  candidate("00000000-0000-4000-8000-000000000102"),
  candidate("00000000-0000-4000-8000-000000000103"),
  candidate("00000000-0000-4000-8000-000000000102", {
    printingId: "00000000-0000-4000-8000-000000009901",
    name: "Ambiguous Fixture A",
    setCode: "DUP",
    collectorNumber: "1",
    language: "en",
  }),
  candidate("00000000-0000-4000-8000-000000000102", {
    printingId: "00000000-0000-4000-8000-000000009902",
    name: "Ambiguous Fixture B",
    setCode: "DUP",
    collectorNumber: "1",
    language: "en",
  }),
  candidate("00000000-0000-4000-8000-000000000102", {
    printingId: "00000000-0000-4000-8000-000000009903",
    name: "Inactive Fixture",
    setCode: "OLD",
    collectorNumber: "1",
    language: "en",
    active: false,
  }),
];

function rejected(
  row: InventoryImportInputRow,
  errorCode: string,
  errorMessage: string,
  suggestion: string | null = null,
): InventoryImportPreviewRow {
  return {
    ...row,
    status: "rejected",
    included: false,
    proposedPrintingId: null,
    proposedPrinting: null,
    candidates: [],
    errorCode,
    errorMessage,
    suggestion,
  };
}

export function resolvePreviewImportRows(
  rows: readonly InventoryImportInputRow[],
): InventoryImportPreviewRow[] {
  return rows.map((row) => {
    if (row.errorCode) {
      return rejected(row, row.errorCode, row.errorMessage ?? "The row is invalid.");
    }

    const matches = row.scryfallId
      ? IMPORT_CANDIDATES.filter(
          (item) => item.printingId.toLowerCase() === row.scryfallId?.toLowerCase(),
        )
      : IMPORT_CANDIDATES.filter(
          (item) =>
            item.setCode === row.setCode &&
            item.collectorNumber === row.collectorNumber &&
            item.language === row.language,
        );

    if (row.scryfallId && matches.length === 0) {
      return rejected(
        row,
        "printing_not_found",
        "The explicit Scryfall ID did not match an active Talence printing.",
      );
    }
    if (matches.length === 0) {
      return rejected(
        row,
        "printing_not_found",
        "No exact set, collector number, and language match was found.",
        row.name ? `Name is review-only: ${row.name}` : null,
      );
    }
    if (matches.length > 1) {
      return {
        ...row,
        status: "ambiguous",
        included: false,
        proposedPrintingId: null,
        proposedPrinting: null,
        candidates: matches,
        errorCode: "printing_ambiguous",
        errorMessage: "More than one exact printing matched. Choose one or exclude this row.",
        suggestion: null,
      };
    }
    const matched = matches[0]!;
    if (!matched.active) {
      return rejected(
        row,
        "printing_inactive",
        "The resolved printing is inactive and cannot receive new inventory.",
      );
    }
    if (!row.finish || !matched.availableFinishes.includes(row.finish)) {
      return rejected(
        row,
        "finish_unsupported",
        "The selected finish is not supported by this printing.",
      );
    }
    return {
      ...row,
      status: "matched",
      included: true,
      proposedPrintingId: matched.printingId,
      proposedPrinting: matched,
      candidates: [matched],
      errorCode: null,
      errorMessage: null,
      suggestion: null,
    };
  });
}

export function previewImport(
  collectionId: string,
  originalFilename: string,
  sourceSha256: string,
  rows: readonly InventoryImportInputRow[],
): InventoryImportPreview {
  const previewRows = resolvePreviewImportRows(rows);
  const counts = {
    total: previewRows.length,
    matched: previewRows.filter((row) => row.status === "matched").length,
    ambiguous: previewRows.filter((row) => row.status === "ambiguous").length,
    rejected: previewRows.filter((row) => row.status === "rejected").length,
    excluded: previewRows.filter((row) => row.status === "excluded").length,
  };
  return {
    jobId: "00000000-0000-4000-8000-000000008001",
    collectionId,
    status: "running",
    createdAt: CREATED_AT,
    stagingCompletedAt: UPDATED_AT,
    originalFilename,
    parserVersion: INVENTORY_IMPORT_PARSER_VERSION,
    sourceSha256,
    storagePath: null,
    rows: previewRows,
    afterRowNumber: 0,
    previousAfterRowNumber: null,
    nextAfterRowNumber: null,
    hasMore: false,
    counts,
    canCommit: counts.matched > 0 && counts.ambiguous === 0,
  };
}
