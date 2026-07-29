import { notFound } from "next/navigation";

import { ButtonLink, ErrorState } from "@talence/ui";

import { CatalogCardDetailView } from "@/components/catalog/catalog-detail";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCatalogCard } from "@/features/catalog/data";
import { safeCatalogReturnPath } from "@/features/catalog/query";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Oracle card",
};

export default async function OracleCardPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ cardId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const [{ cardId }, query] = await Promise.all([params, searchParams]);
  const validatedCardId = validateUuid(cardId);
  if (!validatedCardId.ok) {
    notFound();
  }
  const backHref = safeCatalogReturnPath(query.from);
  const result = await loadCatalogCard(validatedCardId.value);

  if (result.ok && !result.data) {
    notFound();
  }

  return (
    <PageFrame
      eyebrow="Oracle identity"
      title={result.ok && result.data ? result.data.card.name : "Card details"}
      description="Oracle rules identity, ordered faces, legality, and exact printings remain distinct and traceable."
    >
      {!result.ok ? (
        <ErrorState
          title="Card details are unavailable"
          message={`Nothing changed. Return to catalog results or retry this detail page. Request ID: ${result.requestId}`}
          action={
            <ButtonLink href={backHref} variant="secondary">
              Back to catalog
            </ButtonLink>
          }
        />
      ) : result.data ? (
        <CatalogCardDetailView detail={result.data} backHref={backHref} preview={result.preview} />
      ) : null}
    </PageFrame>
  );
}
