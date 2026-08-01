import {
  CATALOG_PAGE_SIZES,
  CATALOG_SORTS,
  CATALOG_VIEWS,
  type CatalogPageSize,
  type CatalogQueryParseResult,
  type CatalogSearchQuery,
  type CatalogSort,
  type CatalogView,
} from "./types";

export type CatalogUrlInput = Record<string, string | string[] | undefined>;

const COLOR_VALUES = new Set(["W", "U", "B", "R", "G", "C"]);
const CURRENCY_VALUES = new Set(["USD", "EUR", "TIX"]);
const FINISH_VALUES = new Set(["nonfoil", "foil", "etched"]);
const PRICE_VALUES = new Set(["any", "available", "unavailable"]);
const SORT_VALUES = new Set<string>(CATALOG_SORTS);
const VIEW_VALUES = new Set<string>(CATALOG_VIEWS);
const PAGE_SIZE_VALUES = new Set<number>(CATALOG_PAGE_SIZES);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,2048}$/;
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const LANGUAGE_PATTERN = /^[a-z][a-z0-9_-]{1,15}$/;
const MAX_QUERY_LENGTH = 120;
const MAX_FILTER_LENGTH = 80;

export const DEFAULT_CATALOG_PAGE_SIZE: CatalogPageSize = 30;
export const DEFAULT_CATALOG_LANGUAGE = "en";
export const ALL_CATALOG_LANGUAGES = "all";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function bounded(value: string, maximum: number): string {
  return value.slice(0, maximum);
}

function numberOrNull(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function dateOrEmpty(value: string): string {
  if (!DATE_PATTERN.test(value)) {
    return "";
  }
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(instant.valueOf()) || instant.toISOString().slice(0, 10) !== value
    ? ""
    : value;
}

function colors(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toUpperCase()
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => COLOR_VALUES.has(entry)),
    ),
  ).sort();
}

function combinesColorlessWithColors(value: string[]): boolean {
  return value.includes("C") && value.length > 1;
}

export function defaultCatalogQuery(view: CatalogView = "grid"): CatalogSearchQuery {
  return {
    query: "",
    setCode: "",
    language: DEFAULT_CATALOG_LANGUAGE,
    rarity: "",
    finish: "",
    colors: [],
    colorIdentity: [],
    typeLine: "",
    manaValueMin: null,
    manaValueMax: null,
    priceAvailability: "any",
    currency: "",
    includeDigital: false,
    includeNondefault: false,
    returnAllVariants: false,
    releasedFrom: "",
    releasedTo: "",
    sort: "name",
    cursor: null,
    view,
    pageSize: DEFAULT_CATALOG_PAGE_SIZE,
  };
}

