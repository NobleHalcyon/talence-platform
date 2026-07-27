import type { PriceObservation } from "@talence/domain";

import type {
  AdminCatalogStatus,
  CatalogCardDetail,
  CatalogFace,
  CatalogFreshness,
  CatalogImportSummary,
  CatalogLegality,
  CatalogPrintingDetail,
  CatalogSearchItem,
  CatalogSearchResult,
  CatalogSetDetail,
  CatalogSetSummary,
  CatalogStatus,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integer(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function amount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const candidate = String(value).trim();
  if (!candidate) {
    return null;
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 ? candidate : null;
}

export function parsePriceObservation(value: unknown): PriceObservation | null {
  const item = record(value);
  if (!item) {
    return null;
  }

  const parsedAmount = amount(item.amount);
  const currency = string(item.currency);
  const finish = string(item.finish);
  const provider = string(item.provider);
  const observedAt = string(item.observed_at ?? item.observedAt);
  const ingestedAt = string(item.ingested_at ?? item.ingestedAt);

  if (!parsedAmount || !currency || !finish || !provider || !observedAt || !ingestedAt) {
    return null;
  }

  return {
    amount: parsedAmount,
    currency: currency.toUpperCase(),
    finish,
    provider,
    observedAt,
    ingestedAt,
    staleAfter: nullableString(item.stale_after ?? item.staleAfter),
  };
}

export function parseCatalogFreshness(value: unknown): CatalogFreshness {
  const item = record(value) ?? {};
  return {
    version: nullableString(item.version ?? item.active_catalog_version ?? item.catalog_version),
    provider: nullableString(item.provider ?? item.source_provider),
    sourceObservedAt: nullableString(
      item.source_observed_at ??
        item.sourceObservedAt ??
        item.provider_observed_at ??
        item.last_successful_source_observation_at,
    ),
    ingestedAt: nullableString(
      item.ingested_at ??
        item.ingestedAt ??
        item.catalog_ingested_at ??
        item.last_successful_import_at,
    ),
  };
}

function parseFace(
  value: unknown,
  fallbackPrintingId: string,
  fallbackIndex: number,
): CatalogFace | null {
  const item = record(value);
  if (!item) {
    return null;
  }

  const faceIndex = integer(item.face_index ?? item.faceIndex) ?? fallbackIndex;
  const name = string(item.name);
  if (!name) {
    return null;
  }

  return {
    id: string(item.id) ?? `${fallbackPrintingId}-face-${faceIndex}`,
    faceIndex,
    name,
    manaCost: nullableString(item.mana_cost ?? item.manaCost),
    typeLine: nullableString(item.type_line ?? item.typeLine),
    oracleText: nullableString(item.oracle_text ?? item.oracleText),
    colors: strings(item.colors),
    power: nullableString(item.power),
    toughness: nullableString(item.toughness),
    loyalty: nullableString(item.loyalty),
    defense: nullableString(item.defense),
    artist: nullableString(item.artist),
    imageSmallUri: nullableString(item.image_small_uri ?? item.imageSmallUri),
    imageNormalUri: nullableString(item.image_normal_uri ?? item.imageNormalUri),
    imageLargeUri: nullableString(item.image_large_uri ?? item.imageLargeUri),
  };
}

function parseSet(value: unknown, fallback: UnknownRecord = {}): CatalogSetSummary | null {
  const item = record(value) ?? {};
  const id = string(item.id ?? fallback.set_id);
  const code = string(item.code ?? fallback.set_code);
  const name = string(item.name ?? fallback.set_name);
  if (!id || !code || !name) {
    return null;
  }

  return {
    id,
    code,
    name,
    setType: nullableString(item.set_type ?? item.setType ?? fallback.set_type),
    releasedAt: nullableString(item.released_at ?? item.releasedAt ?? fallback.set_released_at),
    cardCount: integer(item.card_count ?? item.cardCount ?? fallback.set_card_count),
    digital: boolean(item.digital ?? fallback.set_digital),
    iconSvgUri: nullableString(item.icon_svg_uri ?? item.iconSvgUri ?? fallback.set_icon_svg_uri),
  };
}

export function parseCatalogSearchItem(value: unknown): CatalogSearchItem | null {
  const item = record(value);
  if (!item) {
    return null;
  }

  const printing = record(item.printing) ?? item;
  const card = record(item.card) ?? item;
  const printingId = string(printing.id ?? item.printing_id ?? item.printingId);
  const name = string(
    item.display_name ??
      item.displayName ??
      card.name ??
      item.card_name ??
      item.name ??
      printing.printed_name ??
      printing.printedName,
  );
  const set = parseSet(item.set, { ...item, ...printing });
  if (!printingId || !name || !set) {
    return null;
  }

  const rawFaces = Array.isArray(item.faces)
    ? item.faces
    : Array.isArray(printing.faces)
      ? printing.faces
      : [];
  const faces = rawFaces
    .map((face, index) => parseFace(face, printingId, index))
    .filter((face): face is CatalogFace => face !== null)
    .sort((left, right) => left.faceIndex - right.faceIndex);

  if (faces.length === 0) {
    const imageNormalUri = nullableString(
      item.image_normal_uri ?? printing.image_normal_uri ?? item.image_uri,
    );
    const imageLargeUri = nullableString(item.image_large_uri ?? printing.image_large_uri);
    if (imageNormalUri || imageLargeUri) {
      faces.push({
        id: `${printingId}-face-0`,
        faceIndex: 0,
        name,
        manaCost: nullableString(card.mana_cost ?? item.mana_cost),
        typeLine: nullableString(card.type_line ?? item.type_line),
        oracleText: nullableString(card.oracle_text ?? item.oracle_text),
        colors: strings(card.colors ?? item.colors),
        power: null,
        toughness: null,
        loyalty: null,
        defense: null,
        artist: nullableString(printing.artist ?? item.artist),
        imageSmallUri: nullableString(item.image_small_uri ?? printing.image_small_uri),
        imageNormalUri,
        imageLargeUri,
      });
    }
  }

  const rawPrices = Array.isArray(item.prices)
    ? item.prices
    : Array.isArray(printing.prices)
      ? printing.prices
      : [];
  const firstPrice = rawPrices
    .map(parsePriceObservation)
    .find((price): price is PriceObservation => price !== null);

  return {
    cardId: nullableString(card.id ?? item.card_id ?? item.cardId),
    printingId,
    name,
    printedName: nullableString(printing.printed_name ?? printing.printedName ?? item.printed_name),
    manaCost: nullableString(card.mana_cost ?? card.manaCost ?? item.mana_cost),
    manaValue: number(card.mana_value ?? card.manaValue ?? item.mana_value),
    typeLine: nullableString(card.type_line ?? card.typeLine ?? item.type_line),
    oracleText: nullableString(card.oracle_text ?? card.oracleText ?? item.oracle_text),
    colors: strings(card.colors ?? item.colors),
    colorIdentity: strings(card.color_identity ?? card.colorIdentity ?? item.color_identity),
    keywords: strings(card.keywords ?? item.keywords),
    set,
    collectorNumber:
      string(printing.collector_number ?? printing.collectorNumber ?? item.collector_number) ?? "—",
    language: string(printing.language ?? item.language) ?? "und",
    rarity: nullableString(printing.rarity ?? item.rarity),
    layout: nullableString(printing.layout ?? item.layout),
    releasedAt: nullableString(printing.released_at ?? printing.releasedAt ?? item.released_at),
    digital: boolean(printing.digital ?? item.digital),
    promo: boolean(printing.promo ?? item.promo),
    oversized: boolean(printing.oversized ?? item.oversized),
    finishes: strings(printing.finishes ?? item.finishes),
    artist: nullableString(printing.artist ?? item.artist),
    providerUri: nullableString(
      printing.scryfall_uri ?? printing.provider_uri ?? item.scryfall_uri ?? item.provider_uri,
    ),
    faces,
    bestPrice: parsePriceObservation(item.best_price ?? item.bestPrice) ?? firstPrice ?? null,
  };
}

export function parseCatalogSearchResult(value: unknown): CatalogSearchResult | null {
  const result = record(value);
  if (!result || !Array.isArray(result.items)) {
    return null;
  }

  const items = result.items
    .map(parseCatalogSearchItem)
    .filter((item): item is CatalogSearchItem => item !== null);
  if (items.length !== result.items.length) {
    return null;
  }

  return {
    items,
    nextCursor: nullableString(result.next_cursor ?? result.nextCursor),
    previousCursor: nullableString(result.previous_cursor ?? result.previousCursor),
    totalCount: integer(result.total_count ?? result.totalCount),
    resultCount: integer(result.result_count ?? result.resultCount) ?? items.length,
    currency: nullableString(result.currency),
    catalog: parseCatalogFreshness(result.catalog ?? result.status),
  };
}

function parseLegality(value: unknown): CatalogLegality | null {
  const item = record(value);
  const formatCode = item ? string(item.format_code ?? item.formatCode) : null;
  const legality = item ? string(item.legality) : null;
  return formatCode && legality ? { formatCode, legality } : null;
}

export function parseCatalogCardDetail(value: unknown): CatalogCardDetail | null {
  const result = record(value);
  const card = record(result?.card);
  const id = card ? string(card.id) : null;
  const name = card ? string(card.name) : null;
  if (!result || !card || !id || !name || !Array.isArray(result.printings)) {
    return null;
  }

  const printings = result.printings
    .map(parseCatalogSearchItem)
    .filter((item): item is CatalogSearchItem => item !== null);
  if (printings.length !== result.printings.length) {
    return null;
  }

  const representativeRaw = result.representative_printing ?? result.representativePrinting;
  const representativePrinting = representativeRaw
    ? parseCatalogSearchItem(representativeRaw)
    : (printings[0] ?? null);
  if (representativeRaw && !representativePrinting) {
    return null;
  }

  const legalitiesRaw = Array.isArray(result.legalities) ? result.legalities : [];
  const legalities = legalitiesRaw
    .map(parseLegality)
    .filter((item): item is CatalogLegality => item !== null);
  const printingCount = integer(result.printing_count ?? result.printingCount);
  const printingsTruncatedRaw = result.printings_truncated ?? result.printingsTruncated;
  if (
    printingCount === null ||
    printingCount < printings.length ||
    typeof printingsTruncatedRaw !== "boolean"
  ) {
    return null;
  }

  return {
    card: {
      id,
      name,
      manaCost: nullableString(card.mana_cost ?? card.manaCost),
      manaValue: number(card.mana_value ?? card.manaValue),
      typeLine: nullableString(card.type_line ?? card.typeLine),
      oracleText: nullableString(card.oracle_text ?? card.oracleText),
      colors: strings(card.colors),
      colorIdentity: strings(card.color_identity ?? card.colorIdentity),
      keywords: strings(card.keywords),
      reserved: boolean(card.reserved),
    },
    representativePrinting,
    printings,
    printingCount,
    printingsTruncated: printingsTruncatedRaw,
    legalities,
    catalog: parseCatalogFreshness(result.catalog ?? result.status),
  };
}

export function parseCatalogPrintingDetail(value: unknown): CatalogPrintingDetail | null {
  const result = record(value);
  const printing = parseCatalogSearchItem(result?.printing ?? value);
  if (!result || !printing) {
    return null;
  }

  const printingRecord = record(result.printing);
  const rawPrices = Array.isArray(result.prices)
    ? result.prices
    : Array.isArray(printingRecord?.prices)
      ? printingRecord.prices
      : [];
  const prices = rawPrices
    .map(parsePriceObservation)
    .filter((price): price is PriceObservation => price !== null);
  if (prices.length !== rawPrices.length) {
    return null;
  }

  return {
    printing,
    prices,
    catalog: parseCatalogFreshness(result.catalog ?? result.status),
  };
}

export function parseCatalogSetDetail(value: unknown): CatalogSetDetail | null {
  const result = record(value);
  const rawSet = record(result?.set);
  const set = parseSet(rawSet);
  if (!result || !rawSet || !set || !Array.isArray(result.printings)) {
    return null;
  }

  const printings = result.printings
    .map(parseCatalogSearchItem)
    .filter((item): item is CatalogSearchItem => item !== null);
  if (printings.length !== result.printings.length) {
    return null;
  }

  return {
    set: {
      ...set,
      sourceProvider: string(rawSet.source_provider ?? rawSet.sourceProvider) ?? "Unknown",
      sourceUpdatedAt: nullableString(rawSet.source_updated_at ?? rawSet.sourceUpdatedAt),
      foilOnly: boolean(rawSet.foil_only ?? rawSet.foilOnly),
      nonfoilOnly: boolean(rawSet.nonfoil_only ?? rawSet.nonfoilOnly),
    },
    printings,
    totalCount: integer(
      result.total_count ?? result.totalCount ?? result.printing_count ?? result.printingCount,
    ),
    catalog: parseCatalogFreshness(result.catalog ?? result.status),
  };
}

function parseCounts(value: unknown): CatalogStatus["counts"] {
  const counts = record(value) ?? {};
  return {
    sets: integer(counts.sets ?? counts.set_count),
    cards: integer(counts.cards ?? counts.card_count),
    printings: integer(counts.printings ?? counts.printing_count),
    faces: integer(counts.faces ?? counts.face_count),
    prices: integer(counts.prices ?? counts.price_count),
  };
}

export function parseCatalogStatus(value: unknown): CatalogStatus | null {
  const result = record(value);
  if (!result) {
    return null;
  }
  return {
    catalog: parseCatalogFreshness(result.catalog ?? result.state ?? result),
    counts: parseCounts(result.counts ?? result),
  };
}

function parseImport(value: unknown): CatalogImportSummary | null {
  const item = record(value);
  const id = item ? string(item.id) : null;
  const status = item ? string(item.status) : null;
  if (!item || !id || !status) {
    return null;
  }
  return {
    id,
    status,
    triggerType: string(item.trigger_type ?? item.triggerType) ?? "unknown",
    startedAt: nullableString(item.started_at ?? item.startedAt),
    completedAt: nullableString(item.completed_at ?? item.completedAt),
    recordsSeen: integer(item.records_seen ?? item.recordsSeen),
    recordsWritten: integer(item.records_written ?? item.recordsWritten),
    recordsRejected: integer(item.records_rejected ?? item.recordsRejected),
    errorCode: nullableString(item.error_code ?? item.errorCode),
    errorSummary: nullableString(item.error_summary ?? item.errorSummary),
  };
}

export function parseAdminCatalogStatus(value: unknown): AdminCatalogStatus | null {
  const result = record(value);
  const base = parseCatalogStatus(value);
  if (!result || !base) {
    return null;
  }

  const source = record(result.latest_source_file ?? result.latestSourceFile ?? result.source);
  const state = record(result.state);
  const latestRaw = Array.isArray(result.latest_imports ?? result.latestImports)
    ? ((result.latest_imports ?? result.latestImports) as unknown[])
    : [];
  const latestImports = latestRaw
    .map(parseImport)
    .filter((item): item is CatalogImportSummary => item !== null);
  const queuedRaw = Array.isArray(result.queued_imports ?? result.queuedImports)
    ? ((result.queued_imports ?? result.queuedImports) as unknown[])
    : [];
  const queuedImports = queuedRaw
    .map(parseImport)
    .filter((item): item is CatalogImportSummary => item !== null);
  if (latestImports.length !== latestRaw.length || queuedImports.length !== queuedRaw.length) {
    return null;
  }

  return {
    ...base,
    catalog: parseCatalogFreshness(result.state ?? result.catalog ?? result),
    syncEnabled: boolean(
      state?.sync_enabled ?? state?.syncEnabled ?? result.sync_enabled ?? result.syncEnabled,
    ),
    latestImports,
    queuedImports,
    source: source
      ? {
          provider: nullableString(source.provider),
          sourceType: nullableString(source.source_type ?? source.sourceType),
          providerObjectId: nullableString(source.provider_object_id ?? source.providerObjectId),
          providerUpdatedAt: nullableString(source.provider_updated_at ?? source.providerUpdatedAt),
          downloadedAt: nullableString(source.downloaded_at ?? source.downloadedAt),
          sha256: nullableString(source.sha256),
          status: nullableString(source.status),
        }
      : null,
    snapshotVersion: nullableString(result.snapshot_version ?? result.snapshotVersion),
  };
}
