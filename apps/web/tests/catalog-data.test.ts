import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadAdminCatalogStatusWithClient,
  loadCatalogPrintingWithClient,
  searchCatalogWithClient,
} from "@/features/catalog/data";
import {
  parseCatalogCardDetail,
  parseCatalogSearchResult,
  parsePriceObservation,
} from "@/features/catalog/parse";
import { defaultCatalogQuery } from "@/features/catalog/query";
import type { CatalogRpcClient } from "@/features/catalog/types";

const PRINTING_ID = "11111111-1111-4111-8111-111111111111";
const CARD_ID = "22222222-2222-4222-8222-222222222222";
const SET_ID = "33333333-3333-4333-8333-333333333333";

function rawPrice(overrides: Record<string, unknown> = {}) {
  return {
    provider: "Scryfall",
    currency: "USD",
    finish: "nonfoil",
    amount: "4.2500",
    observed_at: "2026-07-26T12:00:00Z",
    ingested_at: "2026-07-26T12:30:00Z",
    stale_after: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

function rawPrinting(overrides: Record<string, unknown> = {}) {
  return {
    printing_id: PRINTING_ID,
    card_id: CARD_ID,
    display_name: "Fixture Card",
    card_name: "Fixture Card",
    printed_name: null,
    set: {
      id: SET_ID,
      code: "TST",
      name: "Test Set",
    },
    collector_number: "7",
    language: "en",
    rarity: "rare",
    layout: "transform",
    released_at: "2026-07-26",
    digital: false,
    promo: false,
    oversized: false,
    finishes: ["nonfoil", "foil"],
    artist: "Fixture Artist",
    scryfall_uri: "https://scryfall.com/card/tst/7/fixture-card",
    mana_cost: "{1}{U}",
    mana_value: 2,
    type_line: "Creature — Wizard",
    oracle_text: "Fixture rules text.",
    colors: ["U"],
    color_identity: ["U"],
    keywords: ["Flying"],
    faces: [
      {
        id: "44444444-4444-4444-8444-444444444441",
        face_index: 0,
        name: "Fixture Front",
        image_normal_uri: "https://cards.scryfall.io/normal/front/fixture-front.jpg",
      },
      {
        id: "44444444-4444-4444-8444-444444444442",
        face_index: 1,
        name: "Fixture Back",
        image_normal_uri: "https://cards.scryfall.io/normal/back/fixture-back.jpg",
      },
    ],
    best_price: rawPrice(),
    ...overrides,
  };
}

function rawSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    items: [rawPrinting()],
    total_count: 1,
    result_count: 1,
    next_cursor: "opaque-next",
    currency: "USD",
    catalog: {
      version: "mtg-test-s1",
      provider_observed_at: "2026-07-26T12:00:00Z",
      catalog_ingested_at: "2026-07-26T12:30:00Z",
    },
    ...overrides,
  };
}

