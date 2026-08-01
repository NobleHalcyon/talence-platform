import type { CatalogPageSize } from "./types";

/** Keep these viewport thresholds synchronized with catalog.module.css. */
export const CATALOG_GRID_PAGE_SIZE_RULES: ReadonlyArray<{
  media: string;
  pageSize: CatalogPageSize;
}> = [
  { media: "(min-width: 73rem)", pageSize: 30 },
  { media: "(min-width: 58rem)", pageSize: 24 },
  { media: "(min-width: 44rem)", pageSize: 18 },
  { media: "(min-width: 27rem)", pageSize: 12 },
];

export const NARROW_CATALOG_PAGE_SIZE: CatalogPageSize = 6;

export function catalogPageSizeForMedia(matches: (media: string) => boolean): CatalogPageSize {
  return (
    CATALOG_GRID_PAGE_SIZE_RULES.find((rule) => matches(rule.media))?.pageSize ??
    NARROW_CATALOG_PAGE_SIZE
  );
}
