import { ButtonLink, EmptyState, ErrorState, InlineAlert } from "@talence/ui";

import { catalogHref, defaultCatalogQuery } from "@/features/catalog/query";
import type {
  CatalogLoadResult,
  CatalogDeckOption,
  CatalogQueryParseResult,
  CatalogSearchResult,
} from "@/features/catalog/types";

import { CatalogControls } from "./catalog-controls";
import { CatalogBrowseMemory } from "./catalog-browse-memory";
import { CatalogResults } from "./catalog-results";
import styles from "./catalog.module.css";

export function CatalogPageState({
  parsed,
  result,
  deckOptions = [],
}: {
  parsed: CatalogQueryParseResult;
  result: CatalogLoadResult<CatalogSearchResult>;
  deckOptions?: CatalogDeckOption[];
}) {
  return (
    <div className={styles.catalogPage}>
      <CatalogBrowseMemory cacheKey={catalogHref(parsed.query)} />
      <CatalogControls query={parsed.query} />
      {parsed.notices.map((notice) => (
        <InlineAlert title="Search adjusted" tone="warning" key={notice}>
          {notice}
        </InlineAlert>
      ))}
      {!result.ok ? (
        <ErrorState
          title="Catalog results are unavailable"
          message={`Nothing changed. Retry the request after the catalog service is configured or available. Request ID: ${result.requestId}`}
          action={
            <ButtonLink href={catalogHref(parsed.query)} variant="secondary">
              Retry catalog
            </ButtonLink>
          }
        />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          title="No printings match"
          message="Try removing a filter or broadening the language, digital, or nondefault-object choices."
          action={
            <ButtonLink
              href={catalogHref({
                ...defaultCatalogQuery(parsed.query.view),
                pageSize: parsed.query.pageSize,
              })}
              variant="secondary"
            >
              Clear search
            </ButtonLink>
          }
        />
      ) : (
        <CatalogResults
          query={parsed.query}
          result={result.data}
          preview={result.preview}
          deckOptions={deckOptions}
        />
      )}
    </div>
  );
}
