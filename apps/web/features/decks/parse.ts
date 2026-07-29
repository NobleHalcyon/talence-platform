import {
  DECK_ZONES,
  RESOURCE_STATUSES,
  type CardFinish,
  type DeckZone,
  type PriceObservation,
  type ResourceStatus,
} from "@talence/domain";

import type {
  DeckCardIdentity,
  DeckCardPrintingsPage,
  DeckCatalogSearchPage,
  DeckCollectionSource,
  DeckDetail,
  DeckEntry,
  DeckFormat,
  DeckImportResolution,
  DeckImportResolutionItem,
  DeckListItem,
  DeckListPage,
  DeckOwnershipLine,
  DeckPermissions,
  DeckPrintingChoice,
  DeckValidationIssue,
} from "./types";

const ZONES = new Set<string>(DECK_ZONES);
const STATUSES = new Set<string>(RESOURCE_STATUSES);
const FINISHES = new Set<string>(["nonfoil", "foil", "etched"]);
const SEVERITIES = new Set(["error", "warning", "information", "info"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,2048}$/;
const FORMAT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const DEFAULT_ALLOCATION_ORDER: DeckZone[] = ["commander", "companion", "mainboard", "sideboard"];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uuidString(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function timestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null;
  }
  return value;
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return timestamp(value) ?? undefined;
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return uuidString(value) ?? undefined;
}

function cursor(value: unknown): string | null {
  return typeof value === "string" && CURSOR_PATTERN.test(value) ? value : null;
}

