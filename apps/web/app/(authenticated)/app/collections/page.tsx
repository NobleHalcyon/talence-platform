import { ButtonLink, ErrorState } from "@talence/ui";

import { CollectionCreateForm, CollectionListView } from "@/components/collections/collection-list";
import { CollectionStatusNotice, PreviewBadge } from "@/components/collections/collection-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCollectionList } from "@/features/collections/data";
import { parseCollectionCursor, parseCollectionStatusFilter } from "@/features/collections/query";

export const metadata = {
  title: "Collections",
};

export default async function CollectionsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const filter = parseCollectionStatusFilter(parameters);
  const includeArchived = filter !== "active";
  const result = await loadCollectionList(
    includeArchived,
    parseCollectionCursor(parameters),
    filter === "all" ? null : filter,
  );

  return (
    <PageFrame
      eyebrow="Workspace inventory"
      title="Collections"
      description="Private, workspace-scoped inventory containers with exact-printing balances and immutable transaction history."
      action={result.ok && result.data.permissions.canCreate ? <CollectionCreateForm /> : undefined}
    >
      <CollectionStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {result.ok ? (
        <>
          {result.preview ? <PreviewBadge /> : null}
          <CollectionListView page={result.data} filter={filter} />
          {result.data.nextCursor ? (
            <ButtonLink
              href={`/app/collections?${new URLSearchParams({
                status_filter: filter,
                cursor: result.data.nextCursor,
              })}`}
              variant="secondary"
            >
              Load more collections
            </ButtonLink>
          ) : null}
        </>
      ) : (
        <ErrorState
          title={
            result.reason === "permission_denied"
              ? "Collections are not available"
              : "Collections could not be loaded"
          }
          message={`Nothing changed. Reload safely or ask support to inspect request ${result.requestId}.`}
          action={
            <ButtonLink href="/app/collections" variant="secondary">
              Retry
            </ButtonLink>
          }
        />
      )}
    </PageFrame>
  );
}
