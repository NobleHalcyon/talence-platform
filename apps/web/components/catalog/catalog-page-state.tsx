import { ButtonLink, EmptyState, ErrorState, InlineAlert } from "@talence/ui";

import { catalogHref, defaultCatalogQuery } from "@/features/catalog/query";
import type {
  CatalogLoadResult,
  CatalogQueryParseResult,
  CatalogSearchResult,
} from "@/features/catalog/types";

import { CatalogControls } from "./catalog-controls";
import { CatalogResults } from "./catalog-results";

export function CatalogPageState({
  parsed,
  result,
}: {
  parsed: CatalogQueryParseResult;
  result: CatalogLoadResult<CatalogSearchResult>;
}) {
  return (
    <>
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
              href={catalogHref(defaultCatalogQuery(parsed.query.view))}
              variant="secondary"
            >
              Clear search
            </ButtonLink>
          }
        />
      ) : (
        <CatalogResults query={parsed.query} result={result.data} preview={result.preview} />
      )}
    </>
  );
}