function optionalCursor(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return cursor(value) ?? undefined;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return string(value) ?? undefined;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function integer(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return null;
}

function optionalNumeric(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return numeric(value) ?? undefined;
}

function decimal(value: unknown): string | null {
  const parsed = numeric(value);
  return parsed === null ? null : String(value);
}

function optionalDecimal(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return decimal(value) ?? undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function strictStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    ? value
    : null;
}

function optionalInteger(value: unknown, minimum = 0): number | null | undefined {
  if (value === null || value === undefined) return null;
  return integer(value, minimum) ?? undefined;
}

function status(value: unknown): ResourceStatus | null {
  return typeof value === "string" && STATUSES.has(value) ? (value as ResourceStatus) : null;
}

function zone(value: unknown): DeckZone | null {
  return typeof value === "string" && ZONES.has(value) ? (value as DeckZone) : null;
}

function finish(value: unknown): Exclude<CardFinish, "unknown"> | null {
  return typeof value === "string" && FINISHES.has(value)
    ? (value as Exclude<CardFinish, "unknown">)
    : null;
}

function optionalFinish(value: unknown): Exclude<CardFinish, "unknown"> | null | undefined {
  if (value === null || value === undefined) return null;
  return finish(value) ?? undefined;
}

function optionalPrice(
  value: unknown,
  preferredFinish?: Exclude<CardFinish, "unknown"> | null,
): PriceObservation | null | undefined {
  if (value === null || value === undefined) return null;
  const item = record(value);
  if (!item) return undefined;
  const amount = decimal(item.amount);
  const provider = string(item.provider);
  const currency = string(item.currency);
  const parsedFinish = finish(item.finish) ?? preferredFinish ?? null;
  const observedAt = timestamp(item.observed_at);
  const ingestedAt = timestamp(item.ingested_at);
  const staleAfter = optionalTimestamp(item.stale_after);
  if (
    !amount ||
    !provider ||
    !currency ||
    !parsedFinish ||
    !observedAt ||
    !ingestedAt ||
    staleAfter === undefined
  ) {
    return undefined;
  }
  return {
    amount,
    provider,
    currency,
    finish: parsedFinish,
    observedAt,
    ingestedAt,
    staleAfter,
  } satisfies PriceObservation;
}

function rulesVersion(value: unknown): string | null {
  const item = record(value);
  const nestedRules = record(item?.rules);
  return (
    string(item?.version_key) ??
    string(item?.rules_version) ??
    (typeof item?.version === "number" && Number.isSafeInteger(item.version)
      ? String(item.version)
      : null) ??
    string(nestedRules?.version_key) ??
    (typeof nestedRules?.version === "number" && Number.isSafeInteger(nestedRules.version)
      ? String(nestedRules.version)
      : null) ??
    string(value) ??
    (typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null)
  );
}

function parseFormat(value: unknown): DeckFormat | null {
  const item = record(value);
  if (!item) return null;
  const latest = record(item.latest_version) ?? record(item.rules) ?? item;
  const rules = record(latest.rules) ?? latest;
  const code = string(item.code ?? item.format_code);
  const name = string(item.name ?? item.format_name);
  const formatVersionId = uuidString(
    latest.format_version_id ?? latest.id ?? item.format_version_id,
  );
  const version = integer(latest.version, 1);
  const versionKey = string(latest.version_key ?? latest.rules_version);
  const effectiveAt = timestamp(latest.effective_at);
  const minimumDeckSize = integer(rules.minimum_deck_size);
  const maximumDeckSize = optionalInteger(rules.maximum_deck_size);
  const minimumMainDeck = integer(rules.minimum_mainboard);
  const maximumMainDeck = optionalInteger(rules.maximum_mainboard);
  const sideboardMaximum = optionalInteger(rules.sideboard_max);
  const copyLimit = optionalInteger(rules.default_copy_limit, 1);
  const minimumCommander = integer(rules.minimum_commander);
  const maximumCommander = integer(rules.maximum_commander);
  const companionMaximum = integer(rules.companion_max);
  const companionConsumesSideboard = boolean(rules.companion_consumes_sideboard);
  const enforceColorIdentity = boolean(rules.enforce_color_identity);
  const legalityFormatCode = string(rules.legality_format_code);
  const restrictedCopyLimit = integer(rules.restricted_copy_limit, 1);
  const scopeNote = string(rules.scope_note);
  const active = boolean(item.active);
  if (
    !code ||
    !FORMAT_CODE_PATTERN.test(code) ||
    !name ||
    !formatVersionId ||
    version === null ||
    !versionKey ||
    !effectiveAt ||
    minimumDeckSize === null ||
    maximumDeckSize === undefined ||
    minimumMainDeck === null ||
    maximumMainDeck === undefined ||
    sideboardMaximum === undefined ||
    copyLimit === undefined ||
    minimumCommander === null ||
    maximumCommander === null ||
    companionMaximum === null ||
    companionConsumesSideboard === null ||
    enforceColorIdentity === null ||
    !legalityFormatCode ||
    restrictedCopyLimit === null ||
    !scopeNote ||
    active === null
  ) {
    return null;
  }
  return {
    code,
    name,
    formatVersionId,
    version,
    versionKey,
    rulesVersion: versionKey,
    effectiveAt,
    minimumDeckSize,
    maximumDeckSize,
    minimumMainDeck,
    maximumMainDeck,
    maximumSideboard: sideboardMaximum,
    defaultCopyLimit: copyLimit,
    minimumCommanderCount: minimumCommander,
    maximumCommanderCount: maximumCommander,
    maximumCompanionCount: companionMaximum,
    companionConsumesSideboard,
    enforceCommanderColorIdentity: enforceColorIdentity,
    legalityFormatCode,
    restrictedCopyLimit,
    scopeNote,
    active,
  };
}

export function parseDeckFormatsResponse(value: unknown): DeckFormat[] | null {
  const response = record(value);
  if (!response || !Array.isArray(response.formats)) return null;
  const formats = response.formats.map((item) => parseFormat(item));
  if (
    formats.some((item) => item === null) ||
    new Set(formats.map((item) => item?.code)).size !== formats.length ||
    new Set(formats.map((item) => item?.formatVersionId)).size !== formats.length
  ) {
    return null;
  }
  return formats as DeckFormat[];
}

function sameFormat(left: DeckFormat, right: DeckFormat): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function permissions(value: unknown): DeckPermissions | null {
  const item = record(value);
  const canEdit = boolean(item?.can_edit);
  const canArchive = boolean(item?.can_archive);
  const canRestore = boolean(item?.can_restore);
  const canDelete = boolean(item?.can_delete);
  const canDuplicate = boolean(item?.can_duplicate);
  if (
    canEdit === null ||
    canArchive === null ||
    canRestore === null ||
    canDelete === null ||
    canDuplicate === null
  ) {
    return null;
  }
  return {
    canEdit,
    canArchive,
    canRestore,
    canDelete,
    canDuplicate,
  };
}

function deckRecord(
  value: unknown,
  expected?: {
    deckId?: string;
    workspaceId?: string;
    format?: DeckFormat;
  },
) {
  const item = record(value);
  if (!item) return null;
  const id = uuidString(item.deck_id ?? item.id);
  const workspaceId = uuidString(item.workspace_id);
  const gameId = uuidString(item.game_id);
  const formatCode = string(item.format_code);
  const formatVersionId = uuidString(item.format_version_id);
  const parsedRulesVersion = rulesVersion(item.rules_version_key ?? item.rules_version);
  const name = string(item.name);
  const slug = string(item.slug);
  const parsedStatus = status(item.status);
  const currentRevision = integer(item.current_revision, 1);
  const createdAt = timestamp(item.created_at);
  const updatedAt = timestamp(item.updated_at);
  const archivedAt = optionalTimestamp(item.archived_at);
  const deletedAt = optionalTimestamp(item.deleted_at);
  const coverPrintingId = optionalUuid(item.cover_printing_id);
  const tags = strictStrings(item.tags);
  const description = optionalString(item.description);
  const notes = optionalString(item.notes);
  if (
    !id ||
    !workspaceId ||
    !gameId ||
    !formatCode ||
    !formatVersionId ||
    !parsedRulesVersion ||
    !name ||
    !slug ||
    !parsedStatus ||
    currentRevision === null ||
    !createdAt ||
    !updatedAt ||
    archivedAt === undefined ||
    deletedAt === undefined ||
    coverPrintingId === undefined ||
    !tags ||
    description === undefined ||
    notes === undefined
  ) {
    return null;
  }
  if (
    (expected?.deckId && id !== expected.deckId) ||
    (expected?.workspaceId && workspaceId !== expected.workspaceId) ||
    (expected?.format &&
      (formatCode !== expected.format.code ||
        formatVersionId !== expected.format.formatVersionId ||
        parsedRulesVersion !== expected.format.rulesVersion))
  ) {
    return null;
  }
  if (
    (parsedStatus === "active" && (archivedAt !== null || deletedAt !== null)) ||
    (parsedStatus === "archived" && (!archivedAt || deletedAt !== null)) ||
    (parsedStatus === "deleted" && !deletedAt)
  ) {
    return null;
  }
  return {
    id,
    workspaceId,
    gameId,
    formatCode,
    formatVersionId,
    rulesVersion: parsedRulesVersion,
    name,
    slug,
    description,
    notes,
    tags,
    coverPrintingId,
    status: parsedStatus,
    currentRevision,
    createdAt,
    updatedAt,
    archivedAt,
    deletedAt,
  };
}

export function parseDeckListPage(
  value: unknown,
  expected?: { workspaceId: string; filter: "active" | "archived" | "all" },
): DeckListPage | null {
  const page = record(value);
  const workspaceId = uuidString(page?.workspace_id);
  const pagePermissions = record(page?.permissions);
  const canCreate = boolean(pagePermissions?.can_create);
  if (
    !page ||
    !workspaceId ||
    (expected && workspaceId !== expected.workspaceId) ||
    canCreate === null ||
    !Array.isArray(page.items)
  ) {
    return null;
  }
  const items: DeckListItem[] = [];
  const deckIds = new Set<string>();
  for (const raw of page.items) {
    const item = record(raw);
    const deck = deckRecord(raw, { workspaceId });
    const parsedPermissions = permissions(item?.permissions);
    const entryCount = integer(item?.entry_count);
    const requiredQuantity = integer(item?.required_quantity);
    const maybeboardQuantity = integer(item?.maybeboard_quantity);
    const sourceCount = integer(item?.source_count);
    const missingQuantity = integer(item?.missing_quantity);
    const formatName = string(item?.format_name);
    if (
      !item ||
      !deck ||
      !parsedPermissions ||
      entryCount === null ||
      requiredQuantity === null ||
      maybeboardQuantity === null ||
      sourceCount === null ||
      missingQuantity === null ||
      !formatName
    ) {
      return null;
    }
    if (
      deckIds.has(deck.id) ||
      (expected?.filter === "active" && deck.status !== "active") ||
      (expected?.filter === "archived" && deck.status !== "archived") ||
      (expected?.filter === "all" && deck.status !== "active" && deck.status !== "archived")
    ) {
      return null;
    }
    deckIds.add(deck.id);
    items.push({
      ...deck,
      formatName,
      permissions: parsedPermissions,
      entryCount,
      requiredQuantity,
      maybeboardQuantity,
      sourceCount,
      missingQuantity,
    });
  }
  const nextCursor = optionalCursor(page.next_cursor);
  const hasMore = boolean(page.has_more);
  if (nextCursor === undefined || hasMore === null || hasMore !== Boolean(nextCursor)) {
    return null;
  }
  return {
    workspaceId,
    permissions: { canCreate },
    items,
    nextCursor,
    hasMore,
  };
}

function printingChoice(
  value: unknown,
  preferredFinish?: Exclude<CardFinish, "unknown"> | null,
  expected?: { cardId?: string; currency?: string },
): DeckPrintingChoice | null {
  const item = record(value);
  if (!item) return null;
  const printingId = uuidString(item.printing_id ?? item.id);
  const cardId = expected?.cardId ? uuidString(item.card_id) : null;
  const name = string(item.display_name ?? item.card_name ?? item.name ?? item.printed_name);
  const setCode = string(item.set_code);
  const setName = string(item.set_name);
  const collectorNumber = string(item.collector_number);
  const language = string(item.language);
  const active = boolean(item.active);
  const imageSmallUri = optionalString(item.image_small_uri);
  const imageNormalUri = optionalString(item.image_normal_uri);
  if (
    !printingId ||
    !name ||
    !setCode ||
    !setName ||
    !collectorNumber ||
    !language ||
    active === null ||
    imageSmallUri === undefined ||
    imageNormalUri === undefined ||
    (expected?.cardId && cardId !== expected.cardId)
  ) {
    return null;
  }
  const rawFinishes = Array.isArray(item.finishes) ? item.finishes : [];
  const parsedFinishes = [
    ...strings(item.finishes ?? item.available_finishes),
    ...(string(item.finish) ? [string(item.finish)!] : []),
    ...rawFinishes.flatMap((raw) => {
      const option = record(raw);
      return string(option?.finish) ? [string(option?.finish)!] : [];
    }),
  ]
    .map(finish)
    .filter((item): item is Exclude<CardFinish, "unknown"> => item !== null);
  if (preferredFinish && !parsedFinishes.includes(preferredFinish)) {
    parsedFinishes.push(preferredFinish);
  }
  const finishOptions = [];
  for (const raw of rawFinishes) {
    const option = record(raw);
    const parsedFinish = finish(option?.finish);
    if (!option || !parsedFinish) {
      if (typeof raw === "string" && finish(raw)) continue;
      return null;
    }
    const ownedQuantity = integer(option.owned_quantity);
    const parsedPrice = optionalPrice(option.price, parsedFinish);
    if (
      ownedQuantity === null ||
      parsedPrice === undefined ||
      (parsedPrice && expected?.currency && parsedPrice.currency !== expected.currency)
    ) {
      return null;
    }
    finishOptions.push({
      finish: parsedFinish,
      ownedQuantity,
      price: parsedPrice,
    });
  }
  const parsedPrice = optionalPrice(item.price ?? item.current_price, preferredFinish);
  if (
    parsedPrice === undefined ||
    (parsedPrice && expected?.currency && parsedPrice.currency !== expected.currency)
  ) {
    return null;
  }
  return {
    printingId,
    name,
    setCode,
    setName,
    collectorNumber,
    language,
    imageSmallUri,
    imageNormalUri,
    availableFinishes: [...new Set(parsedFinishes)],
    finishOptions,
    active,
    price: parsedPrice,
  };
}

function source(value: unknown): DeckCollectionSource | null {
  const item = record(value);
  const collectionId = uuidString(item?.collection_id);
  const name = string(item?.name);
  const priority = integer(item?.priority);
  const parsedStatus = status(item?.status);
  if (!item || !collectionId || !name || priority === null || !parsedStatus) return null;
  return {
    collectionId,
    name,
    priority,
    selected: true,
    status: parsedStatus,
  };
}

function cardIdentity(value: Record<string, unknown>, preferred: DeckPrintingChoice | null) {
  const cardId = uuidString(value.card_id);
  const name = string(value.card_name ?? value.name);
  const colorIdentity = strictStrings(value.color_identity);
  const manaCost = optionalString(value.mana_cost);
  const typeLine = optionalString(value.type_line);
  const oracleText = optionalString(value.oracle_text);
  const manaValue = optionalNumeric(value.mana_value);
  if (
    !cardId ||
    !name ||
    !colorIdentity ||
    manaCost === undefined ||
    manaValue === undefined ||
    typeLine === undefined ||
    oracleText === undefined
  ) {
    return null;
  }
  const representative =
    printingChoice(value.default_printing) ??
    printingChoice(value.representative_printing) ??
    preferred;
  const choices = [preferred, representative].filter(
    (item, index, list): item is DeckPrintingChoice =>
      Boolean(item) &&
      list.findIndex((candidate) => candidate?.printingId === item?.printingId) === index,
  );
  return {
    cardId,
    name,
    manaCost,
    manaValue,
    typeLine,
    oracleText,
    colorIdentity,
    representativePrinting: representative,
    printingChoices: choices,
  } satisfies DeckCardIdentity;
}

function ownershipByEntry(value: unknown): Map<string, Record<string, unknown>> | null {
  const response = record(value);
  if (!response || !Array.isArray(response.entries)) return null;
  const result = new Map<string, Record<string, unknown>>();
  for (const raw of response.entries) {
    const item = record(raw);
    const id = uuidString(item?.entry_id);
    if (!item || !id || result.has(id)) return null;
    result.set(id, item);
  }
  return result;
}

function entryOwnership(
  value: Record<string, unknown> | undefined,
  zoneValue: DeckZone,
): DeckOwnershipLine | null {
  if (!value) return null;
  const maybeboardExcluded = boolean(value.maybeboard_excluded);
  const requiredQuantity = integer(value.required_quantity);
  const available = integer(value.available_oracle_quantity);
  const allocated = integer(value.allocated_owned_quantity);
  const missing = integer(value.missing_quantity);
  if (
    maybeboardExcluded === null ||
    maybeboardExcluded !== (zoneValue === "maybeboard") ||
    requiredQuantity === null ||
    available === null ||
    allocated === null ||
    missing === null
  ) {
    return null;
  }
  const preferred = record(value?.preferred_printing);
  const preferredOwned = preferred
    ? (integer(preferred.available_quantity) ?? integer(preferred.owned_quantity))
    : null;
  const preferredAllocated = preferred ? integer(preferred.allocated_quantity) : null;
  const preferredMissing = preferred ? integer(preferred.missing_quantity) : null;
  if (
    preferred &&
    (preferredOwned === null || preferredAllocated === null || preferredMissing === null)
  ) {
    return null;
  }
  return {
    countsTowardRequirement: !maybeboardExcluded,
    requiredQuantity,
    ownedQuantity: available,
    allocatedQuantity: allocated,
    missingQuantity: missing,
    preferredPrintingOwnedQuantity: preferredOwned,
    preferredPrintingAllocatedQuantity: preferredAllocated,
    preferredPrintingMissingQuantity: preferredMissing,
  };
}

function validationDetails(value: unknown) {
  const item = record(value);
  if (!item) return null;
  if (
    Object.values(item).some(
      (field) =>
        field !== null &&
        typeof field !== "string" &&
        typeof field !== "number" &&
        typeof field !== "boolean" &&
        !(Array.isArray(field) && field.every((entry) => typeof entry === "string")),
    )
  ) {
    return null;
  }
  return item as DeckValidationIssue["details"];
}

function parseIssue(value: unknown): DeckValidationIssue | null {
  const item = record(value);
  const code = string(item?.code);
  const rawSeverity = string(item?.severity);
  const message = string(item?.message);
  const details = validationDetails(item?.details);
  const parsedZone = item?.zone === null || item?.zone === undefined ? null : zone(item.zone);
  const cardId = optionalUuid(item?.card_id);
  if (
    !item ||
    !code ||
    !rawSeverity ||
    !SEVERITIES.has(rawSeverity) ||
    !message ||
    !details ||
    cardId === undefined ||
    (item.zone !== null && item.zone !== undefined && !parsedZone)
  ) {
    return null;
  }
  return {
    code,
    severity:
      rawSeverity === "info" ? "information" : (rawSeverity as DeckValidationIssue["severity"]),
    message,
    cardId,
    zone: parsedZone,
    details,
  };
}

function zoneQuantities(entries: DeckEntry[]): Record<DeckZone, number> {
  const result: Record<DeckZone, number> = {
    mainboard: 0,
    sideboard: 0,
    commander: 0,
    companion: 0,
    maybeboard: 0,
  };
  for (const item of entries) result[item.zone] += item.quantity;
  return result;
}

export function parseDeckDetail(
  value: unknown,
  formats: DeckFormat[],
  expected?: { deckId: string; currency: string },
): DeckDetail | null {
  const response = record(value);
  const rawDeck = record(response?.deck);
  const rawFormat = record(rawDeck?.format);
  const selectedFormat = parseFormat(rawFormat);
  const listedSelectedFormat = selectedFormat
    ? formats.find((format) => format.formatVersionId === selectedFormat.formatVersionId)
    : null;
  const deck = selectedFormat
    ? deckRecord(rawDeck, {
        deckId: expected?.deckId,
        format: selectedFormat,
      })
    : null;
  const parsedPermissions = permissions(rawDeck?.permissions);
  if (
    !response ||
    !rawDeck ||
    !deck ||
    !selectedFormat ||
    (listedSelectedFormat && !sameFormat(listedSelectedFormat, selectedFormat)) ||
    !parsedPermissions ||
    !Array.isArray(rawDeck.sources) ||
    !Array.isArray(rawDeck.entries)
  ) {
    return null;
  }

  const rawOwnership = record(response.ownership);
  const ownershipSummary = record(rawOwnership?.summary);
  const currency = string(rawOwnership?.currency);
  const ownershipDeckId = uuidString(rawOwnership?.deck_id);
  const allocationPolicy = string(rawOwnership?.allocation_policy);
  const selectedCollectionIds = Array.isArray(rawOwnership?.selected_collection_ids)
    ? rawOwnership.selected_collection_ids.map(uuidString)
    : null;
  if (
    !rawOwnership ||
    !ownershipSummary ||
    ownershipDeckId !== deck.id ||
    !currency ||
    (expected?.currency && currency !== expected.currency) ||
    !allocationPolicy ||
    !Array.isArray(rawOwnership.sources) ||
    !Array.isArray(rawOwnership.source_warnings) ||
    !selectedCollectionIds ||
    selectedCollectionIds.some((id) => id === null)
  ) {
    return null;
  }

  const parsedSources = rawDeck.sources.map(source);
  const ownershipSources = rawOwnership.sources.map(source);
  if (
    parsedSources.some((item) => item === null) ||
    ownershipSources.some((item) => item === null) ||
    parsedSources.length !== ownershipSources.length ||
    parsedSources.some((item, index) => {
      const ownershipSource = ownershipSources[index];
      return (
        !item ||
        !ownershipSource ||
        item.collectionId !== ownershipSource.collectionId ||
        item.name !== ownershipSource.name ||
        item.priority !== ownershipSource.priority ||
        item.status !== ownershipSource.status ||
        selectedCollectionIds[index] !== item.collectionId
      );
    }) ||
    new Set(parsedSources.map((item) => item?.collectionId)).size !== parsedSources.length ||
    new Set(parsedSources.map((item) => item?.priority)).size !== parsedSources.length
  ) {
    return null;
  }
  const archivedSources = (parsedSources as DeckCollectionSource[]).filter(
    (item) => item.status === "archived",
  );
  if (
    rawOwnership.source_warnings.length !== archivedSources.length ||
    rawOwnership.source_warnings.some((raw, index) => {
      const warning = record(raw);
      const archivedSource = archivedSources[index];
      return (
        !warning ||
        !archivedSource ||
        warning.code !== "inventory_source_archived" ||
        uuidString(warning.collection_id) !== archivedSource.collectionId ||
        string(warning.collection_name) !== archivedSource.name ||
        !string(warning.message)
      );
    })
  ) {
    return null;
  }

  const ownershipEntries = ownershipByEntry(response.ownership);
  if (!ownershipEntries || ownershipEntries.size !== rawDeck.entries.length) return null;
  const entries: DeckEntry[] = [];
  const entryIds = new Set<string>();
  const cardZones = new Set<string>();
  for (const raw of rawDeck.entries) {
    const item = record(raw);
    const id = uuidString(item?.entry_id ?? item?.id);
    const cardId = uuidString(item?.card_id);
    const parsedZone = zone(item?.zone);
    const quantity = integer(item?.quantity, 1);
    const preferredFinish = optionalFinish(item?.preferred_finish);
    const preferredPrintingId = optionalUuid(item?.preferred_printing_id);
    const preferred =
      item?.preferred_printing === null
        ? null
        : printingChoice(item?.preferred_printing, preferredFinish, {
            cardId: cardId ?? undefined,
            currency,
          });
    const ownershipRow = id ? ownershipEntries.get(id) : undefined;
    const rawOwnershipPreferred = record(ownershipRow?.preferred_printing);
    const ownershipPreferred =
      ownershipRow?.preferred_printing === null
        ? null
        : printingChoice(rawOwnershipPreferred, preferredFinish, {
            cardId: cardId ?? undefined,
            currency,
          });
    const ownershipPrice = optionalPrice(rawOwnershipPreferred?.price, preferredFinish);
    const parsedOwnership =
      ownershipRow && parsedZone ? entryOwnership(ownershipRow, parsedZone) : null;
    const card = item ? cardIdentity(item, preferred) : null;
    const sortOrder = integer(item?.sort_order);
    const createdAt = timestamp(item?.created_at);
    const updatedAt = timestamp(item?.updated_at);
    const notes = optionalString(item?.notes);
    if (
      !item ||
      !Object.hasOwn(item, "preferred_printing_id") ||
      !Object.hasOwn(item, "preferred_finish") ||
      !Object.hasOwn(item, "preferred_printing") ||
      !id ||
      entryIds.has(id) ||
      !cardId ||
      !parsedZone ||
      cardZones.has(`${cardId}:${parsedZone}`) ||
      quantity === null ||
      preferredFinish === undefined ||
      preferredPrintingId === undefined ||
      Boolean(preferredPrintingId) !== Boolean(preferredFinish) ||
      Boolean(preferredPrintingId) !== Boolean(preferred) ||
      Boolean(preferredPrintingId) !== Boolean(ownershipPreferred) ||
      (preferredPrintingId &&
        (preferred?.printingId !== preferredPrintingId ||
          ownershipPreferred?.printingId !== preferredPrintingId)) ||
      !card ||
      card.cardId !== cardId ||
      sortOrder === null ||
      !createdAt ||
      !updatedAt ||
      notes === undefined ||
      ownershipPrice === undefined ||
      (ownershipPrice && ownershipPrice.currency !== currency) ||
      !parsedOwnership ||
      !ownershipRow ||
      !Object.hasOwn(ownershipRow, "preferred_printing") ||
      uuidString(ownershipRow?.card_id) !== cardId ||
      string(ownershipRow?.card_name) !== card.name ||
      zone(ownershipRow?.zone) !== parsedZone ||
      parsedOwnership.requiredQuantity !== quantity ||
      (parsedZone === "maybeboard"
        ? parsedOwnership.allocatedQuantity !== 0 || parsedOwnership.missingQuantity !== 0
        : parsedOwnership.allocatedQuantity + parsedOwnership.missingQuantity !== quantity) ||
      (preferredPrintingId &&
        parsedZone !== "maybeboard" &&
        parsedOwnership.preferredPrintingAllocatedQuantity! +
          parsedOwnership.preferredPrintingMissingQuantity! !==
          quantity)
    ) {
      return null;
    }
    entryIds.add(id);
    cardZones.add(`${cardId}:${parsedZone}`);
    entries.push({
      id,
      deckId: deck.id,
      card,
      zone: parsedZone,
      quantity,
      preferredPrintingId,
      preferredFinish,
      sortOrder,
      notes,
      updatedAt,
      currentRevision: deck.currentRevision,
      ownership: parsedOwnership,
      preferredPrice: ownershipPrice ?? preferred?.price ?? null,
    });
  }

  const requiredQuantity = integer(ownershipSummary.required_quantity);
  const allocatedQuantity = integer(ownershipSummary.allocated_owned_quantity);
  const missingQuantity = integer(ownershipSummary.missing_quantity);
  const maybeboardQuantity = integer(ownershipSummary.maybeboard_quantity);
  const preferredPrintingValue = optionalDecimal(ownershipSummary.preferred_value);
  const missingAcquisitionValue = optionalDecimal(ownershipSummary.missing_acquisition_value);
  const expectedOwnership = entries.reduce(
    (totals, entry) => {
      if (entry.zone === "maybeboard") {
        totals.maybeboard += entry.quantity;
      } else {
        totals.required += entry.ownership.requiredQuantity;
        totals.allocated += entry.ownership.allocatedQuantity;
        totals.missing += entry.ownership.missingQuantity;
      }
      return totals;
    },
    { required: 0, allocated: 0, missing: 0, maybeboard: 0 },
  );
  if (
    requiredQuantity === null ||
    allocatedQuantity === null ||
    missingQuantity === null ||
    maybeboardQuantity === null ||
    preferredPrintingValue === undefined ||
    missingAcquisitionValue === undefined ||
    requiredQuantity !== expectedOwnership.required ||
    allocatedQuantity !== expectedOwnership.allocated ||
    missingQuantity !== expectedOwnership.missing ||
    maybeboardQuantity !== expectedOwnership.maybeboard
  ) {
    return null;
  }

  const rawValidation = record(response.validation);
  const rawIssues = Array.isArray(rawValidation?.issues) ? rawValidation.issues : null;
  const rawValidationSummary = record(rawValidation?.summary);
  const rawValidationCounts = record(rawValidation?.counts);
  const rawRulesVersion = record(rawValidation?.rules_version);
  const rawValidationRules = record(rawRulesVersion?.rules);
  const validationFormat = rawValidationRules
    ? parseFormat({
        code: selectedFormat.code,
        name: selectedFormat.name,
        active: selectedFormat.active,
        rules: rawValidationRules,
      })
    : null;
  if (
    !rawValidation ||
    !rawIssues ||
    !rawValidationSummary ||
    !rawValidationCounts ||
    !rawRulesVersion ||
    !rawValidationRules ||
    !validationFormat ||
    !sameFormat(validationFormat, selectedFormat) ||
    uuidString(rawValidation.deck_id) !== deck.id ||
    string(rawRulesVersion.format_code) !== deck.formatCode ||
    uuidString(rawValidationRules.format_version_id) !== deck.formatVersionId ||
    string(rawValidationRules.version_key) !== deck.rulesVersion
  ) {
    return null;
  }
  const issues = rawIssues.map(parseIssue);
  if (issues.some((item) => item === null)) return null;
  const normalizedIssues = issues as DeckValidationIssue[];
  const errorCount = integer(rawValidationSummary.errors);
  const warningCount = integer(rawValidationSummary.warnings);
  const informationCount = integer(rawValidationSummary.infos);
  const unknownLegalityCount = integer(rawValidationSummary.legality_unknown_count);
  const issueDetailLimit = integer(rawValidationSummary.issue_detail_limit, 1);
  const issueDetailReturned = integer(rawValidationSummary.issue_detail_returned);
  const issueDetailTotal = integer(rawValidationSummary.issue_detail_total);
  const issuesTruncated = boolean(rawValidationSummary.issues_truncated);
  if (
    errorCount === null ||
    warningCount === null ||
    informationCount === null ||
    unknownLegalityCount === null ||
    issueDetailLimit === null ||
    issueDetailReturned === null ||
    issueDetailTotal === null ||
    issuesTruncated === null ||
    issueDetailTotal !== errorCount + warningCount + informationCount ||
    issueDetailReturned !== normalizedIssues.length ||
    issuesTruncated !== issueDetailTotal > issueDetailLimit
  ) {
    return null;
  }
  const detailedSeverityCounts = normalizedIssues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, information: 0 },
  );
  const detailedUnknownLegalityCount = normalizedIssues.filter((item) =>
    item.code.includes("legality_unknown"),
  ).length;
  if (
    (!issuesTruncated &&
      (issueDetailReturned !== issueDetailTotal ||
        detailedSeverityCounts.error !== errorCount ||
        detailedSeverityCounts.warning !== warningCount ||
        detailedSeverityCounts.information !== informationCount ||
        detailedUnknownLegalityCount !== unknownLegalityCount)) ||
    (issuesTruncated &&
      (issueDetailReturned !== issueDetailLimit + 1 ||
        detailedUnknownLegalityCount > unknownLegalityCount ||
        normalizedIssues.at(-1)?.code !== "validation_issues_truncated"))
  ) {
    return null;
  }
  if (issuesTruncated) {
    const truncationDetails = normalizedIssues.at(-1)?.details;
    const omitted = issueDetailTotal - issueDetailLimit;
    const returnedDetailCounts = normalizedIssues.slice(0, -1).reduce(
      (counts, issue) => {
        counts[issue.severity] += 1;
        return counts;
      },
      { error: 0, warning: 0, information: 0 },
    );
    const omittedErrors = integer(truncationDetails?.omitted_errors);
    const omittedWarnings = integer(truncationDetails?.omitted_warnings);
    const omittedInformation = integer(truncationDetails?.omitted_infos);
    if (
      truncationDetails?.detail_limit !== issueDetailLimit ||
      truncationDetails?.total !== issueDetailTotal ||
      truncationDetails?.omitted !== omitted ||
      omittedErrors === null ||
      omittedWarnings === null ||
      omittedInformation === null ||
      omittedErrors + omittedWarnings + omittedInformation !== omitted ||
      returnedDetailCounts.error + omittedErrors !== errorCount ||
      returnedDetailCounts.warning + omittedWarnings !== warningCount ||
      returnedDetailCounts.information + omittedInformation !== informationCount
    ) {
      return null;
    }
  }

  const validationRulesVersion = rulesVersion(rawValidation.rules_version);
  const evaluatedAt = timestamp(rawValidation.evaluated_at);
  const catalogVersion = string(rawValidation.catalog_version);
  const contentHash =
    typeof rawValidation.content_hash === "string" &&
    /^[0-9a-f]{64}$/i.test(rawValidation.content_hash)
      ? rawValidation.content_hash
      : null;
  const validationRunId = uuidString(rawValidation.validation_run_id);
  const valid = boolean(rawValidation.valid);
  const advisory = boolean(rawValidation.advisory);
  const validationRevision = integer(rawValidation.revision, 1);
  const deckRevisionId = uuidString(rawValidation.deck_revision_id);
  const oldestObserved = optionalTimestamp(ownershipSummary.oldest_price_observed_at);
  const latestObserved = optionalTimestamp(ownershipSummary.latest_price_observed_at);
  const oldestIngested = optionalTimestamp(ownershipSummary.oldest_price_ingested_at);
  const latestIngested = optionalTimestamp(ownershipSummary.latest_price_ingested_at);
  const providers = strictStrings(ownershipSummary.price_providers);
  const unpricedEntryCount = integer(ownershipSummary.unpriced_entry_count);
  const unpricedMissingQuantity = integer(ownershipSummary.unpriced_missing_quantity);
  const stalePriceCount = integer(ownershipSummary.stale_price_entry_count);
  const parsedZoneQuantities = {
    mainboard: integer(rawValidationCounts.mainboard),
    sideboard: integer(rawValidationCounts.sideboard),
    commander: integer(rawValidationCounts.commander),
    companion: integer(rawValidationCounts.companion),
    maybeboard: integer(rawValidationCounts.maybeboard),
  };
  const calculatedZoneQuantities = zoneQuantities(entries);
  const deckSize = integer(rawValidationCounts.deck_size_mainboard_plus_commander);
  const sideboardCapacityUsed = integer(rawValidationCounts.sideboard_capacity_used);
  if (
    !validationRulesVersion ||
    validationRulesVersion !== deck.rulesVersion ||
    !evaluatedAt ||
    !contentHash ||
    !validationRunId ||
    valid === null ||
    valid !== (errorCount === 0) ||
    advisory !== true ||
    validationRevision !== deck.currentRevision ||
    !deckRevisionId ||
    !catalogVersion ||
    oldestObserved === undefined ||
    latestObserved === undefined ||
    oldestIngested === undefined ||
    latestIngested === undefined ||
    !providers ||
    unpricedEntryCount === null ||
    unpricedMissingQuantity === null ||
    stalePriceCount === null ||
    Object.values(parsedZoneQuantities).some((quantity) => quantity === null) ||
    Object.entries(parsedZoneQuantities).some(
      ([zoneName, quantity]) => quantity !== calculatedZoneQuantities[zoneName as DeckZone],
    ) ||
    deckSize !== calculatedZoneQuantities.mainboard + calculatedZoneQuantities.commander ||
    sideboardCapacityUsed !==
      calculatedZoneQuantities.sideboard +
        (selectedFormat.companionConsumesSideboard ? calculatedZoneQuantities.companion : 0)
  ) {
    return null;
  }
  return {
    deck,
    format: selectedFormat,
    permissions: parsedPermissions,
    availableFormats: formats.some(
      (format) => format.formatVersionId === selectedFormat.formatVersionId,
    )
      ? formats
      : [selectedFormat, ...formats],
    sources: parsedSources as DeckCollectionSource[],
    entries,
    ownership: {
      requiredQuantity,
      allocatedQuantity,
      missingQuantity,
      maybeboardQuantity,
      sourceCollectionCount: selectedCollectionIds.length,
      allocationOrder: DEFAULT_ALLOCATION_ORDER,
    },
    valuation: {
      currency,
      preferredPrintingValue,
      missingAcquisitionValue,
      unpricedEntryCount,
      unpricedMissingQuantity,
      providers,
      oldestObservedAt: oldestObserved,
      latestObservedAt: latestObserved,
      oldestIngestedAt: oldestIngested,
      latestIngestedAt: latestIngested,
      stalePriceCount,
    },
    validation: {
      valid,
      formatCode: deck.formatCode,
      formatName: selectedFormat.name,
      rulesVersion: validationRulesVersion,
      catalogVersion,
      contentHash,
      validationRunId,
      evaluatedAt,
      issues: normalizedIssues,
      summary: {
        errorCount,
        warningCount,
        informationCount,
        unknownLegalityCount,
        issueDetailLimit,
        issueDetailReturned,
        issueDetailTotal,
        issuesTruncated,
      },
      advisory,
      zoneQuantities: calculatedZoneQuantities,
    },
  };
}

