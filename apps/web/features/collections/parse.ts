import {
  CARD_CONDITIONS,
  CARD_FINISHES,
  RESOURCE_STATUSES,
  type CardCondition,
  type CardFinish,
  type PriceObservation,
  type ResourceStatus,
} from "@talence/domain";

import type {
  AnalyticalGroup,
  CollectionAnalytics,
  CollectionDetail,
  CollectionInventoryResult,
  CollectionListItem,
  CollectionListPage,
  CollectionPrinting,
  CollectionRecord,
  CollectionSummary,
  ImportPrintingCandidate,
  InventoryExportRow,
  InventoryHistoryPage,
  InventoryImportErrorReportRow,
  InventoryImportErrorReportPage,
  InventoryImportPreview,
  InventoryImportJobStatus,
  InventoryImportPreviewRow,
  InventoryMutationResult,
  InventoryTransaction,
  InventoryTransactionLine,
  InventoryTransactionLinesPage,
  MoneyAmount,
  QuantityBreakdown,
} from "./types";
import { validateFilterGroup } from "@/features/filters/model";

const FINISHES = new Set<string>(CARD_FINISHES);
const CONDITIONS = new Set<string>(CARD_CONDITIONS);
const STATUSES = new Set<string>(RESOURCE_STATUSES);
const TRANSACTION_SOURCES = new Set([
  "manual",
  "csv_import",
  "device",
  "transfer",
  "reversal",
  "admin_correction",
]);
const IMPORT_STATUSES = new Set(["matched", "ambiguous", "rejected", "excluded"]);
const IMPORT_ERROR_STATUSES = new Set(["ambiguous", "rejected"]);
const JOB_STATUSES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  field_too_long: "One or more source fields exceed the import limits.",
  name_not_found_stable_identity_required:
    "No name suggestion matched. Choose an exact printing or exclude this row.",
  name_requires_manual_review:
    "The name produced suggestions but requires an explicit exact-printing choice.",
  physical_state_invalid: "Finish, condition, or additive quantity is invalid.",
  scryfall_id_invalid: "The explicit Scryfall ID is invalid and did not fall back to other fields.",
  scryfall_id_not_found: "The explicit Scryfall ID does not match an active printing.",
  set_collector_language_ambiguous:
    "Set, collector number, and language matched more than one active printing.",
  set_collector_language_incomplete:
    "Set, collector number, and language must all be supplied together.",
  set_collector_language_not_found:
    "Set, collector number, and language did not match an active printing.",
  stable_identity_required: "Supply a stable identity or explicitly choose an exact printing.",
};
const RICH_IMPORT_ERROR_FIELDS = new Set([
  "candidates",
  "resolved_printing",
  "printing",
  "faces",
  "price",
  "current_price",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}

function uuid(value: unknown): string | null {
  const parsed = string(value);
  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
}

function isoInstant(value: unknown): string | null {
  const raw = string(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function integer(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
}

function signedInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function decimalString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(value);
  }
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  return value;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function finish(value: unknown): CardFinish | null {
  return typeof value === "string" && FINISHES.has(value) ? (value as CardFinish) : null;
}

function condition(value: unknown): CardCondition | null {
  return typeof value === "string" && CONDITIONS.has(value) ? (value as CardCondition) : null;
}

function status(value: unknown): ResourceStatus | null {
  return typeof value === "string" && STATUSES.has(value) ? (value as ResourceStatus) : null;
}

function money(amount: unknown, currency: unknown): MoneyAmount | null {
  const parsedAmount = decimalString(amount);
  const parsedCurrency = string(currency);
  return parsedAmount && parsedCurrency ? { amount: parsedAmount, currency: parsedCurrency } : null;
}

function parseCollectionRecord(
  value: unknown,
  defaultCollectionId: string | null = null,
  workspaceIdFallback: string | null = null,
): CollectionRecord | null {
  const item = record(value);
  if (!item) return null;

  const id = string(item.collection_id ?? item.id);
  const workspaceId = string(item.workspace_id) ?? workspaceIdFallback;
  const name = string(item.name);
  const slug = string(item.slug);
  const parsedStatus = status(item.status);
  const createdAt = string(item.created_at);
  const updatedAt = string(item.updated_at);
  if (!id || !workspaceId || !name || !slug || !parsedStatus || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    workspaceId,
    name,
    slug,
    description: nullableString(item.description),
    coverPrintingId: nullableString(item.cover_printing_id),
    status: parsedStatus,
    isDefault: id === defaultCollectionId,
    createdAt,
    updatedAt,
    archivedAt: nullableString(item.archived_at),
    deletedAt: nullableString(item.deleted_at),
  };
}

function parseBreakdowns(value: unknown, currency: string | null): QuantityBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = record(raw);
    if (!item) return [];
    const key = string(item.key ?? item.finish ?? item.condition);
    const label = string(item.label) ?? key;
    const quantity = integer(item.quantity_total ?? item.quantity);
    const unpricedQuantity = integer(item.unpriced_quantity) ?? 0;
    if (!key || !label || quantity === null) return [];
    return [
      {
        key,
        label,
        quantity,
        unpricedQuantity,
        value: currency ? money(item.estimated_value, currency) : null,
      },
    ];
  });
}

