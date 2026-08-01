export const FILTER_FIELDS = [
  "set",
  "language",
  "cardColor",
  "colorIdentity",
  "supertype",
  "cardType",
  "subtype",
  "manaValue",
  "power",
  "toughness",
  "loyalty",
  "legality",
  "artist",
  "keyword",
  "rulesText",
  "rarity",
  "finish",
  "releasedAt",
  "digital",
  "defaultObject",
  "condition",
  "ownedQuantity",
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];

export const FILTER_COMPARATORS = [
  "is",
  "isNot",
  "any",
  "all",
  "exactly",
  "excludes",
  "between",
  "contains",
  "doesNotContain",
  "exactPhrase",
] as const;

export type FilterComparator = (typeof FILTER_COMPARATORS)[number];

export interface RangeFilterValue {
  min: number | null;
  max: number | null;
  includeVariable?: boolean;
}

export interface LegalityFilterValue {
  state: "legal" | "restricted" | "banned" | "not_legal";
  formats: string[];
}

export type FilterValue = string | string[] | boolean | RangeFilterValue | LegalityFilterValue;

export interface FilterRule {
  id: string;
  field: FilterField;
  comparator: FilterComparator;
  value: FilterValue;
  negated?: boolean;
}

export interface FilterGroup {
  id: string;
  operator: "and" | "or";
  negated?: boolean;
  children: Array<FilterGroup | FilterRule>;
}

export interface FilterValidationResult {
  value: FilterGroup;
  notices: string[];
}

export const EMPTY_FILTER_GROUP: FilterGroup = {
  id: "root",
  operator: "and",
  children: [],
};

const FIELD_VALUES = new Set<string>(FILTER_FIELDS);
const COMPARATOR_VALUES = new Set<string>(FILTER_COMPARATORS);
const GROUP_OPERATORS = new Set(["and", "or"]);
const LEGALITY_STATES = new Set(["legal", "restricted", "banned", "not_legal"]);
const COLOR_VALUES = new Set(["W", "U", "B", "R", "G", "C"]);
const MAX_GROUP_DEPTH = 2;
const MAX_CHILDREN = 50;
const MAX_FILTER_JSON_LENGTH = 12_000;
const MAX_TEXT_LENGTH = 200;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

const STRING_ARRAY_FIELDS = new Set<FilterField>([
  "set",
  "language",
  "cardColor",
  "colorIdentity",
  "supertype",
  "cardType",
  "subtype",
  "artist",
  "keyword",
  "rarity",
  "finish",
  "condition",
]);
const RANGE_FIELDS = new Set<FilterField>([
  "manaValue",
  "power",
  "toughness",
  "loyalty",
  "releasedAt",
  "ownedQuantity",
]);
const BOOLEAN_FIELDS = new Set<FilterField>(["digital", "defaultObject"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeId(value: unknown, fallback: string): string {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : fallback;
}

function normalizedStrings(value: unknown, field: FilterField): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const strings = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= MAX_TEXT_LENGTH),
    ),
  );
  if (strings.length === 0) return null;
  if (field === "cardColor" || field === "colorIdentity") {
    const colors = strings.map((entry) => entry.toUpperCase());
    if (colors.some((entry) => !COLOR_VALUES.has(entry))) return null;
    if (colors.includes("C") && colors.length > 1) return null;
    return colors.sort();
  }
  return strings;
}

function normalizedRange(value: unknown, field: FilterField): RangeFilterValue | null {
  if (!isObject(value)) return null;
  const min = value.min === null || value.min === undefined ? null : Number(value.min);
  const max = value.max === null || value.max === undefined ? null : Number(value.max);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
    return null;
  }
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) return null;
  if ((field === "manaValue" || field === "ownedQuantity") && min !== null && min < 0) return null;
  return {
    min,
    max,
    ...(field === "power" || field === "toughness" || field === "loyalty"
      ? { includeVariable: value.includeVariable === true }
      : {}),
  };
}

function normalizedLegality(value: unknown): LegalityFilterValue | null {
  if (!isObject(value) || typeof value.state !== "string" || !LEGALITY_STATES.has(value.state)) {
    return null;
  }
  const formats = normalizedStrings(value.formats, "keyword");
  if (!formats) return null;
  return {
    state: value.state as LegalityFilterValue["state"],
    formats: formats.map((format) => format.toLowerCase()),
  };
}

function normalizedRule(value: unknown, fallbackId: string): FilterRule | null {
  if (!isObject(value) || typeof value.field !== "string" || !FIELD_VALUES.has(value.field)) {
    return null;
  }
  if (typeof value.comparator !== "string" || !COMPARATOR_VALUES.has(value.comparator)) {
    return null;
  }
  const field = value.field as FilterField;
  const comparator = value.comparator as FilterComparator;
  let normalizedValue: FilterValue | null = null;

  if (STRING_ARRAY_FIELDS.has(field)) {
    if (!["is", "isNot", "any", "all", "exactly", "excludes"].includes(comparator)) return null;
    normalizedValue = normalizedStrings(value.value, field);
  } else if (RANGE_FIELDS.has(field)) {
    if (comparator !== "between") return null;
    normalizedValue = normalizedRange(value.value, field);
  } else if (BOOLEAN_FIELDS.has(field)) {
    if (!["is", "isNot"].includes(comparator) || typeof value.value !== "boolean") return null;
    normalizedValue = value.value;
  } else if (field === "legality") {
    if (!["is", "isNot"].includes(comparator)) return null;
    normalizedValue = normalizedLegality(value.value);
  } else if (field === "rulesText") {
    if (!["contains", "doesNotContain", "exactPhrase"].includes(comparator)) return null;
    const text = typeof value.value === "string" ? value.value.trim() : "";
    normalizedValue = text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
  }

  return normalizedValue === null
    ? null
    : {
        id: normalizeId(value.id, fallbackId),
        field,
        comparator,
        value: normalizedValue,
        ...(value.negated === true ? { negated: true } : {}),
      };
}

