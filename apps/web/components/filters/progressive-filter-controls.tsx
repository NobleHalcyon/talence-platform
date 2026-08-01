"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  Button,
  Checkbox,
  FilterDrawer,
  SearchInput,
  Select,
  TextInput,
  Tooltip,
} from "@talence/ui";

import {
  COLOR_OPTIONS,
  CONDITION_OPTIONS,
  FACET_FIELDS,
  FILTER_FIELD_LABELS,
  LEGALITY_STATE_OPTIONS,
  optionLabel,
  type FilterFacetPage,
  type FilterOption,
} from "@/features/filters/facets";
import {
  EMPTY_FILTER_GROUP,
  activeFilterCount,
  clearFilterField,
  flattenFilterRules,
  isFilterGroup,
  removeFilterNode,
  ruleForField,
  serializeFilterGroup,
  upsertBasicFilterRule,
  type FilterComparator,
  type FilterField,
  type FilterGroup,
  type FilterRule,
  type LegalityFilterValue,
  type RangeFilterValue,
} from "@/features/filters/model";

import styles from "./progressive-filter-controls.module.css";

type FilterScope = "catalog" | "collection";

interface ScopeState {
  includeDigital?: boolean;
  includeNondefault?: boolean;
  returnAllVariants?: boolean;
}

export interface ProgressiveFilterControlsProps {
  action: string;
  query: string;
  filters: FilterGroup;
  preservedParameters: Record<string, string | number | boolean | null | undefined>;
  scope: FilterScope;
  scopeState?: ScopeState;
  resultCount?: number | null;
}