export function parseCollectionSummary(value: unknown): CollectionSummary | null {
  const item = record(value);
  if (!item) return null;
  const totalQuantity = integer(item.quantity_total ?? item.total_quantity);
  const uniquePrintings = integer(item.unique_printings);
  const uniqueCards = integer(item.unique_oracle_cards ?? item.unique_cards);
  const unpricedQuantity = integer(item.unpriced_quantity);
  const stalePricedQuantity = integer(item.stale_quantity ?? item.stale_priced_quantity) ?? 0;
  const currency = nullableString(item.currency);
  if (
    totalQuantity === null ||
    uniquePrintings === null ||
    uniqueCards === null ||
    unpricedQuantity === null
  ) {
    return null;
  }

  const estimated = currency ? money(item.estimated_value, currency) : null;
  const latestTransaction = record(item.latest_transaction);
  return {
    totalQuantity,
    uniquePrintings,
    uniqueCards,
    estimatedValues: estimated ? [estimated] : [],
    priceProviders: strings(item.price_providers),
    unpricedQuantity,
    stalePricedQuantity,
    finishBreakdown: parseBreakdowns(item.by_finish, currency),
    conditionBreakdown: parseBreakdowns(item.by_condition, currency),
    latestTransactionAt:
      nullableString(item.latest_transaction_at) ?? nullableString(latestTransaction?.committed_at),
    oldestPriceObservedAt: nullableString(item.oldest_price_observed_at),
    latestPriceObservedAt: nullableString(item.latest_price_observed_at),
    oldestPriceIngestedAt: nullableString(item.oldest_price_ingested_at),
    latestPriceIngestedAt: nullableString(item.latest_price_ingested_at),
  };
}

export function parseCollectionListPage(
  value: unknown,
  defaultCollectionId: string | null = null,
): CollectionListPage | null {
  const page = record(value);
  const workspaceId = string(page?.workspace_id);
  const permissions = record(page?.permissions);
  const canCreate = boolean(permissions?.can_create);
  if (!page || !workspaceId || canCreate === null || !Array.isArray(page.items)) {
    return null;
  }

  const items: CollectionListItem[] = [];
  for (const raw of page.items) {
    const item = record(raw);
    const collection = parseCollectionRecord(raw, defaultCollectionId, workspaceId);
    if (!item || !collection) return null;
    const totalQuantity = integer(item.quantity_total);
    const uniquePrintings = integer(item.unique_printings);
    const unpricedQuantity = integer(item.unpriced_quantity);
    const itemPermissions = record(item.permissions);
    const canEdit = boolean(itemPermissions?.can_edit);
    const canArchive = boolean(itemPermissions?.can_archive);
    const canDelete = boolean(itemPermissions?.can_delete);
    if (
      totalQuantity === null ||
      uniquePrintings === null ||
      unpricedQuantity === null ||
      canEdit === null ||
      canArchive === null ||
      canDelete === null
    ) {
      return null;
    }
    items.push({
      ...collection,
      permissions: { canEdit, canArchive, canDelete },
      totalQuantity,
      uniquePrintings,
      estimatedValue: money(item.estimated_value, item.currency),
      priceProviders: strings(item.price_providers),
      unpricedQuantity,
      latestTransactionAt: nullableString(item.latest_transaction_at),
    });
  }

  return {
    workspaceId,
    permissions: { canCreate },
    items,
    nextCursor: nullableString(page.next_cursor),
    hasMore: boolean(page.has_more) ?? Boolean(page.next_cursor),
  };
}

export function parseCollectionDetail(
  value: unknown,
  defaultCollectionId: string | null = null,
): CollectionDetail | null {
  const detail = record(value);
  const collection = parseCollectionRecord(detail?.collection, defaultCollectionId);
  const permissions = record(detail?.permissions);
  const summary = parseCollectionSummary(detail?.summary);
  const canEdit = boolean(permissions?.can_edit);
  const canArchive = boolean(permissions?.can_archive);
  const canDelete = boolean(permissions?.can_delete);
  if (
    !detail ||
    !collection ||
    !summary ||
    canEdit === null ||
    canArchive === null ||
    canDelete === null
  ) {
    return null;
  }
  return {
    collection,
    permissions: { canEdit, canArchive, canDelete },
    summary,
  };
}