function normalizedGroup(
  value: unknown,
  depth: number,
  path: string,
  notices: string[],
): FilterGroup | null {
  if (
    !isObject(value) ||
    typeof value.operator !== "string" ||
    !GROUP_OPERATORS.has(value.operator)
  ) {
    return null;
  }
  if (depth > MAX_GROUP_DEPTH) {
    notices.push("Filter groups may be nested at most two levels; deeper groups were removed.");
    return null;
  }
  if (!Array.isArray(value.children)) return null;
  const children: Array<FilterGroup | FilterRule> = [];
  value.children.slice(0, MAX_CHILDREN).forEach((child, index) => {
    const childPath = `${path}-${index}`;
    const group =
      isObject(child) && Array.isArray(child.children)
        ? normalizedGroup(child, depth + 1, childPath, notices)
        : null;
    const rule = group ? null : normalizedRule(child, `rule-${childPath}`);
    if (group) children.push(group);
    else if (rule) children.push(rule);
    else notices.push("An invalid filter rule was removed.");
  });
  if (value.children.length > MAX_CHILDREN) {
    notices.push(
      `A filter group is limited to ${MAX_CHILDREN} entries; extra entries were removed.`,
    );
  }
  return {
    id: normalizeId(value.id, depth === 0 ? "root" : `group-${path}`),
    operator: value.operator as FilterGroup["operator"],
    ...(value.negated === true ? { negated: true } : {}),
    children,
  };
}

export function validateFilterGroup(value: unknown): FilterValidationResult {
  const notices: string[] = [];
  const normalized = normalizedGroup(value, 0, "root", notices);
  if (!normalized) {
    return {
      value: { ...EMPTY_FILTER_GROUP, children: [] },
      notices: ["The filter expression was invalid and has been reset."],
    };
  }
  return { value: normalized, notices: Array.from(new Set(notices)) };
}

export function parseFilterParameter(raw: string): FilterValidationResult {
  if (!raw) return { value: { ...EMPTY_FILTER_GROUP, children: [] }, notices: [] };
  if (raw.length > MAX_FILTER_JSON_LENGTH) {
    return {
      value: { ...EMPTY_FILTER_GROUP, children: [] },
      notices: ["The filter expression was too large and has been reset."],
    };
  }
  try {
    return validateFilterGroup(JSON.parse(raw));
  } catch {
    return {
      value: { ...EMPTY_FILTER_GROUP, children: [] },
      notices: ["The filter expression could not be read and has been reset."],
    };
  }
}

export function serializeFilterGroup(group: FilterGroup): string {
  return group.children.length ? JSON.stringify(validateFilterGroup(group).value) : "";
}

export function isFilterGroup(value: FilterGroup | FilterRule): value is FilterGroup {
  return "children" in value;
}

export function flattenFilterRules(group: FilterGroup): FilterRule[] {
  return group.children.flatMap((child) =>
    isFilterGroup(child) ? flattenFilterRules(child) : [child],
  );
}

export function activeFilterCount(group: FilterGroup): number {
  return flattenFilterRules(group).length;
}

export function ruleForField(group: FilterGroup, field: FilterField): FilterRule | null {
  return flattenFilterRules(group).find((rule) => rule.field === field) ?? null;
}

export function removeFilterNode(group: FilterGroup, id: string): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((child) => child.id !== id)
      .map((child) => (isFilterGroup(child) ? removeFilterNode(child, id) : child)),
  };
}

export function clearFilterField(group: FilterGroup, field: FilterField): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((child) => isFilterGroup(child) || child.field !== field)
      .map((child) => (isFilterGroup(child) ? clearFilterField(child, field) : child)),
  };
}

export function upsertBasicFilterRule(group: FilterGroup, rule: FilterRule | null): FilterGroup {
  if (!rule) return group;
  const withoutField = clearFilterField(group, rule.field);
  return { ...withoutField, operator: "and", children: [...withoutField.children, rule] };
}

export function filterGroupEquals(left: FilterGroup, right: FilterGroup): boolean {
  return serializeFilterGroup(left) === serializeFilterGroup(right);
}

export function evaluateFilterGroup(
  group: FilterGroup,
  matchesRule: (rule: FilterRule) => boolean,
): boolean {
  const values = group.children.map((child) =>
    isFilterGroup(child)
      ? evaluateFilterGroup(child, matchesRule)
      : child.negated
        ? !matchesRule(child)
        : matchesRule(child),
  );
  const matched = group.operator === "and" ? values.every(Boolean) : values.some(Boolean);
  return group.negated ? !matched : matched;
}
