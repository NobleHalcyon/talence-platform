import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { ButtonLink } from "@talence/ui";

import {
  CollectionNavigation,
  CollectionReadErrorState,
  CollectionStatusNotice,
  PreviewBadge,
} from "@/components/collections/collection-shared";
import { ImportWorkflow } from "@/components/collections/import-workflow";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCollectionDetail, loadInventoryImportPreview } from "@/features/collections/data";
import { parseInventoryImportAfterRow } from "@/features/collections/query";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Import collection",
};

export default async function CollectionImportPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ collectionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ collectionId }, parameters] = await Promise.all([params, searchParams]);
  const validated = validateUuid(collectionId);
  if (!validated.ok) notFound();
  const detail = await loadCollectionDetail(validated.value);
  if (!detail.ok && detail.reason === "not_found") notFound();
  const jobValue = Array.isArray(parameters.job) ? parameters.job[0] : parameters.job;
  const jobId = jobValue ? validateUuid(jobValue) : null;
  const afterRowNumber = parseInventoryImportAfterRow(parameters.after_row);
  const initialPreview = jobId?.ok
    ? await loadInventoryImportPreview(jobId.value, afterRowNumber)
    : null;
  if (initialPreview?.ok && initialPreview.data.collectionId !== validated.value) {
    notFound();
  }

  return (
    <PageFrame
      eyebrow="Staged CSV workflow"
      title={detail.ok ? `Import into ${detail.data.collection.name}` : "Import inventory"}
      description="Parse a bounded private CSV, review exact resolution, then commit included matches as one idempotent additive transaction."
      constrained
      action={
        <ButtonLink href={`/app/collections/${validated.value}`} variant="secondary">
          Back to inventory
        </ButtonLink>
      }
    >
      <CollectionStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {detail.ok ? (
        <>
          <CollectionNavigation collection={detail.data.collection} active="import" />
          {detail.preview ? <PreviewBadge /> : null}
          {initialPreview && !initialPreview.ok ? (
            <CollectionReadErrorState
              reason={initialPreview.reason}
              requestId={initialPreview.requestId}
              subject="staged import job"
              genericTitle="Staged job could not be loaded"
              retryHref={`/app/collections/${validated.value}/import`}
            />
          ) : (
            <ImportWorkflow
              collectionId={validated.value}
              uploadAttemptId={randomUUID()}
              canMutate={
                detail.data.collection.status === "active" && detail.data.permissions.canEdit
              }
              initialPreview={initialPreview?.ok ? initialPreview.data : null}
            />
          )}
        </>
      ) : (
        <CollectionReadErrorState
          reason={detail.reason}
          requestId={detail.requestId}
          subject="CSV import"
          genericTitle="Import is unavailable"
          retryHref={`/app/collections/${validated.value}/import`}
        />
      )}
    </PageFrame>
  );
}
