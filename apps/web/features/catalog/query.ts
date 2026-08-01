import {
  EMPTY_FILTER_GROUP,
  parseFilterParameter,
  serializeFilterGroup,
  type FilterComparator,
  type FilterField,
  type FilterGroup,
  type FilterRule,
  type FilterValue,
} from "@/features/filters/model";

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

const SORT_VALUES = new Set<string>(CATALOG_SORTS);
const VIEW_VALUES = new Set<string>(CATALOG_VIEWS);
const PAGE_SIZE_VALUES = new Set<number>(CATALOG_PAGE_SIZES);
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,2048}$/;
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const LANGUAGE_PATTERN = /^[a-z][a-z0-9_-]{1,15}$/;
const FINISH_VALUES = new Set(["nonfoil", "foil", "etched"]);
const COLOR_VALUES = new Set(["W", "U", "B", "R", "G", "C"]);
const MAX_QUERY_LENGTH = 120;

export const DEFAULT_CATALOG_PAGE_SIZE: CatalogPageSize = 30;
export const DEFAULT_CATALOG_LANGUAGE = "en";
export const ALL_CATALOG_LANGUAGES = "all";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function legacyRule(
  field: FilterField,
  comparator: FilterComparator,
  value: FilterValue,
): FilterRule {
  return { id: `legacy-${field}`, field, comparator, value };
}

function legacyValues(value: string, allowed?: Set<string>): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry && (!allowed || allowed.has(entry))),
    ),
  );
}

function legacyFilterGroup(input: CatalogUrlInput, notices: string[]): FilterGroup {
  const children: FilterRule[] = [];
  const set = first(input.set).toUpperCase();
  if (set && SET_CODE_PATTERN.test(set)) children.push(legacyRule("set", "is", [set]));
  else if (set) notices.push("The legacy set filter was invalid and has been reset.");

  const language = first(input.lang).toLowerCase();
  if (language && language !== ALL_CATALOG_LANGUAGES) {
    if (LANGUAGE_PATTERN.test(language)) children.push(legacyRule("language", "is", [language]));
    else notices.push("The legacy language filter was invalid and has been reset.");
  }

  const rarity = first(input.rarity).toLowerCase();
  if (rarity) children.push(legacyRule("rarity", "is", [rarity.slice(0, 64)]));
  const finish = first(input.finish).toLowerCase();
  if (finish && FINISH_VALUES.has(finish)) children.push(legacyRule("finish", "is", [finish]));
  else if (finish) notices.push("The legacy finish filter was invalid and has been reset.");

  const colors = legacyValues(first(input.colors).toUpperCase(), COLOR_VALUES);
  if (colors.length && !(colors.includes("C") && colors.length > 1)) {
    children.push(legacyRule("cardColor", "all", colors));
  }
  const identity = legacyValues(first(input.identity).toUpperCase(), COLOR_VALUES);
  if (identity.length && !(identity.includes("C") && identity.length > 1)) {
    children.push(legacyRule("colorIdentity", "all", identity));
  }

  const type = first(input.type).slice(0, 80);
  if (type) children.push(legacyRule("cardType", "any", [type]));
  const min = first(input.mv_min) ? Number(first(input.mv_min)) : null;
  const max = first(input.mv_max) ? Number(first(input.mv_max)) : null;
  if (
    (min === null || (Number.isFinite(min) && min >= 0)) &&
    (max === null || (Number.isFinite(max) && max >= 0)) &&
    (min !== null || max !== null) &&
    (min === null || max === null || min <= max)
  ) {
    children.push(legacyRule("manaValue", "between", { min, max }));
  }

  const releasedFrom = first(input.released_from);
  const releasedTo = first(input.released_to);
  if (releasedFrom || releasedTo) {
    const minDate = releasedFrom ? Date.parse(`${releasedFrom}T00:00:00Z`) : null;
    const maxDate = releasedTo ? Date.parse(`${releasedTo}T00:00:00Z`) : null;
    if (
      (minDate === null || Number.isFinite(minDate)) &&
      (maxDate === null || Number.isFinite(maxDate)) &&
      (minDate === null || maxDate === null || minDate <= maxDate)
    ) {
      children.push(legacyRule("releasedAt", "between", { min: minDate, max: maxDate }));
    }
  }

  if (first(input.price) || first(input.currency)) {
    notices.push(
      "Price availability and currency filters are no longer supported and were ignored.",
    );
  }
  return { ...EMPTY_FILTER_GROUP, children };
}

export function defaultCatalogQuery(view: CatalogView = "grid"): CatalogSearchQuery {
  return {
    query: "",
    filters: { ...EMPTY_FILTER_GROUP, children: [] },
    includeDigital: false,
    includeNondefault: false,
    returnAllVariants: false,
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
  const suppliedQuery = first(input.q);
  const query = suppliedQuery.length === 1 ? "" : suppliedQuery.slice(0, MAX_QUERY_LENGTH);
  if (suppliedQuery.length === 1) notices.push("Enter at least two characters to search.");
  if (suppliedQuery.length > MAX_QUERY_LENGTH) notices.push("Search text was shortened.");

  const serializedFilters = first(input.filters);
  const parsedFilters = serializedFilters
    ? parseFilterParameter(serializedFilters)
    : { value: legacyFilterGroup(input, notices), notices: [] };
  notices.push(...parsedFilters.notices);

  const rawCursor = first(input.cursor);
  const cursor = CURSOR_PATTERN.test(rawCursor) ? rawCursor : null;
  if (rawCursor && !cursor) notices.push("The catalog cursor was invalid and has been reset.");
  const sort = first(input.sort);
  const view = first(input.view);
  const rawPageSize = Number(first(input.page_size));
  const pageSize = PAGE_SIZE_VALUES.has(rawPageSize)
    ? (rawPageSize as CatalogPageSize)
    : DEFAULT_CATALOG_PAGE_SIZE;

  return {
    query: {
      query,
      filters: parsedFilters.value,
      includeDigital: first(input.digital) === "1",
      includeNondefault: first(input.nondefault) === "1",
      returnAllVariants: first(input.variants) === "all",
      sort: SORT_VALUES.has(sort) ? (sort as CatalogSort) : "name",
      cursor,
      view: VIEW_VALUES.has(view) ? (view as CatalogView) : preferredView,
      pageSize,
    },
    notices: Array.from(new Set(notices)),
  };
}

export function catalogQueryToSearchParams(
  query: CatalogSearchQuery,
  overrides: Partial<CatalogSearchQuery> = {},
): URLSearchParams {
  const value = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (value.query) params.set("q", value.query);
  const filters = serializeFilterGroup(value.filters);
  if (filters) params.set("filters", filters);
  if (value.includeDigital) params.set("digital", "1");
  if (value.includeNondefault) params.set("nondefault", "1");
  if (value.returnAllVariants) params.set("variants", "all");
  if (value.sort !== "name") params.set("sort", value.sort);
  if (value.cursor) params.set("cursor", value.cursor);
  if (value.pageSize !== DEFAULT_CATALOG_PAGE_SIZE) params.set("page_size", String(value.pageSize));
  params.set("view", value.view);
  return params;
}

export function catalogHref(
  query: CatalogSearchQuery,
  overrides: Partial<CatalogSearchQuery> = {},
): string {
  const search = catalogQueryToSearchParams(query, overrides).toString();
  return search ? `/app/catalog?${search}` : "/app/catalog";
}

export function safeCatalogReturnPath(value: string | string[] | undefined): string {
  const candidate = first(value);
  if (!candidate.startsWith("/app/catalog") || candidate.startsWith("//")) return "/app/catalog";
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