export function parseDeckCatalogSearchPage(
  value: unknown,
  expected: {
    deckId: string;
    query: string;
    formatCode: string;
    formatVersionId: string;
    revision: number;
    catalogVersion: string;
    currency: string;
  },
): DeckCatalogSearchPage | null {
  const response = record(value);
  const responseQuery = typeof response?.query === "string" ? response.query : null;
  if (
    !response ||
    uuidString(response.deck_id) !== expected.deckId ||
    responseQuery !== expected.query ||
    uuidString(response.format_version_id) !== expected.formatVersionId ||
    integer(response.revision, 1) !== expected.revision ||
    string(response.catalog_version) !== expected.catalogVersion ||
    !Array.isArray(response.items)
  ) {
    return null;
  }
  const items = [];
  const cardIds = new Set<string>();
  for (const raw of response.items) {
    const item = record(raw);
    const cardId = uuidString(item?.card_id);
    const defaultPrinting =
      item?.default_printing === null
        ? null
        : printingChoice(item?.default_printing, null, {
            cardId: cardId ?? undefined,
            currency: expected.currency,
          });
    const card = item ? cardIdentity(item, defaultPrinting) : null;
    const ownedQuantity = integer(item?.owned_quantity);
    const legality = optionalString(item?.legality);
    if (
      !item ||
      !cardId ||
      cardIds.has(cardId) ||
      !card ||
      card.cardId !== cardId ||
      (item.default_printing !== null && !defaultPrinting) ||
      ownedQuantity === null ||
      legality === undefined
    ) {
      return null;
    }
    cardIds.add(cardId);
    items.push({
      card,
      legality,
      ownedQuantity,
    });
  }
  const nextCursor = optionalCursor(response.next_cursor);
  const hasMore = boolean(response.has_more);
  if (nextCursor === undefined || hasMore === null || hasMore !== Boolean(nextCursor)) {
    return null;
  }
  return {
    deckId: expected.deckId,
    formatVersionId: expected.formatVersionId,
    revision: expected.revision,
    items,
    query: expected.query,
    formatCode: expected.formatCode,
    nextCursor,
    hasMore,
    catalogVersion: expected.catalogVersion,
  };
}

