import { describe, expect, it } from "vitest";

import { CatalogSearchCache } from "@/features/catalog/cache";
import { previewCatalogSearch } from "@/features/catalog/preview";
import { defaultCatalogQuery } from "@/features/catalog/query";

describe("catalog short-term cache", () => {
  it("expires entries and evicts the least recently used key", () => {
    let now = 100;
    const cache = new CatalogSearchCache(50, 2, () => now);
    const result = previewCatalogSearch(defaultCatalogQuery());

    cache.set("first", result);
    cache.set("second", result);
    expect(cache.get("first")).toBe(result);
    cache.set("third", result);
    expect(cache.get("second")).toBeNull();
    expect(cache.get("first")).toBe(result);

    now = 151;
    expect(cache.get("first")).toBeNull();
    expect(cache.get("third")).toBeNull();
  });
});
