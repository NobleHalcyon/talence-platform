import type { CatalogSearchResult } from "./types";

const DEFAULT_TTL_MS = 45_000;
const DEFAULT_MAX_ENTRIES = 64;

interface CacheEntry {
  expiresAt: number;
  value: CatalogSearchResult;
}

export class CatalogSearchCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): CatalogSearchResult | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: CatalogSearchResult): void {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

export const catalogSearchCache = new CatalogSearchCache();
