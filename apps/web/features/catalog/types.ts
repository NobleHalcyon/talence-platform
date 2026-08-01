import type { PriceObservation } from "@talence/domain";

export const CATALOG_VIEWS = ["table", "grid"] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

export const CATALOG_PAGE_SIZES = [6, 12, 18, 24, 30] as const;
export type CatalogPageSize = (typeof CATALOG_PAGE_SIZES)[number];

export const CATALOG_SORTS = ["name", "newest", "price_asc", "price_desc"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export type CatalogPriceAvailability = "any" | "available" | "unavailable";

export interface CatalogSearchQuery {
  query: string;
  setCode: string;
  language: string;
  rarity: string;
  finish: string;
  colors: string[];
  colorIdentity: string[];
  typeLine: string;
  manaValueMin: number | null;
  manaValueMax: number | null;
  priceAvailability: CatalogPriceAvailability;
  currency: string;
  includeDigital: boolean;
  includeNondefault: boolean;
  returnAllVariants: boolean;
  releasedFrom: string;
  releasedTo: string;
  sort: CatalogSort;
  cursor: string | null;
  view: CatalogView;
  pageSize: CatalogPageSize;
}

export interface CatalogQueryParseResult {
  query: CatalogSearchQuery;
  notices: string[];
}

export interface CatalogFace {
  id: string;
  faceIndex: number;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  artist: string | null;
  imageSmallUri: string | null;
  imageNormalUri: string | null;
  imageLargeUri: string | null;
}

export interface CatalogSetSummary {
  id: string;
  code: string;
  name: string;
  setType: string | null;
  releasedAt: string | null;
  cardCount: number | null;
  digital: boolean;
  iconSvgUri: string | null;
}

export interface CatalogSearchItem {
  cardId: string | null;
  printingId: string;
  name: string;
  oracleName: string;
  printedName: string | null;
  manaCost: string | null;
  manaValue: number | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  set: CatalogSetSummary;
  collectorNumber: string;
  language: string;
  rarity: string | null;
  layout: string | null;
  releasedAt: string | null;
  digital: boolean;
  promo: boolean;
  oversized: boolean;
  finishes: string[];
  artist: string | null;
  providerUri: string | null;
  faces: CatalogFace[];
  prices: PriceObservation[];
  bestPrice: PriceObservation | null;
  displayPrices: CatalogPricePair;
}

export interface CatalogPricePair {
  nonfoil: PriceObservation | null;
  foil: PriceObservation | null;
}

export interface CatalogDeckOption {
  id: string;
  name: string;
  currentRevision: number;
}

export interface CatalogFreshness {
  version: string | null;
  provider: string | null;
  sourceObservedAt: string | null;
  ingestedAt: string | null;
}

export interface CatalogSearchResult {
  items: CatalogSearchItem[];
  nextCursor: string | null;
  previousCursor: string | null;
  totalCount: number | null;
  resultCount: number;
  currency: string | null;
  catalog: CatalogFreshness;
}

export interface CatalogLegality {
  formatCode: string;
  legality: string;
}

export interface CatalogCardDetail {
  card: {
    id: string;
    name: string;
    manaCost: string | null;
    manaValue: number | null;
    typeLine: string | null;
    oracleText: string | null;
    colors: string[];
    colorIdentity: string[];
    keywords: string[];
    reserved: boolean;
  };
  representativePrinting: CatalogSearchItem | null;
  printings: CatalogSearchItem[];
  printingCount: number;
  printingsTruncated: boolean;
  legalities: CatalogLegality[];
  catalog: CatalogFreshness;
}

export interface CatalogPrintingDetail {
  printing: CatalogSearchItem;
  prices: PriceObservation[];
  catalog: CatalogFreshness;
}

export interface CatalogSetDetail {
  set: CatalogSetSummary & {
    sourceProvider: string;
    sourceUpdatedAt: string | null;
    foilOnly: boolean;
    nonfoilOnly: boolean;
  };
  printings: CatalogSearchItem[];
  totalCount: number | null;
  catalog: CatalogFreshness;
}

export interface CatalogStatus {
  catalog: CatalogFreshness;
  counts: {
    sets: number | null;
    cards: number | null;
    printings: number | null;
    faces: number | null;
    prices: number | null;
  };
}

export interface CatalogImportSummary {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsSeen: number | null;
  recordsWritten: number | null;
  recordsRejected: number | null;
  errorCode: string | null;
  errorSummary: string | null;
}

export interface AdminCatalogStatus extends CatalogStatus {
  syncEnabled: boolean;
  latestImports: CatalogImportSummary[];
  queuedImports: CatalogImportSummary[];
  source: {
    provider: string | null;
    sourceType: string | null;
    providerObjectId: string | null;
    providerUpdatedAt: string | null;
    downloadedAt: string | null;
    sha256: string | null;
    status: string | null;
  } | null;
  snapshotVersion: string | null;
}

export type CatalogLoadFailureReason =
  "configuration_required" | "invalid_response" | "request_failed";

export type CatalogLoadResult<T> =
  | { ok: true; data: T; preview: boolean }
  | {
      ok: false;
      reason: CatalogLoadFailureReason;
      requestId: string;
    };

export interface CatalogRpcError {
  code?: string;
  message?: string;
}

export interface CatalogRpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: CatalogRpcError | null }>;
}
