import {
  EMPTY_FILTER_GROUP,
  parseFilterParameter,
  serializeFilterGroup,
  type FilterGroup,
  type FilterRule,
} from "@/features/filters/model";

import type { CollectionInventoryQuery, CollectionStatusFilter, CollectionView } from "./types";
import { COLLECTION_STATUS_FILTERS, COLLECTION_VIEWS } from "./types";

export type CollectionUrlInput = Record<string, string | string[] | undefined>;

const VIEW_VALUES = new Set<string>(COLLECTION_VIEWS);
const STATUS_VALUES = new Set<string>(COLLECTION_STATUS_FILTERS);
const FINISH_VALUES = new Set(["nonfoil", "foil", "etched"]);
const CONDITION_VALUES = new Set([
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
]);
const SORT_VALUES = new Set(["name", "quantity_desc", "value_desc", "updated_desc"]);
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,2048}$/;
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function legacyCollectionFilters(input: CollectionUrlInput, notices: string[]): FilterGroup {
  const children: FilterRule[] = [];
  const set = first(input.set).toUpperCase();
  if (set && SET_CODE_PATTERN.test(set)) {
    children.push({ id: "legacy-set", field: "set", comparator: "is", value: [set] });
  } else if (set) notices.push("The legacy set filter was invalid and has been reset.");
  const finish = first(input.finish).toLowerCase();
  if (finish && FINISH_VALUES.has(finish)) {
    children.push({ id: "legacy-finish", field: "finish", comparator: "is", value: [finish] });
  } else if (finish) notices.push("The legacy finish filter was invalid and has been reset.");
  const condition = first(input.condition).toLowerCase();
  if (condition && CONDITION_VALUES.has(condition)) {
    children.push({
      id: "legacy-condition",
      field: "condition",
      comparator: "is",
      value: [condition],
    });
  } else if (condition) notices.push("The legacy condition filter was invalid and has been reset.");
  return { ...EMPTY_FILTER_GROUP, children };
}

export function parseCollectionStatusFilter(input: CollectionUrlInput): CollectionStatusFilter {
  const status = first(input.status_filter);
  return STATUS_VALUES.has(status) ? (status as CollectionStatusFilter) : "active";
}

export function parseCollectionCursor(input: CollectionUrlInput): string | null {
  const cursor = first(input.cursor);
  return CURSOR_PATTERN.test(cursor) ? cursor : null;
}

export function parseInventoryImportAfterRow(value: string | string[] | undefined): number {
  const raw = first(value);
  return /^\d{1,4}$/.test(raw) && Number(raw) <= 5_001 ? Number(raw) : 0;
}

export function parseCollectionInventoryQuery(
  input: CollectionUrlInput,
  preferredView: CollectionView = "structured",
): { query: CollectionInventoryQuery; notices: string[] } {
  const notices: string[] = [];
  const suppliedQuery = first(input.q);
  const query = suppliedQuery.length === 1 ? "" : suppliedQuery.slice(0, 120);
  if (suppliedQuery.length === 1) notices.push("Search requires at least two characters.");
  if (suppliedQuery.length > 120) notices.push("Search text was shortened to 120 characters.");

  const serializedFilters = first(input.filters);
  const parsedFilters = serializedFilters
    ? parseFilterParameter(serializedFilters)
    : { value: legacyCollectionFilters(input, notices), notices: [] };
  notices.push(...parsedFilters.notices);

  const rawSort = first(input.sort);
  const rawView = first(input.view);
  const rawCursor = first(input.cursor);
  const cursor = CURSOR_PATTERN.test(rawCursor) ? rawCursor : null;
  if (rawCursor && !cursor) notices.push("The inventory cursor was invalid and has been reset.");

  return {
    query: {
      query,
      filters: parsedFilters.value,
      sort: SORT_VALUES.has(rawSort) ? (rawSort as CollectionInventoryQuery["sort"]) : "name",
      cursor,
      view: VIEW_VALUES.has(rawView) ? (rawView as CollectionView) : preferredView,
    },
    notices: Array.from(new Set(notices)),
  };
}

export function collectionInventorySearchParams(
  query: CollectionInventoryQuery,
  overrides: Partial<CollectionInventoryQuery> = {},
): URLSearchParams {
  const value = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (value.query) params.set("q", value.query);
  const filters = serializeFilterGroup(value.filters);
  if (filters) params.set("filters", filters);
  if (value.sort !== "name") params.set("sort", value.sort);
  if (value.cursor) params.set("cursor", value.cursor);
  params.set("view", value.view);
  return params;
}

export function collectionInventoryHref(
  collectionId: string,
  query: CollectionInventoryQuery,
  overrides: Partial<CollectionInventoryQuery> = {},
): string {
  return `/app/collections/${collectionId}?${collectionInventorySearchParams(
    query,
    overrides,
  ).toString()}`;
}

export function safeCollectionReturnPath(
  value: string | string[] | undefined,
  fallback = "/app/collections",
): string {
  const candidate = first(value);
  if (!candidate.startsWith("/app/collections") || candidate.startsWith("//")) return fallback;
  try {
    const parsed = new URL(candidate, "https://talence.invalid");
    return parsed.origin === "https://talence.invalid" &&
      (parsed.pathname === "/app/collections" || parsed.pathname.startsWith("/app/collections/"))
      ? `${parsed.pathname}${parsed.search}`
      : fallback;
  } catch {
    return fallback;
  }
}
