import { notFound } from "next/navigation";

import { ButtonLink } from "@talence/ui";

import {
  DeckPreviewBadge,
  DeckReadErrorState,
  DeckStatusNotice,
} from "@/components/decks/deck-shared";
import { DeckTextImportWorkflow } from "@/components/decks/deck-text-import";
import { PageFrame } from "@/components/shell/page-frame";
import { loadDeckDetail } from "@/features/decks/data";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Import deck text",
};

export default async function DeckTextImportPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ deckId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ deckId }, parameters] = await Promise.all([params, searchParams]);
  const validated = validateUuid(deckId);
  if (!validated.ok) notFound();
  const detail = await loadDeckDetail(validated.value);
  if (!detail.ok && detail.reason === "not_found") notFound();

  return (
    <PageFrame
      eyebrow="Private deck text import"
      title={detail.ok ? `Import into ${detail.data.deck.name}` : "Import deck text"}
      description="Parse a bounded decklist, review exact oracle-name resolution, then replace every zone in one revision. Ambiguous and unresolved names are never selected silently."
      action={
        <ButtonLink href={`/app/decks/${validated.value}`} variant="secondary" size="small">
          Back to deck
        </ButtonLink>
      }
    >
      <DeckStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {detail.ok ? (
        <>
          {detail.preview ? <DeckPreviewBadge /> : null}
          <DeckTextImportWorkflow detail={detail.data} preview={detail.preview} />
        </>
      ) : (
        <DeckReadErrorState
          reason={detail.reason}
          requestId={detail.requestId}
          subject="deck import"
          retryHref={`/app/decks/${validated.value}/import`}
        />
      )}
    </PageFrame>
  );
}