describe("catalog data boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses multi-face results and price freshness without transforming provider URLs", () => {
    const parsed = parseCatalogSearchResult(rawSearchResult());

    expect(parsed?.items[0]?.faces).toHaveLength(2);
    expect(parsed?.items[0]?.faces[0]?.imageNormalUri).toBe(
      "https://cards.scryfall.io/normal/front/fixture-front.jpg",
    );
    expect(parsed?.items[0]?.bestPrice).toMatchObject({
      amount: "4.2500",
      provider: "Scryfall",
      observedAt: "2026-07-26T12:00:00Z",
      ingestedAt: "2026-07-26T12:30:00Z",
    });
    expect(parsed?.catalog.ingestedAt).toBe("2026-07-26T12:30:00Z");
  });

  it("keeps explicit zero observations while treating missing or malformed prices as unavailable", () => {
    expect(parsePriceObservation(null)).toBeNull();
    expect(parsePriceObservation(rawPrice({ amount: null }))).toBeNull();
    expect(parsePriceObservation(rawPrice({ amount: "0" }))).toMatchObject({ amount: "0" });
    expect(parsePriceObservation(rawPrice({ amount: 0 }))).toMatchObject({ amount: "0" });
    expect(parsePriceObservation(rawPrice({ amount: "-0.01" }))).toBeNull();
    expect(parsePriceObservation(rawPrice({ amount: " " }))).toBeNull();
    expect(parsePriceObservation(rawPrice({ observed_at: null }))).toBeNull();

    const parsed = parseCatalogSearchResult(
      rawSearchResult({
        items: [rawPrinting({ best_price: rawPrice({ amount: "0" }) })],
      }),
    );
    expect(parsed?.items[0]?.bestPrice).toMatchObject({
      amount: "0",
      provider: "Scryfall",
    });
  });

  it("parses and preserves the bounded card-printing count contract", () => {
    const parsed = parseCatalogCardDetail({
      card: {
        id: CARD_ID,
        name: "Fixture Card",
        colors: ["U"],
        color_identity: ["U"],
        keywords: [],
        reserved: false,
      },
      printings: [rawPrinting()],
      printing_count: 251,
      printings_truncated: true,
      legalities: [],
      catalog: rawSearchResult().catalog,
    });

    expect(parsed).toMatchObject({
      printingCount: 251,
      printingsTruncated: true,
    });
    expect(parsed?.printings).toHaveLength(1);
  });

  it("enables catalog sync only when both deployment and database switches are open", async () => {
    const rpc = vi.fn();
    const status = (syncEnabled: boolean) => ({
      state: {
        sync_enabled: syncEnabled,
        active_catalog_version: "mtg-test-s1",
      },
      counts: {
        sets: 1,
        cards: 1,
        printings: 1,
        faces: 1,
        prices: 1,
      },
      latest_source_file: null,
      latest_imports: [],
      queued_imports: [],
      snapshot_version: null,
    });

    vi.stubEnv("FEATURE_CATALOG_SYNC_ENABLED", "true");
    rpc.mockResolvedValueOnce({ data: status(true), error: null });
    const bothEnabled = await loadAdminCatalogStatusWithClient(
      { rpc } as CatalogRpcClient,
      CARD_ID,
    );
    expect(bothEnabled).toMatchObject({ ok: true, data: { syncEnabled: true } });

    rpc.mockResolvedValueOnce({ data: status(false), error: null });
    const databaseDisabled = await loadAdminCatalogStatusWithClient(
      { rpc } as CatalogRpcClient,
      CARD_ID,
    );
    expect(databaseDisabled).toMatchObject({ ok: true, data: { syncEnabled: false } });

    vi.stubEnv("FEATURE_CATALOG_SYNC_ENABLED", "false");
    rpc.mockResolvedValueOnce({ data: status(true), error: null });
    const deploymentDisabled = await loadAdminCatalogStatusWithClient(
      { rpc } as CatalogRpcClient,
      CARD_ID,
    );
    expect(deploymentDisabled).toMatchObject({ ok: true, data: { syncEnabled: false } });
  });

  it("calls catalog_search with explicit bounded arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rawSearchResult(), error: null });
    const result = await searchCatalogWithClient({ rpc } as CatalogRpcClient, {
      ...defaultCatalogQuery("table"),
      query: "fixture",
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "catalog_search",
      expect.objectContaining({
        p_query: "fixture",
        p_game_code: "mtg",
        p_language: "en",
        p_after: null,
        p_limit: 24,
      }),
    );
  });

  it("fails closed on malformed RPC output", async () => {
    const result = await searchCatalogWithClient(
      {
        rpc: vi.fn().mockResolvedValue({ data: { items: [{}] }, error: null }),
      } as CatalogRpcClient,
      defaultCatalogQuery(),
    );

    expect(result).toMatchObject({ ok: false, reason: "invalid_response" });
  });

  it("reads all finish-specific prices from printing detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        printing: {
          ...rawPrinting({ best_price: undefined }),
          prices: [rawPrice(), rawPrice({ finish: "foil", amount: "8.5000" })],
        },
        catalog: rawSearchResult().catalog,
      },
      error: null,
    });

    const result = await loadCatalogPrintingWithClient({ rpc } as CatalogRpcClient, PRINTING_ID);
    expect(result.ok && result.data?.prices).toHaveLength(2);
    expect(result.ok && result.data?.printing.bestPrice?.finish).toBe("nonfoil");
  });
});