function parsePrice(value: unknown): PriceObservation | null {
  const item = record(value);
  if (!item) return null;
  const provider = string(item.provider);
  const currency = string(item.currency);
  const parsedFinish = finish(item.finish);
  const amount = decimalString(item.amount);
  const observedAt = string(item.observed_at);
  const ingestedAt = string(item.ingested_at);
  if (!provider || !currency || !parsedFinish || !amount || !observedAt || !ingestedAt) {
    return null;
  }
  return {
    provider,
    currency,
    finish: parsedFinish,
    amount,
    observedAt,
    ingestedAt,
    staleAfter: nullableString(item.stale_after),
  };
}

function parsePrinting(value: unknown): CollectionPrinting | null {
  const item = record(value);
  if (!item) return null;
  const set = record(item.set);
  const printingId = string(item.printing_id ?? item.id);
  const name = string(item.display_name ?? item.card_name ?? item.name);
  const setId = string(item.set_id ?? set?.id);
  const setCode = string(item.set_code ?? set?.code);
  const setName = string(item.set_name ?? set?.name);
  const collectorNumber = string(item.collector_number);
  const language = string(item.language);
  const parsedFinishes = strings(item.finishes ?? item.available_finishes)
    .map(finish)
    .filter((entry): entry is CardFinish => entry !== null);
  if (
    !printingId ||
    !name ||
    !setId ||
    !setCode ||
    !setName ||
    !collectorNumber ||
    !language ||
    parsedFinishes.length === 0
  ) {
    return null;
  }
  const faces = Array.isArray(item.faces) ? item.faces.map(record).filter(Boolean) : [];
  const firstFace = faces[0];
  return {
    printingId,
    cardId: nullableString(item.card_id ?? item.oracle_id),
    name,
    printedName: nullableString(item.printed_name),
    setId,
    setCode,
    setName,
    collectorNumber,
    language,
    rarity: nullableString(item.rarity),
    colors: strings(item.colors),
    colorIdentity: strings(item.color_identity),
    typeLine: nullableString(item.type_line),
    releasedAt: nullableString(item.released_at),
    availableFinishes: parsedFinishes,
    imageSmallUri:
      nullableString(item.image_small_uri) ?? nullableString(firstFace?.image_small_uri),
    imageNormalUri:
      nullableString(item.image_normal_uri) ?? nullableString(firstFace?.image_normal_uri),
    active: boolean(item.active) ?? true,
  };
}

export function parseCollectionInventoryResult(value: unknown): CollectionInventoryResult | null {
  const page = record(value);
  const collectionId = string(page?.collection_id);
  const currency = string(page?.currency);
  if (!page || !collectionId || !currency || !Array.isArray(page.items)) return null;

  const balances = [];
  for (const raw of page.items) {
    const item = record(raw);
    const printing = parsePrinting(item?.printing);
    const parsedFinish = finish(item?.finish);
    const parsedCondition = condition(item?.condition);
    const quantity = integer(item?.quantity);
    const updatedAt = string(item?.updated_at);
    const lastTransactionId = uuid(item?.last_transaction_id);
    if (
      !item ||
      !printing ||
      !parsedFinish ||
      !parsedCondition ||
      quantity === null ||
      !updatedAt ||
      !lastTransactionId
    ) {
      return null;
    }
    const unit = parsePrice(item.current_price);
    const totalAmount = decimalString(item.total_estimate);
    balances.push({
      collectionId,
      printing,
      finish: parsedFinish,
      condition: parsedCondition,
      quantity,
      updatedAt,
      lastTransactionId,
      price: {
        unit,
        total: totalAmount ? { amount: totalAmount, currency } : null,
      },
    });
  }

  return {
    collectionId,
    currency,
    balances,
    nextCursor: nullableString(page.next_cursor),
    resultCount: balances.length,
    totalCount: integer(page.total_count),
    hasMore: boolean(page.has_more) ?? Boolean(page.next_cursor),
  };
}

function groupLabel(
  group: AnalyticalGroup["group"],
  key: string | string[],
  item: Record<string, unknown>,
): string {
  const supplied = string(item.label ?? item.name ?? item.set_name);
  if (supplied) return supplied;
  if (Array.isArray(key)) return key.length ? key.join("") : "Colorless";
  const labels: Record<string, string> = {
    nonfoil: "Nonfoil",
    foil: "Foil",
    etched: "Etched",
    near_mint: "Near mint",
    lightly_played: "Lightly played",
    moderately_played: "Moderately played",
    heavily_played: "Heavily played",
    damaged: "Damaged",
  };
  return labels[key] ?? (group === "set" ? key.toUpperCase() : key.replaceAll("_", " "));
}