const QUICK_FIELDS: FilterField[] = ["colorIdentity", "cardType", "set", "rarity", "manaValue"];
const CARD_FIELDS: FilterField[] = [
  "cardColor",
  "colorIdentity",
  "supertype",
  "cardType",
  "subtype",
  "manaValue",
  "power",
  "toughness",
  "loyalty",
  "keyword",
  "rulesText",
  "legality",
];
const PRINTING_FIELDS: FilterField[] = [
  "set",
  "language",
  "rarity",
  "finish",
  "artist",
  "releasedAt",
];
const COLLECTION_FIELDS: FilterField[] = ["condition", "ownedQuantity"];
const ARRAY_FIELDS = new Set<FilterField>([
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
const MATCH_COMPARATORS: FilterComparator[] = ["any", "all", "exactly", "excludes"];
const INCLUDE_COMPARATORS: FilterComparator[] = ["is", "isNot"];

function identifier(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildHref(
  action: string,
  query: string,
  filters: FilterGroup,
  preserved: ProgressiveFilterControlsProps["preservedParameters"],
): string {
  const parameters = new URLSearchParams();
  if (query.trim()) parameters.set("q", query.trim());
  const serialized = serializeFilterGroup(filters);
  if (serialized) parameters.set("filters", serialized);
  Object.entries(preserved).forEach(([name, value]) => {
    if (value === null || value === undefined || value === false || value === "") return;
    parameters.set(name, value === true ? "1" : String(value));
  });
  const search = parameters.toString();
  return search ? `${action}?${search}` : action;
}

function staticOptions(field: FilterField): FilterOption[] | null {
  if (field === "cardColor" || field === "colorIdentity") return COLOR_OPTIONS;
  if (field === "condition") return CONDITION_OPTIONS;
  return null;
}

function selectedStrings(rule: FilterRule | null): string[] {
  return rule && Array.isArray(rule.value) ? rule.value : [];
}

function comparatorLabel(comparator: FilterComparator): string {
  return (
    {
      is: "IS",
      isNot: "IS NOT",
      any: "Match any",
      all: "Match all",
      exactly: "Match exactly",
      excludes: "Exclude",
      between: "Between",
      contains: "Contains",
      doesNotContain: "Does not contain",
      exactPhrase: "Exact phrase",
    } as Record<FilterComparator, string>
  )[comparator];
}

function useFacetOptions(
  field: FilterField,
  search: string,
  selected: string[],
  enabled: boolean,
  facetOverride?: string,
) {
  const initial = staticOptions(field) ?? selected.map((value) => ({ value, label: value }));
  const [options, setOptions] = useState<FilterOption[]>(initial);
  const [loading, setLoading] = useState(false);
  const facet = facetOverride ?? FACET_FIELDS[field];
  const selectedKey = JSON.stringify(selected);
  useEffect(() => {
    if (!enabled) return;
    if (staticOptions(field)) return;
    if (!facet) return;
    const selectedValues = JSON.parse(selectedKey) as string[];
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const parameters = new URLSearchParams({ field: facet, limit: "60" });
        if (search.trim()) parameters.set("q", search.trim());
        const response = await fetch(`/api/catalog/facets?${parameters}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const page = (await response.json()) as FilterFacetPage;
        setOptions((current) => {
          const map = new Map(
            current
              .filter((option) => selectedValues.includes(option.value))
              .map((option) => [option.value, option]),
          );
          page.items.forEach((option) => map.set(option.value, option));
          return [...map.values()];
        });
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, facet, field, search, selectedKey]);
  return { options, loading };
}

function FilterSymbol({ option }: { option: FilterOption }) {
  return option.symbolUri ? (
    <Tooltip content={option.label}>
      <span className={styles.symbolTooltip}>
        {/* The URI is always a same-origin Talence asset route. */}
        <Image
          className={styles.optionSymbol}
          src={option.symbolUri}
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          unoptimized
        />
      </span>
    </Tooltip>
  ) : (
    <span className={styles.fallbackSymbol} aria-hidden="true">
      ✦
    </span>
  );
}

function MultiSelect({
  field,
  rule,
  onChange,
  compact = false,
  facetOverride,
  labelOverride,
}: {
  field: FilterField;
  rule: FilterRule | null;
  onChange: (rule: FilterRule | null) => void;
  compact?: boolean;
  facetOverride?: string;
  labelOverride?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = selectedStrings(rule);
  const { options, loading } = useFacetOptions(field, search, selected, open, facetOverride);
  const comparatorChoices =
    field === "cardColor" ||
    field === "colorIdentity" ||
    field === "supertype" ||
    field === "cardType" ||
    field === "subtype" ||
    field === "keyword"
      ? MATCH_COMPARATORS
      : INCLUDE_COMPARATORS;
  const comparator = rule?.comparator ?? comparatorChoices[0];
  const fieldLabel = labelOverride ?? FILTER_FIELD_LABELS[field];

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function commit(values: string[], nextComparator: FilterComparator = comparator) {
    onChange(
      values.length
        ? {
            id: rule?.id ?? identifier(field),
            field,
            comparator: nextComparator,
            value: values,
          }
        : null,
    );
  }
  const label = selected.length ? `${fieldLabel} · ${selected.length}` : fieldLabel;
  return (
    <div className={`${styles.selector} ${compact ? styles.selectorCompact : ""}`} ref={rootRef}>
      <button
        type="button"
        className={styles.selectorButton}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className={styles.selectorPopover}>
          <label className={styles.controlLabel}>
            Include or exclude
            <Select
              value={comparator}
              onChange={(event) => commit(selected, event.target.value as FilterComparator)}
            >
              {comparatorChoices.map((value) => (
                <option value={value} key={value}>
                  {comparatorLabel(value)}
                </option>
              ))}
            </Select>
          </label>
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${fieldLabel.toLowerCase()}`}
            autoFocus
          />
          {selected.length ? (
            <div className={styles.selectedPills} aria-label={`Selected ${fieldLabel}`}>
              {selected.map((value) => {
                const option = options.find((candidate) => candidate.value === value) ?? {
                  value,
                  label: value,
                };
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => commit(selected.filter((entry) => entry !== value))}
                  >
                    <strong>{comparatorLabel(comparator)}</strong> {optionLabel(option)}{" "}
                    <span aria-hidden="true">×</span>
                  </button>
                );
              })}
              <button type="button" className={styles.clearField} onClick={() => commit([])}>
                Clear {fieldLabel.toLowerCase()}
              </button>
            </div>
          ) : null}
          <div
            className={styles.optionList}
            role="listbox"
            aria-multiselectable="true"
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
              );
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "ArrowDown"
                  ? buttons[(current + 1 + buttons.length) % buttons.length]
                  : buttons[(current - 1 + buttons.length) % buttons.length];
              if (next) {
                event.preventDefault();
                next.focus();
              }
            }}
          >
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  key={option.value}
                  className={checked ? styles.optionSelected : undefined}
                  onClick={() =>
                    commit(
                      checked
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value],
                    )
                  }
                >
                  <FilterSymbol option={option} />
                  <span>
                    <strong>{option.label}</strong>
                    {option.secondary ? <small>{option.secondary}</small> : null}
                  </span>
                  <span className={styles.optionCheck} aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                </button>
              );
            })}
            {loading ? <p className={styles.optionStatus}>Loading…</p> : null}
            {!loading && options.length === 0 ? (
              <p className={styles.optionStatus}>No matching options</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RangeFilter({
  field,
  rule,
  onChange,
  compact = false,
}: {
  field: FilterField;
  rule: FilterRule | null;
  onChange: (rule: FilterRule | null) => void;
  compact?: boolean;
}) {
  const value =
    rule?.value && !Array.isArray(rule.value) && typeof rule.value === "object"
      ? (rule.value as RangeFilterValue)
      : { min: null, max: null };
  const defaults =
    field === "manaValue" ? [0, 20] : field === "ownedQuantity" ? [1, 100] : [-10, 20];
  const active = rule !== null;
  function commit(min: number | null, max: number | null, includeVariable = value.includeVariable) {
    onChange(
      min === null && max === null
        ? null
        : {
            id: rule?.id ?? identifier(field),
            field,
            comparator: "between",
            value: {
              min,
              max,
              ...(field === "power" || field === "toughness" || field === "loyalty"
                ? { includeVariable }
                : {}),
            },
          },
    );
  }
  if (field === "releasedAt") {
    const dateValue = (instant: number | null) =>
      instant === null ? "" : new Date(instant).toISOString().slice(0, 10);
    return (
      <div className={styles.rangeControl}>
        <div className={styles.rangeHeader}>
          <strong>Release date</strong>
          {active ? (
            <button type="button" onClick={() => onChange(null)}>
              Clear
            </button>
          ) : null}
        </div>
        <div className={styles.rangeNumbers}>
          <label>
            Released from
            <input
              type="date"
              value={dateValue(value.min)}
              onChange={(event) =>
                commit(
                  event.target.value ? Date.parse(`${event.target.value}T00:00:00Z`) : null,
                  value.max,
                )
              }
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            Released through
            <input
              type="date"
              value={dateValue(value.max)}
              onChange={(event) =>
                commit(
                  value.min,
                  event.target.value ? Date.parse(`${event.target.value}T00:00:00Z`) : null,
                )
              }
            />
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className={`${styles.rangeControl} ${compact ? styles.rangeCompact : ""}`}>
      <div className={styles.rangeHeader}>
        <strong>{FILTER_FIELD_LABELS[field]}</strong>
        {active ? (
          <button type="button" onClick={() => onChange(null)}>
            Clear
          </button>
        ) : (
          <button type="button" onClick={() => commit(defaults[0], defaults[1])}>
            Set range
          </button>
        )}
      </div>
      <div className={styles.rangeNumbers}>
        <label>
          Minimum
          <input
            type="number"
            step="any"
            value={value.min ?? ""}
            onChange={(event) =>
              commit(event.target.value === "" ? null : Number(event.target.value), value.max)
            }
          />
        </label>
        <span aria-hidden="true">–</span>
        <label>
          Maximum
          <input
            type="number"
            step="any"
            value={value.max ?? ""}
            onChange={(event) =>
              commit(value.min, event.target.value === "" ? null : Number(event.target.value))
            }
          />
        </label>
      </div>
      {active ? (
        <div className={styles.dualSlider} aria-label={`${FILTER_FIELD_LABELS[field]} range`}>
          <input
            type="range"
            min={defaults[0]}
            max={defaults[1]}
            step="0.5"
            value={Math.min(value.min ?? defaults[0], defaults[1])}
            onChange={(event) => commit(Number(event.target.value), value.max)}
            aria-label={`${FILTER_FIELD_LABELS[field]} minimum slider`}
          />
          <input
            type="range"
            min={defaults[0]}
            max={defaults[1]}
            step="0.5"
            value={Math.min(value.max ?? defaults[1], defaults[1])}
            onChange={(event) => commit(value.min, Number(event.target.value))}
            aria-label={`${FILTER_FIELD_LABELS[field]} maximum slider`}
          />
        </div>
      ) : null}
      {active && (field === "power" || field === "toughness" || field === "loyalty") ? (
        <Checkbox
          label="Include variable values (*, X, expressions)"
          checked={value.includeVariable === true}
          onChange={(event) => commit(value.min, value.max, event.target.checked)}
        />
      ) : null}
    </div>
  );
}

function QuickRangeFilter({
  field,
  rule,
  onChange,
}: {
  field: FilterField;
  rule: FilterRule | null;
  onChange: (rule: FilterRule | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const value =
    rule?.value && !Array.isArray(rule.value) && typeof rule.value === "object"
      ? (rule.value as RangeFilterValue)
      : null;
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const summary = value
    ? `${FILTER_FIELD_LABELS[field]} · ${value.min ?? "any"}–${value.max ?? "any"}`
    : FILTER_FIELD_LABELS[field];
  return (
    <div className={`${styles.selector} ${styles.selectorCompact}`} ref={rootRef}>
      <button
        type="button"
        className={styles.selectorButton}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{summary}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div
          className={styles.selectorPopover}
          role="dialog"
          aria-label={`${FILTER_FIELD_LABELS[field]} quick filter`}
        >
          <RangeFilter field={field} rule={rule} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

function RulesTextFilter({
  rule,
  onChange,
}: {
  rule: FilterRule | null;
  onChange: (rule: FilterRule | null) => void;
}) {
  const comparator = rule?.comparator ?? "contains";
  const text = typeof rule?.value === "string" ? rule.value : "";
  function commit(value: string, nextComparator = comparator) {
    onChange(
      value.trim()
        ? {
            id: rule?.id ?? identifier("rules"),
            field: "rulesText",
            comparator: nextComparator,
            value,
          }
        : null,
    );
  }
  return (
    <div className={styles.textFilter}>
      <label className={styles.controlLabel}>
        Rules text
        <Select
          value={comparator}
          onChange={(event) => commit(text, event.target.value as FilterComparator)}
        >
          <option value="contains">Contains</option>
          <option value="doesNotContain">Does not contain</option>
          <option value="exactPhrase">Exact phrase</option>
        </Select>
      </label>
      <TextInput
        value={text}
        maxLength={200}
        onChange={(event) => commit(event.target.value)}
        placeholder="Oracle or rules text"
      />
    </div>
  );
}

function LegalityFilter({
  rule,
  onChange,
}: {
  rule: FilterRule | null;
  onChange: (rule: FilterRule | null) => void;
}) {
  const value =
    rule?.value && !Array.isArray(rule.value) && typeof rule.value === "object"
      ? (rule.value as LegalityFilterValue)
      : { state: "legal" as const, formats: [] };
  const formatRule: FilterRule | null = value.formats.length
    ? {
        id: "legality-formats",
        field: "keyword",
        comparator: "any",
        value: value.formats,
      }
    : null;
  function commit(
    state: LegalityFilterValue["state"],
    formats: string[],
    comparator = rule?.comparator ?? "is",
  ) {
    onChange(
      formats.length
        ? {
            id: rule?.id ?? identifier("legality"),
            field: "legality",
            comparator,
            value: { state, formats },
          }
        : null,
    );
  }
  return (
    <div className={styles.legalityControl}>
      <label className={styles.controlLabel}>
        Legality state
        <Select
          value={value.state}
          onChange={(event) =>
            commit(event.target.value as LegalityFilterValue["state"], value.formats)
          }
        >
          {LEGALITY_STATE_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <MultiSelect
        field="keyword"
        facetOverride="format"
        labelOverride="Format"
        rule={formatRule}
        onChange={(next) => commit(value.state, selectedStrings(next))}
      />
    </div>
  );
}

function FieldControl({
  field,
  group,
  onGroupChange,
  compact = false,
}: {
  field: FilterField;
  group: FilterGroup;
  onGroupChange: (group: FilterGroup) => void;
  compact?: boolean;
}) {
  const rule = ruleForField(group, field);
  const change = (next: FilterRule | null) =>
    onGroupChange(next ? upsertBasicFilterRule(group, next) : clearFilterField(group, field));
  if (ARRAY_FIELDS.has(field))
    return <MultiSelect field={field} rule={rule} onChange={change} compact={compact} />;
  if (RANGE_FIELDS.has(field))
    return compact ? (
      <QuickRangeFilter field={field} rule={rule} onChange={change} />
    ) : (
      <RangeFilter field={field} rule={rule} onChange={change} />
    );
  if (field === "rulesText") return <RulesTextFilter rule={rule} onChange={change} />;
  if (field === "legality") return <LegalityFilter rule={rule} onChange={change} />;
  return null;
}

function emptyRuleValue(field: FilterField): Pick<FilterRule, "comparator" | "value"> {
  if (ARRAY_FIELDS.has(field)) return { comparator: "is", value: [] };
  if (RANGE_FIELDS.has(field)) return { comparator: "between", value: { min: null, max: null } };
  if (field === "legality")
    return {
      comparator: "is",
      value: { state: "legal", formats: [] },
    };
  return { comparator: "contains", value: "" };
}

function LogicRuleEditor({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  fields: FilterField[];
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}) {
  const negative = rule.negated === true;
  function toggleNot(checked: boolean) {
    onChange({ ...rule, negated: checked || undefined });
  }
  const isolated: FilterGroup = { ...EMPTY_FILTER_GROUP, children: [rule] };
  return (
    <div className={styles.logicRule}>
      <div className={styles.logicRuleHeader}>
        <Select
          aria-label="Filter field"
          value={rule.field}
          onChange={(event) =>
            onChange({
              id: rule.id,
              field: event.target.value as FilterField,
              ...emptyRuleValue(event.target.value as FilterField),
              ...(rule.negated ? { negated: true } : {}),
            })
          }
        >
          {fields.map((field) => (
            <option key={field} value={field}>
              {FILTER_FIELD_LABELS[field]}
            </option>
          ))}
        </Select>
        <Checkbox
          label="NOT"
          checked={negative}
          onChange={(event) => toggleNot(event.target.checked)}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${FILTER_FIELD_LABELS[rule.field]} rule`}
        >
          ×
        </button>
      </div>
      <FieldControl
        field={rule.field}
        group={isolated}
        onGroupChange={(next) => {
          const replacement = flattenFilterRules(next)[0];
          if (replacement)
            onChange({ ...replacement, id: rule.id, ...(rule.negated ? { negated: true } : {}) });
        }}
      />
    </div>
  );
}

function LogicGroupEditor({
  group,
  fields,
  depth,
  onChange,
  onRemove,
}: {
  group: FilterGroup;
  fields: FilterField[];
  depth: number;
  onChange: (group: FilterGroup) => void;
  onRemove?: () => void;
}) {
  function replaceChild(id: string, child: FilterGroup | FilterRule) {
    onChange({
      ...group,
      children: group.children.map((entry) => (entry.id === id ? child : entry)),
    });
  }
  return (
    <div className={styles.logicGroup}>
      <div className={styles.logicGroupHeader}>
        <Select
          aria-label={depth === 0 ? "Root logic operator" : "Nested logic operator"}
          value={group.operator}
          onChange={(event) => onChange({ ...group, operator: event.target.value as "and" | "or" })}
        >
          <option value="and">Match all (AND)</option>
          <option value="or">Match any (OR)</option>
        </Select>
        <Checkbox
          label="NOT group"
          checked={group.negated === true}
          onChange={(event) => onChange({ ...group, negated: event.target.checked || undefined })}
        />
        {onRemove ? (
          <button type="button" onClick={onRemove}>
            Remove group
          </button>
        ) : null}
      </div>
      {group.children.map((child) =>
        isFilterGroup(child) ? (
          <LogicGroupEditor
            key={child.id}
            group={child}
            fields={fields}
            depth={depth + 1}
            onChange={(next) => replaceChild(child.id, next)}
            onRemove={() => onChange(removeFilterNode(group, child.id))}
          />
        ) : (
          <LogicRuleEditor
            key={child.id}
            rule={child}
            fields={fields}
            onChange={(next) => replaceChild(child.id, next)}
            onRemove={() => onChange(removeFilterNode(group, child.id))}
          />
        ),
      )}
      <div className={styles.logicActions}>
        <Button
          type="button"
          size="small"
          variant="secondary"
          onClick={() =>
            onChange({
              ...group,
              children: [
                ...group.children,
                {
                  id: identifier("logic-rule"),
                  field: "cardType",
                  comparator: "is",
                  value: ["Creature"],
                },
              ],
            })
          }
        >
          Add rule
        </Button>
        {depth < 2 ? (
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() =>
              onChange({
                ...group,
                children: [
                  ...group.children,
                  {
                    id: identifier("logic-group"),
                    operator: "and",
                    children: [],
                  },
                ],
              })
            }
          >
            Add group
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function chipLabel(rule: FilterRule): string {
  if (Array.isArray(rule.value))
    return `${FILTER_FIELD_LABELS[rule.field]}: ${comparatorLabel(rule.comparator)} ${rule.value.join("/")}`;
  if (typeof rule.value === "string" || typeof rule.value === "boolean")
    return `${FILTER_FIELD_LABELS[rule.field]}: ${String(rule.value)}`;
  if (rule.field === "legality") {
    const value = rule.value as LegalityFilterValue;
    return `${value.state.replace("_", " ")} in ${value.formats.join(", ")}`;
  }
  const range = rule.value as RangeFilterValue;
  return `${FILTER_FIELD_LABELS[rule.field]}: ${range.min ?? "any"}–${range.max ?? "any"}${range.includeVariable ? " + variable" : ""}`;
}

export function ProgressiveFilterControls(props: ProgressiveFilterControlsProps) {
  const router = useRouter();
  const pendingQuickNavigation = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logicMode, setLogicMode] = useState(false);
  const [liveFilters, setLiveFilters] = useState(props.filters);
  const incomingFilterKey = serializeFilterGroup(props.filters);
  const [lastIncomingFilterKey, setLastIncomingFilterKey] = useState(incomingFilterKey);
  if (incomingFilterKey !== lastIncomingFilterKey) {
    setLastIncomingFilterKey(incomingFilterKey);
    setLiveFilters(props.filters);
  }
  const [draft, setDraft] = useState(props.filters);
  const [draftScope, setDraftScope] = useState<ScopeState>(props.scopeState ?? {});
  const searchId = useId();
  const count = activeFilterCount(liveFilters);
  const scopeCount =
    props.scope === "catalog"
      ? [
          props.scopeState?.includeDigital,
          props.scopeState?.includeNondefault,
          props.scopeState?.returnAllVariants,
        ].filter(Boolean).length
      : 0;
  const totalCount = count + scopeCount;
  function scopeParameters(scope: ScopeState) {
    return props.scope === "catalog"
      ? {
          digital: scope.includeDigital === true,
          nondefault: scope.includeNondefault === true,
          variants: scope.returnAllVariants ? "all" : null,
        }
      : {};
  }
  useEffect(
    () => () => {
      if (pendingQuickNavigation.current) clearTimeout(pendingQuickNavigation.current);
    },
    [],
  );
  function navigate(
    filters: FilterGroup,
    scope = props.scopeState ?? {},
    debounceQuickFilter = false,
  ) {
    setLiveFilters(filters);
    const href = buildHref(props.action, props.query, filters, {
      ...props.preservedParameters,
      ...scopeParameters(scope),
      cursor: null,
    });
    if (pendingQuickNavigation.current) clearTimeout(pendingQuickNavigation.current);
    if (debounceQuickFilter) {
      pendingQuickNavigation.current = setTimeout(() => {
        pendingQuickNavigation.current = null;
        router.push(href);
      }, 300);
      return;
    }
    router.push(href);
  }
  return (
    <div className={styles.filterSystem}>
      <form className={styles.searchRow} action={props.action} method="get" role="search">
        <label htmlFor={searchId}>Search</label>
        <SearchInput
          id={searchId}
          name="q"
          defaultValue={props.query}
          minLength={2}
          maxLength={120}
          placeholder={
            props.scope === "catalog"
              ? "Card name, rules text, or type"
              : "Card, set, or collector number"
          }
        />
        {serializeFilterGroup(liveFilters) ? (
          <input type="hidden" name="filters" value={serializeFilterGroup(liveFilters)} />
        ) : null}
        {Object.entries(props.preservedParameters).map(([name, value]) =>
          value !== null && value !== undefined && value !== false && value !== "" ? (
            <input
              key={name}
              type="hidden"
              name={name}
              value={value === true ? "1" : String(value)}
            />
          ) : null,
        )}
        <Button type="submit">Search</Button>
      </form>
      <div className={styles.quickRow} aria-label="Quick filters">
        {QUICK_FIELDS.map((field) => (
          <FieldControl
            key={field}
            field={field}
            group={liveFilters}
            onGroupChange={(filters) => navigate(filters, props.scopeState ?? {}, true)}
            compact
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDraft(liveFilters);
            setDraftScope(props.scopeState ?? {});
            setDrawerOpen(true);
          }}
        >
          Advanced filters{totalCount ? ` (${totalCount})` : ""}
        </Button>
      </div>
      {totalCount ? (
        <div className={styles.activeChips} aria-label="Active filters">
          {flattenFilterRules(liveFilters).map((rule) => (
            <button
              type="button"
              key={rule.id}
              onClick={() => navigate(removeFilterNode(liveFilters, rule.id))}
            >
              {chipLabel(rule)} <span aria-hidden="true">×</span>
              <span className={styles.visuallyHidden}>Remove filter</span>
            </button>
          ))}
          {props.scopeState?.returnAllVariants ? (
            <button
              type="button"
              onClick={() =>
                navigate(liveFilters, { ...props.scopeState, returnAllVariants: false })
              }
            >
              All variants <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {props.scopeState?.includeDigital ? (
            <button
              type="button"
              onClick={() => navigate(liveFilters, { ...props.scopeState, includeDigital: false })}
            >
              Digital included <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {props.scopeState?.includeNondefault ? (
            <button
              type="button"
              onClick={() =>
                navigate(liveFilters, { ...props.scopeState, includeNondefault: false })
              }
            >
              Nondefault objects included <span aria-hidden="true">×</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.clearAll}
            onClick={() => navigate({ ...EMPTY_FILTER_GROUP, children: [] }, {})}
          >
            Clear all
          </button>
        </div>
      ) : null}
      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        className={styles.advancedPanel}
        title="Advanced filters"
        description="Separate fields combine with AND in normal mode. Logic mode supports nested AND, OR, and NOT groups."
        footer={
          <div className={styles.drawerFooter}>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...EMPTY_FILTER_GROUP, children: [] });
                setDraftScope({});
              }}
            >
              Clear all
            </button>
            <span>
              {props.resultCount !== null && props.resultCount !== undefined
                ? `${props.resultCount.toLocaleString()} current results`
                : `${activeFilterCount(draft)} active`}
            </span>
            <Button
              type="button"
              onClick={() => {
                navigate(draft, draftScope);
                setDrawerOpen(false);
              }}
            >
              Apply filters
            </Button>
          </div>
        }
      >
        <div className={styles.modeToggle} role="group" aria-label="Filter editing mode">
          <Button
            type="button"
            size="small"
            variant={!logicMode ? "primary" : "secondary"}
            onClick={() => setLogicMode(false)}
          >
            Normal
          </Button>
          <Button
            type="button"
            size="small"
            variant={logicMode ? "primary" : "secondary"}
            onClick={() => setLogicMode(true)}
          >
            Logic
          </Button>
        </div>
        {logicMode ? (
          <LogicGroupEditor
            group={draft}
            fields={[
              ...CARD_FIELDS,
              ...PRINTING_FIELDS,
              ...(props.scope === "collection" ? COLLECTION_FIELDS : []),
            ].filter((value, index, list) => list.indexOf(value) === index)}
            depth={0}
            onChange={setDraft}
          />
        ) : (
          <>
            <details open>
              <summary>Card characteristics</summary>
              <div className={styles.fieldGrid}>
                {CARD_FIELDS.map((field) => (
                  <FieldControl key={field} field={field} group={draft} onGroupChange={setDraft} />
                ))}
              </div>
            </details>
            <details open>
              <summary>Printing details</summary>
              <div className={styles.fieldGrid}>
                {PRINTING_FIELDS.map((field) => (
                  <FieldControl key={field} field={field} group={draft} onGroupChange={setDraft} />
                ))}
                {props.scope === "catalog" ? (
                  <div className={styles.scopeChecks}>
                    <Tooltip content="Select this to return all individual printings of a card. Leave this unchecked to only return one result per card.">
                      <Checkbox
                        label="Return all variants"
                        checked={draftScope.returnAllVariants === true}
                        onChange={(event) =>
                          setDraftScope({ ...draftScope, returnAllVariants: event.target.checked })
                        }
                      />
                    </Tooltip>
                    <Checkbox
                      label="Include digital printings"
                      checked={draftScope.includeDigital === true}
                      onChange={(event) =>
                        setDraftScope({ ...draftScope, includeDigital: event.target.checked })
                      }
                    />
                    <Checkbox
                      label="Include tokens, oversized, and other nondefault objects"
                      checked={draftScope.includeNondefault === true}
                      onChange={(event) =>
                        setDraftScope({ ...draftScope, includeNondefault: event.target.checked })
                      }
                    />
                  </div>
                ) : null}
              </div>
            </details>
            {props.scope === "collection" ? (
              <details open>
                <summary>Collection details</summary>
                <div className={styles.fieldGrid}>
                  {COLLECTION_FIELDS.map((field) => (
                    <FieldControl
                      key={field}
                      field={field}
                      group={draft}
                      onGroupChange={setDraft}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </FilterDrawer>
    </div>
  );
}