export function parseDeckCardPrintingsPage(
  value: unknown,
  expected: {
    deckId: string;
    cardId: string;
    revision: number;
    currency: string;
    catalogVersion: string;
  },
): DeckCardPrintingsPage | null {
  const response = record(value);
  if (
    !response ||
    uuidString(response.deck_id) !== expected.deckId ||
    uuidString(response.card_id) !== expected.cardId ||
    integer(response.revision, 1) !== expected.revision ||
    string(response.currency) !== expected.currency ||
    string(response.catalog_version) !== expected.catalogVersion ||
    !Array.isArray(response.items)
  ) {
    return null;
  }
  const items = response.items.map((item) =>
    printingChoice(item, null, {
      cardId: expected.cardId,
      currency: expected.currency,
    }),
  );
  if (
    items.some((item) => item === null) ||
    new Set(items.map((item) => item?.printingId)).size !== items.length
  ) {
    return null;
  }
  const nextCursor = optionalCursor(response.next_cursor);
  const hasMore = boolean(response.has_more);
  if (nextCursor === undefined || hasMore === null || hasMore !== Boolean(nextCursor)) {
    return null;
  }
  return {
    deckId: expected.deckId,
    cardId: expected.cardId,
    revision: expected.revision,
    currency: expected.currency,
    items: items as DeckPrintingChoice[],
    nextCursor,
    hasMore,
    catalogVersion: expected.catalogVersion,
  };
}