function parseAnalyticsGroups(
  value: unknown,
  group: AnalyticalGroup["group"],
): AnalyticalGroup[] | null {
  if (!Array.isArray(value)) return null;
  const groups: AnalyticalGroup[] = [];
  for (const raw of value) {
    const item = record(raw);
    if (!item) return null;
    const arrayKey =
      group === "color"
        ? strings(item.colors ?? item.key)
        : group === "color_identity"
          ? strings(item.color_identity ?? item.key)
          : null;
    const scalarKey =
      string(
        item.key ?? item.set_code ?? item.rarity ?? item.finish ?? item.condition ?? item.tier_code,
      ) ?? (group === "rarity" ? "unknown" : null);
    const key = arrayKey ?? scalarKey;
    const quantity = integer(item.quantity_total);
    const pricedQuantity = integer(item.priced_quantity);
    const unpricedQuantity = integer(item.unpriced_quantity);
    const staleQuantity = integer(item.stale_quantity);
    if (
      key === null ||
      quantity === null ||
      pricedQuantity === null ||
      unpricedQuantity === null ||
      staleQuantity === null
    ) {
      return null;
    }
    groups.push({
      group,
      key,
      label: groupLabel(group, key, item),
      quantity,
      pricedQuantity,
      unpricedQuantity,
      staleQuantity,
      estimatedValue: decimalString(item.estimated_value),
      priceProviders: strings(item.price_providers),
      oldestPriceObservedAt: nullableString(item.oldest_price_observed_at),
      latestPriceObservedAt: nullableString(item.latest_price_observed_at),
      oldestPriceIngestedAt: nullableString(item.oldest_price_ingested_at),
      latestPriceIngestedAt: nullableString(item.latest_price_ingested_at),
    });
  }
  return groups;
}

export function parseCollectionAnalytics(value: unknown): CollectionAnalytics | null {
  const analytics = record(value);
  const filters = record(analytics?.filters);
  const groups = record(analytics?.groups);
  const collectionId = string(analytics?.collection_id);
  const currency = string(analytics?.currency);
  const expression = validateFilterGroup(filters?.expression).value;
  const quantityTotal = integer(analytics?.quantity_total);
  const pricedQuantity = integer(analytics?.priced_quantity);
  const unpricedQuantity = integer(analytics?.unpriced_quantity);
  const staleQuantity = integer(analytics?.stale_quantity);
  if (
    !analytics ||
    !filters ||
    !groups ||
    !collectionId ||
    !currency ||
    !filters.expression ||
    (filters.query !== null && string(filters.query) === null) ||
    quantityTotal === null ||
    pricedQuantity === null ||
    unpricedQuantity === null ||
    staleQuantity === null
  ) {
    return null;
  }
  const parsedGroups = {
    sets: parseAnalyticsGroups(groups.sets, "set"),
    colors: parseAnalyticsGroups(groups.colors, "color"),
    colorIdentities: parseAnalyticsGroups(groups.color_identities, "color_identity"),
    rarities: parseAnalyticsGroups(groups.rarities, "rarity"),
    finishes: parseAnalyticsGroups(groups.finishes, "finish"),
    conditions: parseAnalyticsGroups(groups.conditions, "condition"),
    valueTiers: parseAnalyticsGroups(groups.value_tiers, "value_tier"),
  };
  if (Object.values(parsedGroups).some((group) => group === null)) return null;
  return {
    collectionId,
    currency,
    filters: {
      query: nullableString(filters.query),
      expression,
    },
    quantityTotal,
    pricedQuantity,
    unpricedQuantity,
    staleQuantity,
    estimatedValue: decimalString(analytics.estimated_value),
    priceProviders: strings(analytics.price_providers),
    oldestPriceObservedAt: nullableString(analytics.oldest_price_observed_at),
    latestPriceObservedAt: nullableString(analytics.latest_price_observed_at),
    oldestPriceIngestedAt: nullableString(analytics.oldest_price_ingested_at),
    latestPriceIngestedAt: nullableString(analytics.latest_price_ingested_at),
    groups: parsedGroups as CollectionAnalytics["groups"],
  };
}

function parseTransactionLine(
  value: unknown,
  transactionId: string,
): InventoryTransactionLine | null {
  const item = record(value);
  const lineNumber = integer(item?.line_number, 1);
  const id =
    string(item?.line_id ?? item?.id) ??
    (lineNumber === null ? null : `${transactionId}:${lineNumber}`);
  const printingId = string(item?.printing_id);
  const name = string(item?.display_name ?? item?.name) ?? "Unknown printing";
  const setCode = string(item?.set_code) ?? "—";
  const collectorNumber = string(item?.collector_number) ?? "—";
  const language = string(item?.language) ?? "—";
  const parsedFinish = finish(item?.finish);
  const parsedCondition = condition(item?.condition);
  const quantityDelta = signedInteger(item?.quantity_delta);
  const quantityBefore = integer(item?.quantity_before);
  const quantityAfter = integer(item?.quantity_after);
  if (
    !item ||
    !id ||
    lineNumber === null ||
    !printingId ||
    !parsedFinish ||
    !parsedCondition ||
    quantityDelta === null ||
    quantityDelta === 0 ||
    quantityBefore === null ||
    quantityAfter === null
  ) {
    return null;
  }
  return {
    id,
    lineNumber,
    printingId,
    name,
    setCode,
    collectorNumber,
    language,
    finish: parsedFinish,
    condition: parsedCondition,
    quantityDelta,
    quantityBefore,
    quantityAfter,
  };
}

