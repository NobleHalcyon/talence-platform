import { notFound } from "next/navigation";

import { ButtonLink } from "@talence/ui";

import { InventoryTransactionLinesTable } from "@/components/collections/collection-history";
import {
  CollectionNavigation,
  CollectionReadErrorState,
  PreviewBadge,
} from "@/components/collections/collection-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCollectionDetail, loadCollectionTransactionLines } from "@/features/collections/data";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Transaction lines",
};

export default async function CollectionTransactionLinesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ collectionId: string; transactionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ collectionId, transactionId }, parameters] = await Promise.all([params, searchParams]);
  const validatedCollection = validateUuid(collectionId);
  const validatedTransaction = validateUuid(transactionId);
  if (!validatedCollection.ok || !validatedTransaction.ok) notFound();
  const rawAfter = Array.isArray(parameters.after_line)
    ? parameters.after_line[0]
    : parameters.after_line;
  const afterLineNumber =
    rawAfter && /^\d{1,4}$/.test(rawAfter) && Number(rawAfter) <= 5_000 ? Number(rawAfter) : 0;

  const [detail, page] = await Promise.all([
    loadCollectionDetail(validatedCollection.value),
    loadCollectionTransactionLines(
      validatedCollection.value,
      validatedTransaction.value,
      afterLineNumber,
    ),
  ]);
  if ((!detail.ok && detail.reason === "not_found") || (!page.ok && page.reason === "not_found")) {
    notFound();
  }
  const failure = !detail.ok ? detail : !page.ok ? page : null;

  return (
    <PageFrame
      eyebrow="Immutable transaction"
      title={
        page.ok
          ? `${page.data.lineCount.toLocaleString("en-US")} exact deltas`
          : "Transaction lines"
      }
      description="Review the complete bounded line ledger for this immutable inventory transaction."
      action={
        <ButtonLink
          href={`/app/collections/${validatedCollection.value}/history`}
          variant="secondary"
        >
          Back to history
        </ButtonLink>
      }
    >
      {detail.ok ? (
        <CollectionNavigation collection={detail.data.collection} active="history" />
      ) : null}
      {page.ok && detail.ok ? (
        <>
          {page.preview ? <PreviewBadge /> : null}
          <InventoryTransactionLinesTable
            label={`Transaction ${validatedTransaction.value.slice(-8)} exact lines`}
            lines={page.data.lines}
          />
          {page.data.hasMore && page.data.nextAfterLineNumber !== null ? (
            <ButtonLink
              href={`/app/collections/${validatedCollection.value}/history/${validatedTransaction.value}?after_line=${page.data.nextAfterLineNumber}`}
              variant="secondary"
            >
              Next 100 lines
            </ButtonLink>
          ) : null}
        </>
      ) : failure ? (
        <CollectionReadErrorState
          reason={failure.reason}
          requestId={failure.requestId}
          subject="transaction lines"
          genericTitle="Transaction lines could not be loaded"
          retryHref={`/app/collections/${validatedCollection.value}/history/${validatedTransaction.value}`}
        />
      ) : null}
    </PageFrame>
  );
}