export function parseDeckImportResolution(
  value: unknown,
  deckId: string,
  expectedNames?: Array<{ lineId: string; name: string }>,
): DeckImportResolution | null {
  const response = record(value);
  const rawItems = response?.items;
  const rawCounts = record(response?.counts);
  const rawLimits = record(response?.limits);
  const catalogVersion = string(response?.catalog_version);
  const limits = {
    maxLines: integer(rawLimits?.max_lines, 1),
    maxInputBytes: integer(rawLimits?.max_input_bytes, 1),
    maxAmbiguousLinesWithCandidates: integer(rawLimits?.max_ambiguous_lines_with_candidates, 1),
    maxCandidatesPerAmbiguousLine: integer(rawLimits?.max_candidates_per_ambiguous_line, 1),
    maxSuggestionLines: integer(rawLimits?.max_suggestion_lines, 1),
    maxSuggestionsPerLine: integer(rawLimits?.max_suggestions_per_line, 1),
  };
  if (
    !response ||
    !uuidString(deckId) ||
    uuidString(response.deck_id) !== deckId ||
    !catalogVersion ||
    !Array.isArray(rawItems) ||
    !rawCounts ||
    !rawLimits ||
    Object.values(limits).some((limit) => limit === null)
  ) {
    return null;
  }
  const items: DeckImportResolutionItem[] = [];
  const lineIds = new Set<string>();
  for (const rawItem of rawItems) {
    const item = record(rawItem);
    const lineId =
      typeof item?.line_id === "string" &&
      item.line_id.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(item.line_id)
        ? item.line_id
        : null;
    const inputName = string(item?.input_name);
    const normalizedName = string(item?.normalized_name);
    const resolutionStatus = string(item?.status);
    const candidateCount = integer(item?.candidate_count);
    const candidatesTruncated = boolean(item?.candidates_truncated);
    const suggestionsOmitted = boolean(item?.suggestions_omitted);
    if (
      !item ||
      !lineId ||
      lineIds.has(lineId) ||
      !inputName ||
      !normalizedName ||
      candidateCount === null ||
      candidatesTruncated === null ||
      suggestionsOmitted === null ||
      (resolutionStatus !== "exact" &&
        resolutionStatus !== "ambiguous" &&
        resolutionStatus !== "unresolved") ||
      !Array.isArray(item.candidates)
    ) {
      return null;
    }
    lineIds.add(lineId);
    const candidates = item.candidates.map((rawCandidate) => {
      const candidate = record(rawCandidate);
      const cardId = uuidString(candidate?.card_id);
      const name = string(candidate?.name);
      const colorIdentity = strictStrings(candidate?.color_identity);
      const manaCost = optionalString(candidate?.mana_cost);
      const typeLine = optionalString(candidate?.type_line);
      if (
        !candidate ||
        !cardId ||
        !name ||
        !colorIdentity ||
        manaCost === undefined ||
        typeLine === undefined
      ) {
        return null;
      }
      return {
        cardId,
        name,
        manaCost,
        typeLine,
        colorIdentity,
      };
    });
    const candidateIds = candidates.map((candidate) => candidate?.cardId);
    if (
      candidates.some((candidate) => candidate === null) ||
      new Set(candidateIds).size !== candidateIds.length ||
      (resolutionStatus === "exact" &&
        (candidateCount !== 1 ||
          candidates.length !== 1 ||
          candidatesTruncated ||
          suggestionsOmitted)) ||
      (resolutionStatus === "ambiguous" &&
        (candidateCount < 2 ||
          candidates.length > Math.min(candidateCount, limits.maxCandidatesPerAmbiguousLine!) ||
          (candidates.length < candidateCount && !candidatesTruncated) ||
          (candidates.length === 0 && !candidatesTruncated) ||
          suggestionsOmitted)) ||
      (resolutionStatus === "unresolved" &&
        (candidateCount !== candidates.length ||
          candidatesTruncated ||
          (suggestionsOmitted && candidates.length > 0)))
    ) {
      return null;
    }
    items.push({
      lineId,
      inputName,
      normalizedName,
      status: resolutionStatus,
      candidateCount,
      candidates: candidates as DeckImportResolutionItem["candidates"],
      candidatesTruncated,
      suggestionsOmitted,
    });
  }
  const counts = {
    exact: integer(rawCounts.exact),
    ambiguous: integer(rawCounts.ambiguous),
    unresolved: integer(rawCounts.unresolved),
  };
  if (
    counts.exact === null ||
    counts.ambiguous === null ||
    counts.unresolved === null ||
    counts.exact + counts.ambiguous + counts.unresolved !== items.length ||
    counts.exact !== items.filter((item) => item.status === "exact").length ||
    counts.ambiguous !== items.filter((item) => item.status === "ambiguous").length ||
    counts.unresolved !== items.filter((item) => item.status === "unresolved").length
  ) {
    return null;
  }
  if (
    expectedNames &&
    (expectedNames.length !== items.length ||
      expectedNames.some(
        (expected, index) =>
          items[index]?.lineId !== expected.lineId || items[index]?.inputName !== expected.name,
      ))
  ) {
    return null;
  }
  return {
    deckId,
    catalogVersion,
    items,
    counts: {
      exact: counts.exact,
      ambiguous: counts.ambiguous,
      unresolved: counts.unresolved,
    },
    limits: {
      maxLines: limits.maxLines!,
      maxInputBytes: limits.maxInputBytes!,
      maxAmbiguousLinesWithCandidates: limits.maxAmbiguousLinesWithCandidates!,
      maxCandidatesPerAmbiguousLine: limits.maxCandidatesPerAmbiguousLine!,
      maxSuggestionLines: limits.maxSuggestionLines!,
      maxSuggestionsPerLine: limits.maxSuggestionsPerLine!,
    },
  };
}