function parseTransaction(
  value: unknown,
  collectionIdFallback: string,
): InventoryTransaction | null {
  const item = record(value);
  const id = string(item?.transaction_id ?? item?.id);
  const collectionId = string(item?.collection_id) ?? collectionIdFallback;
  const source = string(item?.source);
  const occurredAt = string(item?.occurred_at);
  const committedAt = string(item?.committed_at);
  const lineCount = integer(item?.line_count, 1);
  const linesTruncated = boolean(item?.lines_truncated);
  if (
    !item ||
    !id ||
    !collectionId ||
    !source ||
    !TRANSACTION_SOURCES.has(source) ||
    !occurredAt ||
    !committedAt ||
    lineCount === null ||
    linesTruncated === null ||
    !Array.isArray(item.lines)
  ) {
    return null;
  }
  const lines = item.lines.map((line) => parseTransactionLine(line, id));
  if (
    lines.some((line) => line === null) ||
    lines.length > lineCount ||
    linesTruncated !== lineCount > lines.length
  ) {
    return null;
  }
  const actorUserId = nullableString(item.actor_user_id);
  const deviceId = nullableString(item.device_id);
  const reversal = source === "reversal";
  const alreadyReversed = Boolean(item.reversed_by_transaction_id);
  return {
    id,
    collectionId,
    source: source as InventoryTransaction["source"],
    actorLabel:
      string(item.actor_label) ??
      (actorUserId
        ? `User ${actorUserId.slice(0, 8)}`
        : deviceId
          ? `Device ${deviceId.slice(0, 8)}`
          : "System"),
    actorKind: actorUserId ? "user" : deviceId ? "device" : "system",
    occurredAt,
    committedAt,
    note: nullableString(item.note),
    externalReference: nullableString(item.external_reference),
    idempotencyReference: nullableString(item.idempotency_reference),
    reversesTransactionId: nullableString(item.reverses_transaction_id),
    reversedByTransactionId: nullableString(item.reversed_by_transaction_id),
    transferGroupId: nullableString(item.transfer_group_id),
    pairedTransactionId: nullableString(item.paired_transaction_id),
    reversible: boolean(item.reversible) ?? (!reversal && !alreadyReversed),
    lineCount,
    linesTruncated,
    lines: lines as InventoryTransactionLine[],
  };
}

export function parseInventoryHistoryPage(
  value: unknown,
  collection: CollectionRecord,
): InventoryHistoryPage | null {
  const page = record(value);
  if (!page || string(page.collection_id) !== collection.id || !Array.isArray(page.items)) {
    return null;
  }
  const transactions = page.items.map((transaction) =>
    parseTransaction(transaction, collection.id),
  );
  if (transactions.some((transaction) => transaction === null)) return null;
  return {
    collection,
    transactions: transactions as InventoryTransaction[],
    nextCursor: nullableString(page.next_cursor),
  };
}

export function parseInventoryTransactionLinesPage(
  value: unknown,
): InventoryTransactionLinesPage | null {
  const page = record(value);
  const transactionId = string(page?.transaction_id);
  const collectionId = string(page?.collection_id);
  const lineCount = integer(page?.line_count, 1);
  const afterLineNumber = integer(page?.after_line_number) ?? 0;
  const hasMore = boolean(page?.has_more);
  const nextAfterLineNumber =
    page?.next_after_line_number === null || page?.next_after_line_number === undefined
      ? null
      : integer(page.next_after_line_number, 1);
  if (
    !page ||
    !transactionId ||
    !collectionId ||
    lineCount === null ||
    hasMore === null ||
    !Array.isArray(page.items) ||
    (hasMore && nextAfterLineNumber === null) ||
    (!hasMore && nextAfterLineNumber !== null)
  ) {
    return null;
  }
  const lines = page.items.map((line) => parseTransactionLine(line, transactionId));
  if (
    lines.some((line) => line === null) ||
    lines.length > lineCount ||
    (nextAfterLineNumber !== null && nextAfterLineNumber <= afterLineNumber)
  ) {
    return null;
  }
  return {
    transactionId,
    collectionId,
    lineCount,
    afterLineNumber,
    lines: lines as InventoryTransactionLine[],
    nextAfterLineNumber,
    hasMore,
  };
}

