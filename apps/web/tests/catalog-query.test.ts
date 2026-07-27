import { describe, expect, it } from "vitest";

import { catalogSearchRpcArgs } from "@/features/catalog/data";
import {
  catalogHref,
  catalogQueryToSearchParams,
  defaultCatalogQuery,
  parseCatalogQuery,
  safeCatalogReturnPath,
} from "@/features/catalog/query";

describe("catalog URL query contract", () => {
  it("uses the saved view only when the URL does not choose one", () => {
    expect(parseCatalogQuery({}, "grid").query.view).toBe("grid");
    expect(parseCatalogQuery({ view: "table" }, "grid").query.view).toBe("table");
  });

  it("defaults to English and uses lang=all as the stable broadening sentinel", () => {
    const defaultQuery = parseCatalogQuery({}).query;
    const allLanguages = parseCatalogQuery({ lang: "ALL" }).query;

    expect(defaultQuery.language).toBe("en");
    expect(catalogQueryToSearchParams(defaultQuery).has("lang")).toBe(false);
    expect(allLanguages.language).toBe("all");
    expect(catalogQueryToSearchParams(allLanguages).get("lang")).toBe("all");
  });

  it("normalizes bounded search and filter values", () => {
    const parsed = parseCatalogQuery({
      q: "  lightning bolt ",
      set: " sta ",
      lang: " JA ",
      rarity: "RARE",
      finish: "FOIL",
      colors: "r,r,x",
      identity: "R,G",
      type: " Instant ",
      mv_min: "1",
      mv_max: "4.5",
      price: "available",
      currency: "usd",
      digital: "1",
      nondefault: "1",
      released_from: "2020-01-01",
      released_to: "2026-07-26",
      sort: "price_desc",
      cursor: "opaque_cursor-1",
      view: "grid",
    });

    expect(parsed.notices).toEqual([]);
    expect(parsed.query).toMatchObject({
      query: "lightning bolt",
      setCode: "STA",
      language: "ja",
      rarity: "rare",
      finish: "foil",
      colors: ["R"],
      colorIdentity: ["G", "R"],
      typeLine: "Instant",
      manaValueMin: 1,
      manaValueMax: 4.5,
      priceAvailability: "available",
      currency: "USD",
      includeDigital: true,
      includeNondefault: true,
      releasedFrom: "2020-01-01",
      releasedTo: "2026-07-26",
      sort: "price_desc",
      cursor: "opaque_cursor-1",
      view: "grid",
    });
  });

  it("does not send a one-character fuzzy query or an unsafe cursor", () => {
    const parsed = parseCatalogQuery({ q: "x", cursor: "has whitespace" });

    expect(parsed.query.query).toBe("");
    expect(parsed.query.cursor).toBeNull();
    expect(parsed.notices).toEqual([
      "Enter at least two characters for name or fuzzy text search.",
      "The catalog cursor was invalid and has been reset.",
    ]);
  });

  it("rejects invalid finish, calendar, cursor, and colorless combinations", () => {
    const parsed = parseCatalogQuery({
      finish: "glossy",
      colors: "C,R",
      identity: "C,U",
      released_from: "2026-02-31",
      released_to: "2026-13-01",
      cursor: "short",
    });

    expect(parsed.query).toMatchObject({
      finish: "",
      colors: [],
      colorIdentity: [],
      releasedFrom: "",
      releasedTo: "",
      cursor: null,
    });
    expect(parsed.notices).toEqual([
      "The finish filter was invalid and has been reset.",
      "Colorless cannot be combined with colored values; the conflicting filter was reset.",
      "The release start date was invalid and has been reset.",
      "The release end date was invalid and has been reset.",
      "The catalog cursor was invalid and has been reset.",
    ]);
  });

  it("resets set and language filters outside the SQL shape contract", () => {
    const parsed = parseCatalogQuery({
      set: "@",
      lang: "x",
    });

    expect(parsed.query).toMatchObject({
      setCode: "",
      language: "en",
    });
    expect(parsed.notices).toEqual([
      "The set code filter was invalid and has been reset.",
      "The language filter was invalid and has been reset to English.",
    ]);

    expect(
      parseCatalogQuery({
        set: `a${"_".repeat(31)}`,
        lang: `z${"0".repeat(15)}`,
      }).query,
    ).toMatchObject({
      setCode: `A${"_".repeat(31)}`,
      language: `z${"0".repeat(15)}`,
    });
  });

  it("accepts exact calendar dates and bounded base64url cursors", () => {
    expect(
      parseCatalogQuery({
        released_from: "2024-02-29",
        cursor: "abcdEF12_-",
      }).query,
    ).toMatchObject({
      releasedFrom: "2024-02-29",
      cursor: "abcdEF12_-",
    });
    expect(parseCatalogQuery({ released_from: "2025-02-29" }).query.releasedFrom).toBe("");
    expect(parseCatalogQuery({ cursor: "abcdEF12=" }).query.cursor).toBeNull();
    expect(parseCatalogQuery({ cursor: "a".repeat(2049) }).query.cursor).toBeNull();
  });

  it("serializes shareable view and opaque cursor state", () => {
    const query = {
      ...defaultCatalogQuery("table"),
      query: "lotus",
      cursor: "next_opaque",
    };
    const params = catalogQueryToSearchParams(query);

    expect(params.get("q")).toBe("lotus");
    expect(params.get("cursor")).toBe("next_opaque");
    expect(params.get("view")).toBe("table");
    expect(catalogHref(query)).toContain("cursor=next_opaque");
  });

  it("maps the URL model to the exact typed SQL RPC arguments", () => {
    const query = parseCatalogQuery({
      q: "lotus",
      lang: "ja",
      finish: "foil",
      currency: "EUR",
      mv_min: "2",
      mv_max: "7",
      sort: "newest",
    }).query;

    expect(catalogSearchRpcArgs(query)).toMatchObject({
      p_query: "lotus",
      p_game_code: "mtg",
      p_language: "ja",
      p_finish: "foil",
      p_currency: "EUR",
      p_min_mana_value: 2,
      p_max_mana_value: 7,
      p_sort: "newest",
      p_limit: 24,
    });
  });

  it("defaults the RPC language to English and maps the all sentinel to null", () => {
    expect(catalogSearchRpcArgs(defaultCatalogQuery())).toMatchObject({
      p_language: "en",
    });
    expect(
      catalogSearchRpcArgs({
        ...defaultCatalogQuery(),
        language: "all",
      }),
    ).toMatchObject({
      p_language: null,
    });
  });

  it("keeps detail back-navigation inside catalog routes", () => {
    expect(safeCatalogReturnPath("/app/catalog?q=lotus&view=grid")).toBe(
      "/app/catalog?q=lotus&view=grid",
    );
    expect(safeCatalogReturnPath("https://evil.example/app/catalog")).toBe("/app/catalog");
    expect(safeCatalogReturnPath("//evil.example/app/catalog")).toBe("/app/catalog");
  });
});