interface DeckMutationExpectation {
  deckId?: string;
  workspaceId?: string;
  expectedRevision?: number;
  resultRevision?: number;
  status?: ResourceStatus;
  formatCode?: string;
  formatVersionId?: string | null;
  name?: string;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
  coverPrintingId?: string | null;
}

function parseDeckMutationRevision(
  value: unknown,
  deck: NonNullable<ReturnType<typeof deckRecord>>,
) {
  const revision = record(value);
  const revisionId = uuidString(revision?.revision_id);
  const revisionNumber = integer(revision?.revision, 1);
  const contentHash =
    typeof revision?.content_hash === "string" && /^[0-9a-f]{64}$/i.test(revision.content_hash)
      ? revision.content_hash
      : null;
  const rulesVersionId = uuidString(revision?.rules_version_id);
  const catalogVersion = optionalString(revision?.catalog_version);
  if (
    !revision ||
    !Object.hasOwn(revision, "catalog_version") ||
    !revisionId ||
    revisionNumber !== deck.currentRevision ||
    !contentHash ||
    rulesVersionId !== deck.formatVersionId ||
    catalogVersion === undefined
  ) {
    return null;
  }
  return {
    revisionId,
    revision: revisionNumber,
    contentHash,
    rulesVersionId,
    catalogVersion,
  };
}