function parseImportCandidate(value: unknown): ImportPrintingCandidate | null {
  const printing = parsePrinting(value);
  return printing
    ? {
        printingId: printing.printingId,
        name: printing.name,
        setCode: printing.setCode,
        collectorNumber: printing.collectorNumber,
        language: printing.language,
        availableFinishes: printing.availableFinishes,
        imageSmallUri: printing.imageSmallUri,
        active: printing.active,
      }
    : null;
}

export function parseImportPreviewRow(value: unknown): InventoryImportPreviewRow | null {
  const item = record(value);
  const raw = record(item?.raw) ?? {};
  const rowNumber = integer(item?.row_number, 1);
  const rawStatus = string(item?.status);
  const parsedFinish = finish(item?.finish ?? raw.finish);
  const parsedCondition = condition(item?.condition ?? raw.condition);
  const quantity = integer(item?.quantity ?? raw.quantity, 1);
  if (!item || rowNumber === null || !rawStatus || !IMPORT_STATUSES.has(rawStatus)) {
    return null;
  }
  const resolved = parseImportCandidate(item.resolved_printing);
  const candidates = Array.isArray(item.candidates)
    ? item.candidates
        .map(parseImportCandidate)
        .filter((entry): entry is ImportPrintingCandidate => Boolean(entry))
    : [];
  const suggestedIds = strings(item.suggested_printing_ids);
  const errorCode = nullableString(item.error_code);
  return {
    rowNumber,
    scryfallId: nullableString(raw.scryfall_id ?? item.scryfall_id),
    oracleId: nullableString(raw.oracle_id ?? item.oracle_id),
    name: nullableString(raw.name ?? item.name),
    setCode: nullableString(raw.set_code ?? item.set_code),
    collectorNumber: nullableString(raw.collector_number ?? item.collector_number),
    language: nullableString(raw.language ?? item.language),
    finish: parsedFinish && parsedFinish !== "unknown" ? parsedFinish : null,
    condition: parsedCondition && parsedCondition !== "unknown" ? parsedCondition : null,
    quantity,
    strategy: raw.scryfall_id || item.scryfall_id ? "scryfall_id" : "set_collector_language",
    errorCode,
    errorMessage: safeImportErrorMessage(errorCode),
    status: rawStatus as InventoryImportPreviewRow["status"],
    included: rawStatus === "matched",
    proposedPrintingId: resolved?.printingId ?? null,
    proposedPrinting: resolved,
    candidates,
    suggestion:
      nullableString(item.suggestion) ??
      (suggestedIds.length ? `Suggested printing IDs: ${suggestedIds.join(", ")}` : null),
  };
}

function safeImportErrorMessage(errorCode: string | null): string | null {
  return errorCode
    ? (IMPORT_ERROR_MESSAGES[errorCode] ?? "This row requires review before it can be included.")
    : null;
}

export function parseImportErrorReportRow(value: unknown): InventoryImportErrorReportRow | null {
  const item = record(value);
  const raw = record(item?.raw);
  const rowNumber = integer(item?.row_number, 1);
  const rawStatus = string(item?.status);
  if (
    !item ||
    !raw ||
    rowNumber === null ||
    !rawStatus ||
    !IMPORT_ERROR_STATUSES.has(rawStatus) ||
    Object.keys(item).some((key) => RICH_IMPORT_ERROR_FIELDS.has(key))
  ) {
    return null;
  }
  const errorCode = nullableString(item.error_code);
  return {
    rowNumber,
    status: rawStatus as InventoryImportErrorReportRow["status"],
    errorCode,
    errorMessage: safeImportErrorMessage(errorCode),
    suggestion: nullableString(item.suggestion),
    raw: {
      scryfallId: nullableString(raw.scryfall_id),
      setCode: nullableString(raw.set_code),
      collectorNumber: nullableString(raw.collector_number),
      language: nullableString(raw.language),
      name: nullableString(raw.name),
      finish: nullableString(raw.finish),
      condition: nullableString(raw.condition),
      quantity: nullableString(raw.quantity),
    },
  };
}

