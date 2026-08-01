import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as facetGet } from "@/app/api/catalog/facets/route";
import { GET as manaGet } from "@/app/api/catalog/assets/mana/[symbol]/route";
import { GET as setGet } from "@/app/api/catalog/assets/set/[code]/route";

const supabase = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => supabase.client,
}));

afterEach(() => {
  supabase.client = null;
  vi.unstubAllGlobals();
});

function svgResponse(body = '<svg xmlns="http://www.w3.org/2000/svg"></svg>') {
  return new Response(body, { status: 200, headers: { "Content-Type": "image/svg+xml" } });
}

describe("catalog filter option and asset routes", () => {
  it("bounds facet search and returns parsed set metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        field: "set",
        items: [
          {
            value: "LEA",
            label: "Limited Edition Alpha",
            secondary: "LEA · 1993-08-05",
            code: "LEA",
            symbol_uri: "/api/catalog/assets/set/lea",
          },
        ],
        next_cursor: null,
        has_more: false,
      },
      error: null,
    });
    supabase.client = { rpc };

    const response = await facetGet(
      new Request("https://talence.test/api/catalog/facets?field=set&q=alpha&limit=500"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        { label: "Limited Edition Alpha", value: "LEA", symbolUri: "/api/catalog/assets/set/lea" },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("catalog_filter_facets", {
      p_field: "set",
      p_query: "alpha",
      p_limit: 100,
      p_after: null,
    });
  });

  it("rejects unsupported facet fields before a database call", async () => {
    supabase.client = { rpc: vi.fn() };
    const response = await facetGet(
      new Request("https://talence.test/api/catalog/facets?field=currency"),
    );
    expect(response.status).toBe(400);
  });

  it("proxies only the allowlisted Scryfall set SVG host with long-lived cache headers", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { icon_svg_uri: "https://svgs.scryfall.io/sets/lea.svg" },
      error: null,
    });
    supabase.client = {
      from: () => ({ select: () => ({ ilike: () => ({ maybeSingle }) }) }),
    };
    const upstream = vi.fn().mockResolvedValue(svgResponse());
    vi.stubGlobal("fetch", upstream);

    const response = await setGet(new Request("https://talence.test/api/catalog/assets/set/lea"), {
      params: Promise.resolve({ code: "lea" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=2592000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(upstream).toHaveBeenCalledWith(new URL("https://svgs.scryfall.io/sets/lea.svg"), {
      next: { revalidate: 2_592_000 },
    });
  });

  it("uses the Talence fallback instead of fetching an untrusted set icon URI", async () => {
    supabase.client = {
      from: () => ({
        select: () => ({
          ilike: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { icon_svg_uri: "https://attacker.example/sets/lea.svg" },
              error: null,
            }),
          }),
        }),
      }),
    };
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await setGet(new Request("https://talence.test/api/catalog/assets/set/lea"), {
      params: Promise.resolve({ code: "lea" }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://talence.test/brand/talence-emblem-gold.svg",
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it("allowlists mana symbols and rejects non-Scryfall symbol names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(svgResponse()));
    const valid = await manaGet(new Request("https://talence.test/api/catalog/assets/mana/W"), {
      params: Promise.resolve({ symbol: "W" }),
    });
    const invalid = await manaGet(new Request("https://talence.test/api/catalog/assets/mana/tap"), {
      params: Promise.resolve({ symbol: "tap" }),
    });
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(404);
  });

  it("rejects upstream content that is not an SVG", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(svgResponse("not svg")));
    const response = await manaGet(new Request("https://talence.test/api/catalog/assets/mana/C"), {
      params: Promise.resolve({ symbol: "C" }),
    });
    expect(response.status).toBe(502);
  });
});