export function parseCatalogQuery(
  input: CatalogUrlInput,
  preferredView: CatalogView = "grid",
): CatalogQueryParseResult {
  const notices: string[] = [];
  const rawQuery = bounded(first(input.q), MAX_QUERY_LENGTH);
  const manaValueMin = numberOrNull(first(input.mv_min));
  const manaValueMax = numberOrNull(first(input.mv_max));
  const rawCursor = first(input.cursor);
  const rawSetCode = first(input.set).toUpperCase();
  const rawLanguage = first(input.lang).toLowerCase();
  const setCode = SET_CODE_PATTERN.test(rawSetCode) ? rawSetCode : "";
  const language =
    !rawLanguage || rawLanguage === DEFAULT_CATALOG_LANGUAGE
      ? DEFAULT_CATALOG_LANGUAGE
      : rawLanguage === ALL_CATALOG_LANGUAGES || LANGUAGE_PATTERN.test(rawLanguage)
        ? rawLanguage
        : DEFAULT_CATALOG_LANGUAGE;
  const currency = first(input.currency).toUpperCase();
  const finish = first(input.finish).toLowerCase();
  const price = first(input.price);
  const sort = first(input.sort);
  const view = first(input.view);
  const rawPageSize = first(input.page_size);
  const numericPageSize = Number(rawPageSize);
  const pageSize = PAGE_SIZE_VALUES.has(numericPageSize)
    ? (numericPageSize as CatalogPageSize)
    : DEFAULT_CATALOG_PAGE_SIZE;
  const parsedColors = colors(first(input.colors));
  const parsedColorIdentity = colors(first(input.identity));
  const colorsConflict = combinesColorlessWithColors(parsedColors);
  const identityConflict = combinesColorlessWithColors(parsedColorIdentity);
  const cursor = CURSOR_PATTERN.test(rawCursor) ? rawCursor : null;
  const releasedFrom = dateOrEmpty(first(input.released_from));
  const releasedTo = dateOrEmpty(first(input.released_to));
  const invertedManaRange =
    manaValueMin !== null && manaValueMax !== null && manaValueMin > manaValueMax;
  const invertedReleaseRange = Boolean(releasedFrom && releasedTo && releasedFrom > releasedTo);

  if (rawQuery.length === 1) {
    notices.push("Enter at least two characters for name or fuzzy text search.");
  }
  if (first(input.mv_min) && manaValueMin === null) {
    notices.push("Minimum mana value must be between 0 and 100.");
  }
  if (first(input.mv_max) && manaValueMax === null) {
    notices.push("Maximum mana value must be between 0 and 100.");
  }
  if (invertedManaRange) {
    notices.push("Minimum mana value cannot exceed maximum mana value.");
  }
  if (invertedReleaseRange) {
    notices.push("Release start date cannot be later than the end date.");
  }
  if (first(input.finish) && !FINISH_VALUES.has(finish)) {
    notices.push("The finish filter was invalid and has been reset.");
  }
  if (rawSetCode && !setCode) {
    notices.push("The set code filter was invalid and has been reset.");
  }
  if (rawLanguage && rawLanguage !== ALL_CATALOG_LANGUAGES && !LANGUAGE_PATTERN.test(rawLanguage)) {
    notices.push("The language filter was invalid and has been reset to English.");
  }
  if (colorsConflict || identityConflict) {
    notices.push(
      "Colorless cannot be combined with colored values; the conflicting filter was reset.",
    );
  }
  if (first(input.released_from) && !releasedFrom) {
    notices.push("The release start date was invalid and has been reset.");
  }
  if (first(input.released_to) && !releasedTo) {
    notices.push("The release end date was invalid and has been reset.");
  }
  if (rawCursor && cursor === null) {
    notices.push("The catalog cursor was invalid and has been reset.");
  }
  if (rawPageSize && !PAGE_SIZE_VALUES.has(numericPageSize)) {
    notices.push("The catalog page size was invalid and has been reset.");
  }

  return {
    query: {
      query: rawQuery.length === 1 ? "" : rawQuery,
      setCode,
      language,
      rarity: bounded(first(input.rarity).toLowerCase(), 24),
      finish: FINISH_VALUES.has(finish) ? finish : "",
      colors: colorsConflict ? [] : parsedColors,
      colorIdentity: identityConflict ? [] : parsedColorIdentity,
      typeLine: bounded(first(input.type), MAX_FILTER_LENGTH),
      manaValueMin: invertedManaRange ? null : manaValueMin,
      manaValueMax: invertedManaRange ? null : manaValueMax,
      priceAvailability: PRICE_VALUES.has(price)
        ? (price as CatalogSearchQuery["priceAvailability"])
        : "any",
      currency: CURRENCY_VALUES.has(currency) ? currency : "",
      includeDigital: first(input.digital) === "1",
      includeNondefault: first(input.nondefault) === "1",
      returnAllVariants: first(input.variants) === "all",
      releasedFrom: invertedReleaseRange ? "" : releasedFrom,
      releasedTo: invertedReleaseRange ? "" : releasedTo,
      sort: SORT_VALUES.has(sort) ? (sort as CatalogSort) : "name",
      cursor,
      view: VIEW_VALUES.has(view) ? (view as CatalogView) : preferredView,
      pageSize,
    },
    notices,
  };
}

export function catalogQueryToSearchParams(
  query: CatalogSearchQuery,
  overrides: Partial<CatalogSearchQuery> = {},
): URLSearchParams {
  const value = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (value.query) params.set("q", value.query);
  if (value.setCode) params.set("set", value.setCode);
  if (value.language && value.language !== DEFAULT_CATALOG_LANGUAGE) {
    params.set("lang", value.language);
  }
  if (value.rarity) params.set("rarity", value.rarity);
  if (value.finish) params.set("finish", value.finish);
  if (value.colors.length) params.set("colors", value.colors.join(","));
  if (value.colorIdentity.length) params.set("identity", value.colorIdentity.join(","));
  if (value.typeLine) params.set("type", value.typeLine);
  if (value.manaValueMin !== null) params.set("mv_min", String(value.manaValueMin));
  if (value.manaValueMax !== null) params.set("mv_max", String(value.manaValueMax));
  if (value.priceAvailability !== "any") params.set("price", value.priceAvailability);
  if (value.currency) params.set("currency", value.currency);
  if (value.includeDigital) params.set("digital", "1");
  if (value.includeNondefault) params.set("nondefault", "1");
  if (value.returnAllVariants) params.set("variants", "all");
  if (value.releasedFrom) params.set("released_from", value.releasedFrom);
  if (value.releasedTo) params.set("released_to", value.releasedTo);
  if (value.sort !== "name") params.set("sort", value.sort);
  if (value.cursor) params.set("cursor", value.cursor);
  if (value.pageSize !== DEFAULT_CATALOG_PAGE_SIZE) {
    params.set("page_size", String(value.pageSize));
  }
  params.set("view", value.view);

  return params;
}

export function catalogHref(
  query: CatalogSearchQuery,
  overrides: Partial<CatalogSearchQuery> = {},
): string {
  const params = catalogQueryToSearchParams(query, overrides);
  const search = params.toString();
  return search ? `/app/catalog?${search}` : "/app/catalog";
}

export function safeCatalogReturnPath(value: string | string[] | undefined): string {
  const candidate = first(value);
  if (!candidate.startsWith("/app/catalog") || candidate.startsWith("//")) {
    return "/app/catalog";
  }

  try {
    const parsed = new URL(candidate, "https://talence.invalid");
    return parsed.origin === "https://talence.invalid" &&
      (parsed.pathname === "/app/catalog" || parsed.pathname.startsWith("/app/catalog/"))
      ? `${parsed.pathname}${parsed.search}`
      : "/app/catalog";
  } catch {
    return "/app/catalog";
  }
}
