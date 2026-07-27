import { notFound } from "next/navigation";

import { ButtonLink, ErrorState, InlineAlert, Section } from "@talence/ui";

import { CollectionInventoryControls } from "@/components/collections/collection-controls";
import { CollectionEditForm } from "@/components/collections/collection-list";
import {
  CollectionNavigation,
  CollectionReadErrorState,
  CollectionStatusNotice,
  PreviewBadge,
} from "@/components/collections/collection-shared";
import {
  CollectionAnalyticsView,
  CollectionSummaryView,
} from "@/components/collections/collection-summary";
import { InventoryBrowser } from "@/components/collections/inventory-browser";
import { CollectionLifecycleControl } from "@/components/collections/lifecycle-control";
import { PageFrame } from "@/components/shell/page-frame";
import {
  loadCollectionAnalytics,
  loadCollectionDetail,
  loadCollectionInventoryPage,
  loadCollectionList,
  loadCollectionViewPreference,
} from "@/features/collections/data";
import {
  collectionInventoryHref,
  parseCollectionInventoryQuery,
} from "@/features/collections/query";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Collection",
};

export default async function CollectionPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ collectionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ collectionId }, parameters, preferredView] = await Promise.all([
    params,
    searchParams,
    loadCollectionViewPreference(),
  ]);
  const validated = validateUuid(collectionId);
  if (!validated.ok) notFound();
  const parsed = parseCollectionInventoryQuery(parameters, preferredView);
  const analyticsPromise =
    parsed.query.view === "analytical"
      ? loadCollectionAnalytics(validated.value, parsed.query)
      : Promise.resolve(null);
  const [inventory, detail, collections, analytics] = await Promise.all([
    loadCollectionInventoryPage(validated.value, parsed.query),
    loadCollectionDetail(validated.value),
    loadCollectionList(false),
    analyticsPromise,
  ]);
  if (
    (!inventory.ok && inventory.reason === "not_found") ||
    (!detail.ok && detail.reason === "not_found")
  ) {
    notFound();
  }
  const title = detail.ok ? detail.data.collection.name : "Collection";
  const returnTo = collectionInventoryHref(validated.value, parsed.query);
  const failure = !detail.ok ? detail : !inventory.ok ? inventory : null;
  const analytical = parsed.query.view === "analytical";
  const filtersActive = Boolean(
    parsed.query.query || parsed.query.setCode || parsed.query.finish || parsed.query.condition,
  );

  return (
    <PageFrame
      eyebrow="Collection inventory"
      title={title}
      description="Structured and gallery editing reconcile against one balance model; analytical totals come from finish-specific database aggregates."
      action={
        detail.ok ? (
          <div>
            {detail.data.collection.status === "active" && detail.data.permissions.canEdit ? (
              <>
                <ButtonLink
                  href={`/app/collections/${validated.value}/import`}
                  variant="secondary"
                  size="small"
                >
                  Import CSV
                </ButtonLink>{" "}
              </>
            ) : null}
            <ButtonLink
              href={`/app/collections/${validated.value}/export`}
              variant="secondary"
              size="small"
            >
              Export CSV
            </ButtonLink>
          </div>
        ) : undefined
      }
    >
      <CollectionStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {detail.ok ? (
        <CollectionNavigation collection={detail.data.collection} active="inventory" />
      ) : null}
      {inventory.ok && detail.ok ? (
        <div>
          {inventory.preview ? <PreviewBadge /> : null}
          {analytical ? (
            <Section
              title="Whole collection baseline"
              description="This unfiltered summary remains the collection-wide reference; the grouped analysis below follows the current inventory filters."
            >
              <CollectionSummaryView summary={inventory.data.summary} />
            </Section>
          ) : (
            <CollectionSummaryView summary={inventory.data.summary} />
          )}
          <div>
            <CollectionEditForm detail={detail.data} />
            <div>
              {detail.data.collection.status === "active" ? (
                <CollectionLifecycleControl
                  collection={detail.data.collection}
                  operation="archive"
                  disabled={!detail.data.permissions.canArchive}
                />
              ) : (
                <CollectionLifecycleControl
                  collection={detail.data.collection}
                  operation="restore"
                  disabled={!detail.data.permissions.canEdit}
                />
              )}
              <CollectionLifecycleControl
                collection={detail.data.collection}
                operation="delete"
                disabled={!detail.data.permissions.canDelete}
              />
            </div>
          </div>
          {parsed.notices.map((notice) => (
            <InlineAlert title="Filter adjusted" tone="warning" key={notice}>
              {notice}
            </InlineAlert>
          ))}
          <CollectionInventoryControls collectionId={validated.value} query={parsed.query} />
          {analytical ? (
            analytics && analytics.ok ? (
              <Section
                title="Filtered analysis"
                description={
                  filtersActive
                    ? "Grouped quantities and values honor the current search, set, finish, and condition filters."
                    : "No inventory filters are active, so these grouped quantities and values cover the full collection."
                }
              >
                <CollectionAnalyticsView analytics={analytics.data} />
              </Section>
            ) : analytics && !analytics.ok ? (
              <CollectionReadErrorState
                reason={analytics.reason}
                requestId={analytics.requestId}
                subject="collection analytics"
                genericTitle="Analytical totals could not be loaded"
                retryHref={returnTo}
              />
            ) : (
              <ErrorState
                title="Analytical totals could not be loaded"
                message="Inventory remains unchanged. Retry the analytical view."
              />
            )
          ) : (
            <InventoryBrowser
              items={inventory.data.balances}
              view={parsed.query.view === "gallery" ? "gallery" : "structured"}
              collections={collections.ok ? collections.data.items : []}
              collectionId={validated.value}
              returnTo={returnTo}
              occurredAt={new Date().toISOString()}
              canMutate={
                detail.data.collection.status === "active" && detail.data.permissions.canEdit
              }
            />
          )}
          {!analytical && inventory.data.nextCursor ? (
            <ButtonLink
              href={collectionInventoryHref(validated.value, parsed.query, {
                cursor: inventory.data.nextCursor,
              })}
              variant="secondary"
            >
              Load more inventory
            </ButtonLink>
          ) : null}
        </div>
      ) : failure ? (
        <CollectionReadErrorState
          reason={failure.reason}
          requestId={failure.requestId}
          subject="collection inventory"
          genericTitle="Collection inventory could not be loaded"
          retryHref={`/app/collections/${validated.value}`}
        />
      ) : null}
    </PageFrame>
  );
}
