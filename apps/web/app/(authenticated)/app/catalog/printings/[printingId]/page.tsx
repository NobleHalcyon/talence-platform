import { notFound } from "next/navigation";

import { ButtonLink, ErrorState } from "@talence/ui";

import { CatalogPrintingDetailView } from "@/components/catalog/catalog-detail";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCatalogPrinting } from "@/features/catalog/data";
import { safeCatalogReturnPath } from "@/features/catalog/query";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Printing",
};

export default async function PrintingPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ printingId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const [{ printingId }, query] = await Promise.all([params, searchParams]);
  const validatedPrintingId = validateUuid(printingId);
  if (!validatedPrintingId.ok) {
    notFound();
  }
  const backHref = safeCatalogReturnPath(query.from);
  const result = await loadCatalogPrinting(validatedPrintingId.value);

  if (result.ok && !result.data) {
    notFound();
  }

  return (
    <PageFrame
      eyebrow="Exact printing"
      title={result.ok && result.data ? result.data.printing.name : "Printing details"}
      description="Set, collector number, language, ordered faces, finishes, and timestamped provider estimates for this exact object."
    >
      {!result.ok ? (
        <ErrorState
          title="Printing details are unavailable"
          message={`Nothing changed. Return to catalog results or retry this detail page. Request ID: ${result.requestId}`}
          action={
            <ButtonLink href={backHref} variant="secondary">
              Back to catalog
            </ButtonLink>
          }
        />
      ) : result.data ? (
        <CatalogPrintingDetailView
          detail={result.data}
          backHref={backHref}
          preview={result.preview}
        />
      ) : null}
    </PageFrame>
  );
}