export function parseInventoryImportPreview(value: unknown): InventoryImportPreview | null {
  const preview = record(value);
  const job = record(preview?.job);
  const counts = record(preview?.counts);
  const jobId = string(job?.import_job_id ?? job?.id);
  const collectionId = string(job?.collection_id);
  const jobStatus = string(job?.status);
  const createdAt = isoInstant(job?.created_at);
  const rawStagingCompletedAt = job?.staging_completed_at;
  const stagingCompletedAt =
    rawStagingCompletedAt === null || rawStagingCompletedAt === undefined
      ? null
      : isoInstant(rawStagingCompletedAt);
  const originalFilename = string(job?.original_filename);
  const parserVersion = string(job?.parser_version);
  const sourceSha256 = string(job?.file_sha256 ?? job?.source_sha256);
  if (
    !preview ||
    !job ||
    !counts ||
    !jobId ||
    !collectionId ||
    !jobStatus ||
    !JOB_STATUSES.has(jobStatus) ||
    !createdAt ||
    (rawStagingCompletedAt !== null &&
      rawStagingCompletedAt !== undefined &&
      !stagingCompletedAt) ||
    (jobStatus === "queued" && stagingCompletedAt !== null) ||
    (jobStatus === "succeeded" && stagingCompletedAt === null) ||
    !originalFilename ||
    !parserVersion ||
    !sourceSha256 ||
    !Array.isArray(preview.items)
  ) {
    return null;
  }
  const rows = preview.items.map(parseImportPreviewRow);
  if (rows.some((row) => row === null)) return null;
  const total = integer(counts.total ?? counts.row_count) ?? rows.length;
  const matched = integer(counts.matched) ?? 0;
  const ambiguous = integer(counts.ambiguous) ?? 0;
  const rejected = integer(counts.rejected) ?? 0;
  const excluded = integer(counts.excluded) ?? 0;
  const afterRowNumber = integer(preview.after_row_number) ?? 0;
  const previousAfterRowNumber =
    afterRowNumber > 0 ? integer(preview.previous_after_row_number) : null;
  const hasMore = boolean(preview.has_more) ?? false;
  const explicitNext = integer(preview.next_after_row_number);
  const nextAfterRowNumber = hasMore ? (explicitNext ?? rows.at(-1)?.rowNumber ?? null) : null;
  if (
    (hasMore && nextAfterRowNumber === null) ||
    (afterRowNumber > 0 && previousAfterRowNumber === null)
  ) {
    return null;
  }
  return {
    jobId,
    collectionId,
    status: jobStatus as InventoryImportJobStatus,
    createdAt,
    stagingCompletedAt,
    originalFilename,
    parserVersion,
    sourceSha256,
    storagePath: nullableString(job.storage_path),
    rows: rows as InventoryImportPreviewRow[],
    afterRowNumber,
    previousAfterRowNumber,
    nextAfterRowNumber,
    hasMore,
    counts: { total, matched, ambiguous, rejected, excluded },
    canCommit:
      jobStatus === "running" && stagingCompletedAt !== null && matched > 0 && ambiguous === 0,
  };
}

export function parseInventoryImportErrorReportPage(
  value: unknown,
): InventoryImportErrorReportPage | null {
  const page = record(value);
  const items = page?.items;
  if (!page || !Array.isArray(items) || items.length > 500) return null;
  const rows = items.map(parseImportErrorReportRow);
  if (rows.some((row) => row === null)) return null;
  const parsedRows = rows as InventoryImportErrorReportRow[];
  const afterRowNumber = integer(page.after_row_number);
  const previousAfterRowNumber =
    page.previous_after_row_number === null ? null : integer(page.previous_after_row_number);
  const hasMore = boolean(page.has_more);
  const nextAfterRowNumber =
    page.next_after_row_number === null ? null : integer(page.next_after_row_number, 1);
  if (
    afterRowNumber === null ||
    hasMore === null ||
    (hasMore && nextAfterRowNumber === null) ||
    (!hasMore && nextAfterRowNumber !== null) ||
    (afterRowNumber === 0 && previousAfterRowNumber !== null) ||
    (afterRowNumber > 0 &&
      (previousAfterRowNumber === null || previousAfterRowNumber >= afterRowNumber)) ||
    (nextAfterRowNumber !== null &&
      (nextAfterRowNumber <= afterRowNumber ||
        nextAfterRowNumber !== parsedRows.at(-1)?.rowNumber)) ||
    parsedRows.some(
      (row, index) =>
        row.rowNumber <= afterRowNumber ||
        (index > 0 && row.rowNumber <= parsedRows[index - 1]!.rowNumber),
    )
  ) {
    return null;
  }
  return {
    rows: parsedRows,
    afterRowNumber,
    previousAfterRowNumber,
    nextAfterRowNumber,
    hasMore,
  };
}

export interface InventoryImportCreateResult {
  importJobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  storageBucket: "inventory-imports";
  storagePath: string;
  maxFileBytes: number;
  maxRows: number;
  purgeAfter: string;
  stagingCompletedAt: string | null;
  replayed: boolean;
}

