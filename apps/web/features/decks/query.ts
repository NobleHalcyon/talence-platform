import {
  DECK_EDITOR_SURFACES,
  DECK_STATUS_FILTERS,
  type DeckEditorSurface,
  type DeckStatusFilter,
} from "./types";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function parseDeckStatusFilter(
  parameters: Record<string, string | string[] | undefined>,
): DeckStatusFilter {
  const value = first(parameters.status_filter);
  return DECK_STATUS_FILTERS.includes(value as DeckStatusFilter)
    ? (value as DeckStatusFilter)
    : "active";
}

export function parseDeckCursor(
  parameters: Record<string, string | string[] | undefined>,
): string | null {
  const value = first(parameters.cursor).trim();
  return /^[A-Za-z0-9_-]{8,2048}$/.test(value) ? value : null;
}

export function parseDeckEditorSurface(
  parameters: Record<string, string | string[] | undefined>,
): DeckEditorSurface {
  const value = first(parameters.surface);
  return DECK_EDITOR_SURFACES.includes(value as DeckEditorSurface)
    ? (value as DeckEditorSurface)
    : "deck";
}

export function parseDeckSearchQuery(
  parameters: Record<string, string | string[] | undefined>,
): string {
  const value = first(parameters.q)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return value.length >= 2 ? value : "";
}

export function parseDeckSearchCursor(
  parameters: Record<string, string | string[] | undefined>,
): string | null {
  const value = first(parameters.catalog_cursor).trim();
  return /^[A-Za-z0-9_-]{8,2048}$/.test(value) ? value : null;
}

export function parseDeckPrintingEntryId(
  parameters: Record<string, string | string[] | undefined>,
): string | null {
  const value = first(parameters.printing_for).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function parseDeckPrintingCursor(
  parameters: Record<string, string | string[] | undefined>,
): string | null {
  const value = first(parameters.printing_cursor).trim();
  return /^[A-Za-z0-9_-]{8,2048}$/.test(value) ? value : null;
}

export function deckEditorHref(
  deckId: string,
  values: {
    surface?: DeckEditorSurface;
    query?: string;
    catalogCursor?: string | null;
    printingFor?: string | null;
    printingCursor?: string | null;
  } = {},
): string {
  const parameters = new URLSearchParams();
  if (values.surface && values.surface !== "deck") {
    parameters.set("surface", values.surface);
  }
  if (values.query) parameters.set("q", values.query);
  if (values.catalogCursor) parameters.set("catalog_cursor", values.catalogCursor);
  if (values.printingFor) parameters.set("printing_for", values.printingFor);
  if (values.printingCursor) parameters.set("printing_cursor", values.printingCursor);
  const suffix = parameters.toString();
  return `/app/decks/${deckId}${suffix ? `?${suffix}` : ""}`;
}

export function safeDeckReturnPath(value: string, fallback: string): string {
  if (value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://talence.invalid");
    const allowed = parsed.pathname === "/app/decks" || parsed.pathname.startsWith("/app/decks/");
    return parsed.origin === "https://talence.invalid" && allowed
      ? `${parsed.pathname}${parsed.search}`
      : fallback;
  } catch {
    return fallback;
  }
}