export function parseDeckMutation(
  value: unknown,
  expected: DeckMutationExpectation,
): { deckId: string; revision: number } | null {
  const response = record(value);
  const rawDeck = record(response?.deck);
  const deck = deckRecord(rawDeck, {
    deckId: expected.deckId,
    workspaceId: expected.workspaceId,
  });
  const revision = deck ? parseDeckMutationRevision(response?.revision, deck) : null;
  const resultRevision =
    expected.resultRevision ??
    (expected.expectedRevision === undefined ? undefined : expected.expectedRevision + 1);
  if (
    !response ||
    !deck ||
    !revision ||
    (resultRevision !== undefined && deck.currentRevision !== resultRevision) ||
    (expected.status && deck.status !== expected.status) ||
    (expected.formatCode && deck.formatCode !== expected.formatCode) ||
    (expected.formatVersionId !== undefined &&
      expected.formatVersionId !== null &&
      deck.formatVersionId !== expected.formatVersionId) ||
    (expected.name && deck.name !== expected.name) ||
    (Object.hasOwn(expected, "description") && deck.description !== expected.description) ||
    (Object.hasOwn(expected, "notes") && deck.notes !== expected.notes) ||
    (expected.tags &&
      (deck.tags.length !== expected.tags.length ||
        deck.tags.some((tag, index) => tag !== expected.tags?.[index]))) ||
    (Object.hasOwn(expected, "coverPrintingId") &&
      deck.coverPrintingId !== expected.coverPrintingId)
  ) {
    return null;
  }
  return { deckId: deck.id, revision: revision.revision };
}

export function parseDeckDuplicateMutation(
  value: unknown,
  expected: {
    sourceDeckId: string;
    workspaceId?: string;
    name?: string | null;
  },
): { deckId: string; revision: number } | null {
  const response = record(value);
  const parsed = parseDeckMutation(value, {
    workspaceId: expected.workspaceId,
    resultRevision: 1,
    status: "active",
    name: expected.name ?? undefined,
  });
  if (
    !response ||
    !parsed ||
    uuidString(response.source_deck_id) !== expected.sourceDeckId ||
    parsed.deckId === expected.sourceDeckId
  ) {
    return null;
  }
  return parsed;
}

