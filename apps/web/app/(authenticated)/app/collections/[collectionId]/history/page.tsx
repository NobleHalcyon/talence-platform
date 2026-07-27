import { notFound } from "next/navigation";

import { ButtonLink } from "@talence/ui";

import { CollectionHistoryView } from "@/components/collections/collection-history";
import {
  CollectionNavigation,
  CollectionReadErrorState,
  CollectionStatusNotice,
  PreviewBadge,
} from "@/components/collections/collection-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCollectionHistory } from "@/features/collections/data";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Collection history",
};

export default async function CollectionHistoryPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ collectionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ collectionId }, parameters] = await Promise.all([params, searchParams]);
  const validated = validateUuid(collectionId);
  if (!validated.ok) notFound();
  const cursorValue = Array.isArray(parameters.cursor) ? parameters.cursor[0] : parameters.cursor;
  const cursor = cursorValue && /^[A-Za-z0-9_-]{8,2048}$/.test(cursorValue) ? cursorValue : null;
  const result = await loadCollectionHistory(validated.value, cursor);
  if (!result.ok && result.reason === "not_found") notFound();

  return (
    <PageFrame
      eyebrow="Immutable ledger"
      title={result.ok ? `${result.data.collection.name} history` : "Transaction history"}
      description="Review actor, source, exact deltas, safe references, transfer pairs, and compensating reversal relationships."
      action={
        <ButtonLink href={`/app/collections/${validated.value}`} variant="secondary">
          Back to inventory
        </ButtonLink>
      }
    >
      <CollectionStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {result.ok ? (
        <>
          <CollectionNavigation collection={result.data.collection} active="history" />
          {result.preview ? <PreviewBadge /> : null}
          <CollectionHistoryView history={result.data} occurredAt={new Date().toISOString()} />
          {result.data.nextCursor ? (
            <ButtonLink
              href={`/app/collections/${validated.value}/history?cursor=${encodeURIComponent(
                result.data.nextCursor,
              )}`}
              variant="secondary"
            >
              Older transactions
            </ButtonLink>
          ) : null}
        </>
      ) : (
        <CollectionReadErrorState
          reason={result.reason}
          requestId={result.requestId}
          subject="transaction history"
          genericTitle="Transaction history could not be loaded"
          retryHref={`/app/collections/${validated.value}/history`}
        />
      )}
    </PageFrame>
  );
}
