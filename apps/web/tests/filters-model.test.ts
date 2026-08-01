import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTER_GROUP,
  activeFilterCount,
  clearFilterField,
  evaluateFilterGroup,
  parseFilterParameter,
  removeFilterNode,
  serializeFilterGroup,
  upsertBasicFilterRule,
  validateFilterGroup,
  type FilterGroup,
  type FilterRule,
} from "@/features/filters/model";

const setRule: FilterRule = {
  id: "set",
  field: "set",
  comparator: "isNot",
  value: ["LEA", "2XM"],
};

const typeRule: FilterRule = {
  id: "type",
  field: "cardType",
  comparator: "all",
  value: ["Artifact", "Creature"],
};

describe("shared filter model", () => {
  it("round-trips one typed URL expression without losing include/exclude state", () => {
    const group: FilterGroup = {
      id: "root",
      operator: "and",
      children: [setRule, typeRule],
    };
    const serialized = serializeFilterGroup(group);
    expect(parseFilterParameter(serialized)).toEqual({ value: group, notices: [] });
  });

  it("keeps quick and advanced controls synchronized through field upsert and clear", () => {
    const initial = { ...EMPTY_FILTER_GROUP, children: [setRule] };
    const replaced = upsertBasicFilterRule(initial, {
      ...setRule,
      comparator: "is",
      value: ["MKM"],
    });
    expect(activeFilterCount(replaced)).toBe(1);
    expect(replaced.children).toContainEqual(expect.objectContaining({ value: ["MKM"] }));
    expect(clearFilterField(replaced, "set").children).toEqual([]);
  });

  it("removes individual nested rules without removing their group", () => {
    const nested: FilterGroup = {
      id: "root",
      operator: "and",
      children: [{ id: "or", operator: "or", children: [setRule, typeRule] }],
    };
    expect(removeFilterNode(nested, "set")).toEqual({
      ...nested,
      children: [{ id: "or", operator: "or", children: [typeRule] }],
    });
  });

  it("evaluates AND, OR, rule NOT, and group NOT", () => {
    const group: FilterGroup = {
      id: "root",
      operator: "and",
      children: [
        setRule,
        {
          id: "not-or",
          operator: "or",
          negated: true,
          children: [typeRule, { ...typeRule, id: "not-type", negated: true }],
        },
      ],
    };
    expect(evaluateFilterGroup(group, (rule) => rule.id === "set" || rule.id === "not-type")).toBe(
      true,
    );
  });

  it("enforces two nested group levels and removes deeper rules", () => {
    const tooDeep = {
      id: "root",
      operator: "and",
      children: [
        {
          id: "one",
          operator: "and",
          children: [
            {
              id: "two",
              operator: "or",
              children: [
                {
                  id: "three",
                  operator: "and",
                  children: [setRule],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = validateFilterGroup(tooDeep);
    expect(result.notices).toContain(
      "Filter groups may be nested at most two levels; deeper groups were removed.",
    );
    expect(activeFilterCount(result.value)).toBe(0);
  });

  it("rejects colorless combined with colored mana symbols", () => {
    const result = validateFilterGroup({
      id: "root",
      operator: "and",
      children: [
        { id: "identity", field: "colorIdentity", comparator: "exactly", value: ["C", "W"] },
      ],
    });
    expect(result.value.children).toEqual([]);
    expect(result.notices).toContain("An invalid filter rule was removed.");
  });

  it("clears invalid and oversized URL payloads safely", () => {
    expect(parseFilterParameter("not-json").value.children).toEqual([]);
    expect(parseFilterParameter("x".repeat(12_001)).notices[0]).toMatch(/too large/i);
  });
});
