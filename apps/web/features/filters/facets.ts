import type { FilterField } from "./model";

export interface FilterOption {
  value: string;
  label: string;
  secondary?: string | null;
  symbolUri?: string | null;
}

export interface FilterFacetPage {
  field: string;
  items: FilterOption[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const FACET_FIELDS: Partial<Record<FilterField, string>> = {
  set: "set",
  language: "language",
  supertype: "supertype",
  cardType: "cardtype",
  subtype: "subtype",
  artist: "artist",
  keyword: "keyword",
  rarity: "rarity",
  finish: "finish",
};

export const COLOR_OPTIONS: FilterOption[] = [
  { value: "W", label: "White", symbolUri: "/api/catalog/assets/mana/W" },
  { value: "U", label: "Blue", symbolUri: "/api/catalog/assets/mana/U" },
  { value: "B", label: "Black", symbolUri: "/api/catalog/assets/mana/B" },
  { value: "R", label: "Red", symbolUri: "/api/catalog/assets/mana/R" },
  { value: "G", label: "Green", symbolUri: "/api/catalog/assets/mana/G" },
  { value: "C", label: "Colorless", symbolUri: "/api/catalog/assets/mana/C" },
];

export const LEGALITY_STATE_OPTIONS: FilterOption[] = [
  { value: "legal", label: "Legal" },
  { value: "restricted", label: "Restricted" },
  { value: "banned", label: "Banned" },
  { value: "not_legal", label: "Not legal" },
];

export const CONDITION_OPTIONS: FilterOption[] = [
  { value: "near_mint", label: "Near mint" },
  { value: "lightly_played", label: "Lightly played" },
  { value: "moderately_played", label: "Moderately played" },
  { value: "heavily_played", label: "Heavily played" },
  { value: "damaged", label: "Damaged" },
];

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  set: "Set",
  language: "Language",
  cardColor: "Card color",
  colorIdentity: "Color identity",
  supertype: "Supertype",
  cardType: "Card type",
  subtype: "Subtype",
  manaValue: "Mana value",
  power: "Power",
  toughness: "Toughness",
  loyalty: "Loyalty",
  legality: "Format legality",
  artist: "Artist",
  keyword: "Keyword",
  rulesText: "Rules text",
  rarity: "Rarity",
  finish: "Finish",
  releasedAt: "Release date",
  digital: "Digital scope",
  defaultObject: "Default-object scope",
  condition: "Condition",
  ownedQuantity: "Owned quantity",
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseFacetPage(value: unknown): FilterFacetPage | null {
  const page = record(value);
  if (!page || typeof page.field !== "string" || !Array.isArray(page.items)) return null;
  const items = page.items.flatMap((raw) => {
    const item = record(raw);
    return item && typeof item.value === "string" && typeof item.label === "string"
      ? [
          {
            value: item.value,
            label: item.label,
            secondary: typeof item.secondary === "string" ? item.secondary : null,
            symbolUri: typeof item.symbol_uri === "string" ? item.symbol_uri : null,
          },
        ]
      : [];
  });
  return {
    field: page.field,
    items,
    nextCursor: typeof page.next_cursor === "string" ? page.next_cursor : null,
    hasMore: page.has_more === true,
  };
}

export function optionLabel(option: FilterOption): string {
  return option.secondary ? `${option.label} (${option.secondary.split(" · ")[0]})` : option.label;
}
