import { describe, expect, it } from "vitest";

import { catalogSearchRpcArgs } from "@/features/catalog/data";
import {
  catalogHref,
  catalogQueryToSearchParams,
  defaultCatalogQuery,
  parseCatalogQuery,
  safeCatalogReturnPath,
} from "@/features/catalog/query";
import {
  CATALOG_GRID_PAGE_SIZE_RULES,
  catalogPageSizeForMedia,
} from "@/features/catalog/responsive";
import { flattenFilterRules } from "@/features/filters/model";

describe("catalog URL query contract", () => {
  it("defaults to populated Oracle grid mode with implicit English physical scope", () => {
    const query = defaultCatalogQuery();
    expect(query).toMatchObject({ view: "grid", returnAllVariants: false, includeDigital: false });
    expect(query.filters.children).toEqual([]);
    expect(catalogQueryToSearchParams(query).has("filters")).toBe(false);
  });

  it("translates supported legacy URLs into the shared AND filter group", () => {
    const parsed = parseCatalogQuery({
      q: "  lightning bolt ",
      set: " sta ",
      lang: " JA ",
      rarity: "RARE",
      finish: "FOIL",
      colors: "R",
      identity: "R,G",
      type: "Instant",
      mv_min: "1",
      mv_max: "4.5",
      digital: "1",
      nondefault: "1",
      variants: "all",
      released_from: "2020-01-01",
      released_to: "2026-07-26",
      sort: "price_desc",
      cursor: "opaque_cursor-1",
      view: "grid",
      page_size: "18",
    });
    const rules = flattenFilterRules(parsed.query.filters);
    expect(parsed.query).toMatchObject({
      query: "lightning bolt",
      includeDigital: true,
      includeNondefault: true,
      returnAllVariants: true,
      sort: "price_desc",
      pageSize: 18,
    });
    expect(rules.map((rule) => rule.field)).toEqual([
      "set",
      "language",
      "rarity",
      "finish",
      "cardColor",
      "colorIdentity",
      "cardType",
      "manaValue",
      "releasedAt",
    ]);
  });

  it("ignores removed price and currency filters with an explicit notice", () => {
    const parsed = parseCatalogQuery({ price: "available", currency: "USD" });
    expect(flattenFilterRules(parsed.query.filters)).toEqual([]);
    expect(parsed.notices).toContain(
      "Price availability and currency filters are no longer supported and were ignored.",
    );
    expect(catalogQueryToSearchParams(parsed.query).has("price")).toBe(false);
    expect(catalogQueryToSearchParams(parsed.query).has("currency")).toBe(false);
  });

  it("round trips grouped AND/OR/NOT filters in one URL parameter", () => {
    const filters = {
      id: "root",
      operator: "and" as const,
      children: [
        {
          id: "colors",
          operator: "or" as const,
          negated: true,
          children: [
            {
              id: "white",
              field: "colorIdentity" as const,
              comparator: "exactly" as const,
              value: ["W"],
            },
            {
              id: "blue",
              field: "colorIdentity" as const,
              comparator: "exactly" as const,
              value: ["U"],
            },
          ],
        },
      ],
    };
    const params = catalogQueryToSearchParams({ ...defaultCatalogQuery(), filters });
    const reparsed = parseCatalogQuery(Object.fromEntries(params)).query;
    expect(reparsed.filters).toEqual(filters);
  });

  it("rejects malformed or too-deep filter expressions", () => {
    const malformed = parseCatalogQuery({ filters: "{" });
    expect(malformed.query.filters.children).toEqual([]);
    expect(malformed.notices[0]).toContain("could not be read");
    const tooDeep = JSON.stringify({
      id: "root",
      operator: "and",
      children: [
        {
          id: "a",
          operator: "and",
          children: [
            {
              id: "b",
              operator: "and",
              children: [
                {
                  id: "c",
                  operator: "and",
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parseCatalogQuery({ filters: tooDeep }).notices).toContain(
      "Filter groups may be nested at most two levels; deeper groups were removed.",
    );
  });

  it("does not send one-character search or unsafe cursors", () => {
    const parsed = parseCatalogQuery({ q: "x", cursor: "has whitespace" });
    expect(parsed.query.query).toBe("");
    expect(parsed.query.cursor).toBeNull();
    expect(parsed.notices).toHaveLength(2);
  });

  it("serializes shareable view, cursor, scope, and variants", () => {
    const query = {
      ...defaultCatalogQuery("table"),
      query: "lotus",
      cursor: "next_opaque",
      returnAllVariants: true,
    };
    const params = catalogQueryToSearchParams(query);
    expect(params.get("q")).toBe("lotus");
    expect(params.get("cursor")).toBe("next_opaque");
    expect(params.get("variants")).toBe("all");
    expect(catalogHref(query)).toContain("view=table");
  });

  it("accepts only complete-row responsive page sizes", () => {
    expect(parseCatalogQuery({ page_size: "24" }).query.pageSize).toBe(24);
    expect(parseCatalogQuery({ page_size: "25" }).query.pageSize).toBe(30);
    const matches = new Set(["(min-width: 58rem)", "(min-width: 44rem)"]);
    expect(catalogPageSizeForMedia((media) => matches.has(media))).toBe(24);
    expect(CATALOG_GRID_PAGE_SIZE_RULES.map((rule) => rule.pageSize)).toEqual([30, 24, 18, 12]);
  });

  it("maps the shared model to the new validated RPC", () => {
    const query = parseCatalogQuery({ set: "LEA", variants: "all", sort: "newest" }).query;
    expect(catalogSearchRpcArgs(query)).toMatchObject({
      p_query: null,
      p_game_code: "mtg",
      p_filters: query.filters,
      p_sort: "newest",
      p_return_all_variants: true,
      p_limit: 30,
    });
    expect(catalogSearchRpcArgs(query)).not.toHaveProperty("p_has_price");
  });

  it("keeps detail back-navigation inside catalog routes", () => {
    expect(safeCatalogReturnPath("/app/catalog?q=lotus&view=grid")).toBe(
      "/app/catalog?q=lotus&view=grid",
    );
    expect(safeCatalogReturnPath("https://evil.example/app/catalog")).toBe("/app/catalog");
  });
});