export function parseDeckSourcesMutation(
  value: unknown,
  expected: {
    deckId: string;
    expectedRevision: number;
    collectionIds: string[];
  },
): { deckId: string; revision: number } | null {
  const response = record(value);
  const collectionIds = Array.isArray(response?.collection_ids)
    ? response.collection_ids.map(uuidString)
    : null;
  const parsed = parseDeckMutation(value, {
    deckId: expected.deckId,
    expectedRevision: expected.expectedRevision,
    status: "active",
  });
  if (
    !parsed ||
    !collectionIds ||
    collectionIds.some((id) => id === null) ||
    collectionIds.length !== expected.collectionIds.length ||
    collectionIds.some((id, index) => id !== expected.collectionIds[index])
  ) {
    return null;
  }
  return parsed;
}

interface DeckEntryMutationExpectation {
  deckId: string;
  entryId?: string;
  expectedRevision: number;
  cardId?: string;
  zone?: DeckZone;
  quantity?: number;
  preferredPrintingId?: string | null;
  preferredFinish?: Exclude<CardFinish, "unknown"> | null;
  notes?: string | null;
}

export function parseDeckEntryMutation(
  value: unknown,
  expected: DeckEntryMutationExpectation,
): { entryId: string; revision: number } | null {
  const response = record(value);
  const entry = record(response?.entry);
  const parsedDeck = parseDeckMutation(value, {
    deckId: expected.deckId,
    expectedRevision: expected.expectedRevision,
    status: "active",
  });
  const entryId = uuidString(entry?.entry_id);
  const deckId = uuidString(entry?.deck_id);
  const cardId = uuidString(entry?.card_id);
  const parsedZone = zone(entry?.zone);
  const quantity = integer(entry?.quantity, 1);
  const preferredPrintingId = optionalUuid(entry?.preferred_printing_id);
  const preferredFinish = optionalFinish(entry?.preferred_finish);
  const sortOrder = integer(entry?.sort_order);
  const notes = optionalString(entry?.notes);
  const createdAt = timestamp(entry?.created_at);
  const updatedAt = timestamp(entry?.updated_at);
  if (
    !entry ||
    !Object.hasOwn(entry, "preferred_printing_id") ||
    !Object.hasOwn(entry, "preferred_finish") ||
    !Object.hasOwn(entry, "notes") ||
    !parsedDeck ||
    !entryId ||
    (expected.entryId && entryId !== expected.entryId) ||
    deckId !== expected.deckId ||
    !cardId ||
    (expected.cardId && cardId !== expected.cardId) ||
    !parsedZone ||
    (expected.zone && parsedZone !== expected.zone) ||
    quantity === null ||
    (expected.quantity !== undefined && quantity !== expected.quantity) ||
    preferredPrintingId === undefined ||
    preferredFinish === undefined ||
    Boolean(preferredPrintingId) !== Boolean(preferredFinish) ||
    (expected.preferredPrintingId !== undefined &&
      preferredPrintingId !== expected.preferredPrintingId) ||
    (expected.preferredFinish !== undefined && preferredFinish !== expected.preferredFinish) ||
    sortOrder === null ||
    notes === undefined ||
    (expected.notes !== undefined && notes !== expected.notes) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return { entryId, revision: parsedDeck.revision };
}

export function parseDeckEntryRemovalMutation(
  value: unknown,
  expected: { deckId: string; entryId: string; expectedRevision: number },
): { entryId: string; revision: number } | null {
  const response = record(value);
  const parsedDeck = parseDeckMutation(value, {
    deckId: expected.deckId,
    expectedRevision: expected.expectedRevision,
    status: "active",
  });
  return parsedDeck && uuidString(response?.removed_entry_id) === expected.entryId
    ? { entryId: expected.entryId, revision: parsedDeck.revision }
    : null;
}

export function parseDeckEntriesReplacementMutation(
  value: unknown,
  expected: { deckId: string; expectedRevision: number; entryCount: number },
): { deckId: string; revision: number } | null {
  const response = record(value);
  const parsedDeck = parseDeckMutation(value, {
    deckId: expected.deckId,
    expectedRevision: expected.expectedRevision,
    status: "active",
  });
  return parsedDeck && integer(response?.entry_count) === expected.entryCount ? parsedDeck : null;
}

export interface DeckExportPayload {
  catalogVersion: string;
  revision: number;
  plainText: string;
  stableJson: {
    schema_version: 1;
    deck: {
      deck_id: string;
      name: string;
      format_code: string;
      format_version_id: string;
      revision: number;
      catalog_version: string;
    };
    entries: Array<{
      card_id: string;
      name: string;
      zone: DeckZone;
      quantity: number;
      preferred_printing_id: string | null;
      preferred_finish: Exclude<CardFinish, "unknown"> | null;
      notes: string | null;
    }>;
  };
}

export function parseDeckExport(value: unknown, expectedDeckId?: string): DeckExportPayload | null {
  const response = record(value);
  const plainText = typeof response?.plain_text === "string" ? response.plain_text : null;
  const catalogVersion = string(response?.catalog_version);
  const revision = integer(response?.revision, 1);
  const stable = record(response?.stable_json);
  const deck = record(stable?.deck);
  const deckId = uuidString(deck?.deck_id);
  const name = string(deck?.name);
  const formatCode = string(deck?.format_code);
  const formatVersionId = uuidString(deck?.format_version_id);
  const stableRevision = integer(deck?.revision, 1);
  const stableCatalogVersion = string(deck?.catalog_version);
  if (
    !response ||
    plainText === null ||
    !catalogVersion ||
    revision === null ||
    stable?.schema_version !== 1 ||
    !deck ||
    !deckId ||
    (expectedDeckId && deckId !== expectedDeckId) ||
    !name ||
    !formatCode ||
    !FORMAT_CODE_PATTERN.test(formatCode) ||
    !formatVersionId ||
    stableRevision !== revision ||
    stableCatalogVersion !== catalogVersion ||
    !Array.isArray(stable.entries) ||
    stable.entries.length > 2_000
  ) {
    return null;
  }
  const entries: DeckExportPayload["stableJson"]["entries"] = [];
  const cardZones = new Set<string>();
  for (const raw of stable.entries) {
    const item = record(raw);
    const cardId = uuidString(item?.card_id);
    const cardName = string(item?.name);
    const parsedZone = zone(item?.zone);
    const quantity = integer(item?.quantity, 1);
    const preferredPrintingId = optionalUuid(item?.preferred_printing_id);
    const preferredFinish = optionalFinish(item?.preferred_finish);
    const notes = optionalString(item?.notes);
    if (
      !item ||
      !cardId ||
      !cardName ||
      !parsedZone ||
      quantity === null ||
      preferredPrintingId === undefined ||
      preferredFinish === undefined ||
      Boolean(preferredPrintingId) !== Boolean(preferredFinish) ||
      notes === undefined ||
      cardZones.has(`${cardId}:${parsedZone}`)
    ) {
      return null;
    }
    cardZones.add(`${cardId}:${parsedZone}`);
    entries.push({
      card_id: cardId,
      name: cardName,
      zone: parsedZone,
      quantity,
      preferred_printing_id: preferredPrintingId,
      preferred_finish: preferredFinish,
      notes,
    });
  }
  return {
    catalogVersion,
    revision,
    plainText,
    stableJson: {
      schema_version: 1,
      deck: {
        deck_id: deckId,
        name,
        format_code: formatCode,
        format_version_id: formatVersionId,
        revision,
        catalog_version: catalogVersion,
      },
      entries,
    },
  };
}
