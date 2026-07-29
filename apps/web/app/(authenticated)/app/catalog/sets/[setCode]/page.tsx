import { notFound } from "next/navigation";

import { ButtonLink, ErrorState } from "@talence/ui";

import { CatalogSetDetailView } from "@/components/catalog/catalog-detail";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCatalogSet } from "@/features/catalog/data";
import { safeCatalogReturnPath } from "@/features/catalog/query";

export const metadata = {
  title: "Set",
};

export default async function SetPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ setCode: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const [{ setCode }, query] = await Promise.all([params, searchParams]);
  const backHref = safeCatalogReturnPath(query.from);
  const result = await loadCatalogSet(setCode);

  if (result.ok && !result.data) {
    notFound();
  }

  return (
    <PageFrame
      eyebrow="Catalog set"
      title={result.ok && result.data ? result.data.set.name : "Set details"}
      description="Provider-backed release metadata and a bounded sample of active exact printings."
    >
      {!result.ok ? (
        <ErrorState
          title="Set details are unavailable"
          message={`Nothing changed. Return to catalog results or retry this set. Request ID: ${result.requestId}`}
          action={
            <ButtonLink href={backHref} variant="secondary">
              Back to catalog
            </ButtonLink>
          }
        />
      ) : result.data ? (
        <CatalogSetDetailView detail={result.data} backHref={backHref} preview={result.preview} />
      ) : null}
    </PageFrame>
  );
}
