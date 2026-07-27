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
  const rawQuery = suppliedQuery.length === 1 ? "" : suppliedQuery.slice(0, 120);
  const rawSetCode = first(input.set).toUpperCase();
  const rawFinish = first(input.finish).toLowerCase();
  const rawCondition = first(input.condition).toLowerCase();
  const rawSort = first(input.sort);
  const rawView = first(input.view);
  const rawCursor = first(input.cursor);

  if (suppliedQuery.length === 1) {
    notices.push("Search requires at least two characters and has been reset.");
  }
  if (suppliedQuery.length > 120) notices.push("Search text was shortened to 120 characters.");
  if (rawSetCode && !SET_CODE_PATTERN.test(rawSetCode)) {
    notices.push("The set filter was invalid and has been reset.");
  }
  if (rawFinish && !FINISH_VALUES.has(rawFinish)) {
    notices.push("The finish filter was invalid and has been reset.");
  }
  if (rawCondition && !CONDITION_VALUES.has(rawCondition)) {
    notices.push("The condition filter was invalid and has been reset.");
  }
  if (rawCursor && !CURSOR_PATTERN.test(rawCursor)) {
    notices.push("The inventory cursor was invalid and has been reset.");
  }

  return {
    query: {
      query: rawQuery,
      setCode: SET_CODE_PATTERN.test(rawSetCode) ? rawSetCode : "",
      finish: FINISH_VALUES.has(rawFinish) ? (rawFinish as CollectionInventoryQuery["finish"]) : "",
      condition: CONDITION_VALUES.has(rawCondition)
        ? (rawCondition as CollectionInventoryQuery["condition"])
        : "",
      sort: SORT_VALUES.has(rawSort) ? (rawSort as CollectionInventoryQuery["sort"]) : "name",
      cursor: CURSOR_PATTERN.test(rawCursor) ? rawCursor : null,
      view: VIEW_VALUES.has(rawView) ? (rawView as CollectionView) : preferredView,
    },
    notices,
  };
}

export function collectionInventorySearchParams(
  query: CollectionInventoryQuery,
  overrides: Partial<CollectionInventoryQuery> = {},
): URLSearchParams {
  const value = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (value.query) params.set("q", value.query);
  if (value.setCode) params.set("set", value.setCode);
  if (value.finish) params.set("finish", value.finish);
  if (value.condition) params.set("condition", value.condition);
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