export function parseInventoryImportCreate(value: unknown): InventoryImportCreateResult | null {
  const item = record(value);
  const importJobId = string(item?.import_job_id);
  const parsedStatus = string(item?.status);
  const storageBucket = string(item?.storage_bucket);
  const storagePath = string(item?.storage_path);
  const maxFileBytes = integer(item?.max_file_bytes, 1);
  const maxRows = integer(item?.max_rows, 1);
  const purgeAfter = string(item?.purge_after);
  const rawStagingCompletedAt = item?.staging_completed_at;
  const stagingCompletedAt =
    rawStagingCompletedAt === null || rawStagingCompletedAt === undefined
      ? null
      : isoInstant(rawStagingCompletedAt);
  const replayed = boolean(item?.replayed);
  if (
    !item ||
    !importJobId ||
    !parsedStatus ||
    !JOB_STATUSES.has(parsedStatus) ||
    storageBucket !== "inventory-imports" ||
    !storagePath ||
    maxFileBytes === null ||
    maxRows === null ||
    !purgeAfter ||
    (rawStagingCompletedAt !== null &&
      rawStagingCompletedAt !== undefined &&
      !stagingCompletedAt) ||
    (parsedStatus === "queued" && stagingCompletedAt !== null) ||
    (parsedStatus === "succeeded" && stagingCompletedAt === null) ||
    replayed === null
  ) {
    return null;
  }
  return {
    importJobId,
    status: parsedStatus as InventoryImportCreateResult["status"],
    storageBucket,
    storagePath,
    maxFileBytes,
    maxRows,
    purgeAfter,
    stagingCompletedAt,
    replayed,
  };
}

export function parseInventoryMutationResult(value: unknown): InventoryMutationResult | null {
  const result = record(value);
  const transactionId = string(result?.transaction_id);
  const committedAt = string(result?.committed_at);
  const replayed = boolean(result?.replayed);
  if (
    !result ||
    !transactionId ||
    !committedAt ||
    replayed === null ||
    !Array.isArray(result.lines)
  ) {
    return null;
  }
  const lines = result.lines.flatMap((raw) => {
    const item = record(raw);
    const printingId = string(item?.printing_id);
    const parsedFinish = finish(item?.finish);
    const parsedCondition = condition(item?.condition);
    const quantityBefore = integer(item?.quantity_before);
    const quantityAfter = integer(item?.quantity_after);
    return item &&
      printingId &&
      parsedFinish &&
      parsedCondition &&
      quantityBefore !== null &&
      quantityAfter !== null
      ? [
          {
            printingId,
            finish: parsedFinish,
            condition: parsedCondition,
            quantityBefore,
            quantityAfter,
          },
        ]
      : [];
  });
  if (lines.length !== result.lines.length) return null;
  return { transactionId, committedAt, replayed, lines };
}

export interface InventoryExportPage {
  collectionId: string;
  items: InventoryExportRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function parseInventoryExportPage(value: unknown): InventoryExportPage | null {
  const page = record(value);
  const collectionId = string(page?.collection_id);
  if (!page || !collectionId || !Array.isArray(page.items)) return null;
  const items: InventoryExportRow[] = [];
  for (const raw of page.items) {
    const item = record(raw);
    const scryfallId = nullableString(item?.scryfall_id);
    const name = string(item?.display_name ?? item?.name ?? item?.printed_name ?? item?.card_name);
    const setCode = string(item?.set_code);
    const collectorNumber = string(item?.collector_number);
    const language = string(item?.language);
    const parsedFinish = finish(item?.finish);
    const parsedCondition = condition(item?.condition);
    const quantity = integer(item?.quantity, 1);
    if (
      !item ||
      !name ||
      !setCode ||
      !collectorNumber ||
      !language ||
      !parsedFinish ||
      !parsedCondition ||
      quantity === null
    ) {
      return null;
    }
    const rawPrice = record(item.price ?? item.current_price);
    const amount = decimalString(rawPrice?.amount);
    const provider = string(rawPrice?.provider);
    const currency = string(rawPrice?.currency);
    const observedAt = string(rawPrice?.observed_at);
    const ingestedAt = string(rawPrice?.ingested_at);
    const price =
      amount && provider && currency && observedAt && ingestedAt
        ? {
            amount,
            provider,
            currency,
            observedAt,
            ingestedAt,
            staleAfter: nullableString(rawPrice?.stale_after),
          }
        : null;
    items.push({
      scryfallId,
      oracleId: nullableString(item.scryfall_oracle_id ?? item.oracle_id ?? item.oracle_card_id),
      name,
      setCode,
      collectorNumber,
      language,
      finish: parsedFinish,
      condition: parsedCondition,
      quantity,
      price,
    });
  }
  const nextCursor = nullableString(page.next_cursor);
  const hasMore = boolean(page.has_more) ?? Boolean(nextCursor);
  if (hasMore !== Boolean(nextCursor)) return null;
  return {
    collectionId,
    items,
    nextCursor,
    hasMore,
  };
}
