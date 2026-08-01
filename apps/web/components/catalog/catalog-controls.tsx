"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { ProgressiveFilterControls } from "@/components/filters/progressive-filter-controls";
import { catalogHref } from "@/features/catalog/query";
import {
  CATALOG_GRID_PAGE_SIZE_RULES,
  NARROW_CATALOG_PAGE_SIZE,
} from "@/features/catalog/responsive";
import type { CatalogSearchQuery } from "@/features/catalog/types";

function useResponsiveCatalogPageSize(query: CatalogSearchQuery): void {
  const router = useRouter();
  const lastRequestedPageSize = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQueries = CATALOG_GRID_PAGE_SIZE_RULES.map((rule) => ({
      ...rule,
      query: window.matchMedia(rule.media),
    }));
    const synchronize = () => {
      const pageSize =
        mediaQueries.find((candidate) => candidate.query.matches)?.pageSize ??
        NARROW_CATALOG_PAGE_SIZE;
      if (pageSize === query.pageSize) {
        lastRequestedPageSize.current = null;
        return;
      }
      if (lastRequestedPageSize.current === pageSize) return;
      lastRequestedPageSize.current = pageSize;
      router.replace(catalogHref(query, { cursor: null, pageSize }), { scroll: false });
    };
    synchronize();
    mediaQueries.forEach(({ query: mediaQuery }) =>
      mediaQuery.addEventListener("change", synchronize),
    );
    return () =>
      mediaQueries.forEach(({ query: mediaQuery }) =>
        mediaQuery.removeEventListener("change", synchronize),
      );
  }, [query, router]);
}

export function CatalogControls({
  query,
  resultCount,
}: {
  query: CatalogSearchQuery;
  resultCount?: number | null;
}) {
  useResponsiveCatalogPageSize(query);
  return (
    <ProgressiveFilterControls
      action="/app/catalog"
      query={query.query}
      filters={query.filters}
      scope="catalog"
      resultCount={resultCount}
      scopeState={{
        includeDigital: query.includeDigital,
        includeNondefault: query.includeNondefault,
        returnAllVariants: query.returnAllVariants,
      }}
      preservedParameters={{
        digital: query.includeDigital,
        nondefault: query.includeNondefault,
        variants: query.returnAllVariants ? "all" : null,
        sort: query.sort === "name" ? null : query.sort,
        view: query.view,
        page_size: query.pageSize === 30 ? null : query.pageSize,
      }}
    />
  );
}
