import { notFound } from "next/navigation";

import { ButtonLink } from "@talence/ui";

import { DeckEditor } from "@/components/decks/deck-editor";
import {
  DeckPreviewBadge,
  DeckReadErrorState,
  DeckStatusNotice,
} from "@/components/decks/deck-shared";
import { PageFrame } from "@/components/shell/page-frame";
import {
  loadDeckDetail,
  loadDeckCardPrintings,
  loadDeckSourceCollections,
  searchDeckCatalog,
} from "@/features/decks/data";
import {
  parseDeckEditorSurface,
  parseDeckPrintingCursor,
  parseDeckPrintingEntryId,
  parseDeckSearchCursor,
  parseDeckSearchQuery,
} from "@/features/decks/query";
import { validateUuid } from "@/lib/auth/validation";

export const metadata = {
  title: "Deck editor",
};

export default async function DeckEditorPage({
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
  const query = parseDeckSearchQuery(parameters);
  const surface = parseDeckEditorSurface(parameters);
  const printingEntryId = parseDeckPrintingEntryId(parameters);
  const printingEntry =
    detail.ok && printingEntryId
      ? (detail.data.entries.find((entry) => entry.id === printingEntryId) ?? null)
      : null;
  const [catalog, collections, printings] = detail.ok
    ? await Promise.all([
        searchDeckCatalog(
          validated.value,
          detail.data.deck.formatCode,
          detail.data.deck.formatVersionId,
          detail.data.deck.currentRevision,
          detail.data.validation.catalogVersion,
          query,
          parseDeckSearchCursor(parameters),
        ),
        loadDeckSourceCollections(true),
        printingEntry
          ? loadDeckCardPrintings(
              validated.value,
              printingEntry.card.cardId,
              detail.data.deck.currentRevision,
              detail.data.validation.catalogVersion,
              parseDeckPrintingCursor(parameters),
            )
          : Promise.resolve(null),
      ])
    : [null, null, null];
  const title = detail.ok ? detail.data.deck.name : "Deck builder";
  const failure = !detail.ok
    ? detail
    : catalog && !catalog.ok
      ? catalog
      : printings && !printings.ok
        ? printings
        : null;

  return (
    <PageFrame
      eyebrow="Collection-aware deck builder"
      title={title}
      description="Search oracle cards, edit every zone with click or tap controls, and inspect finite-copy ownership, exact preferred-printing value, and deterministic validation evidence."
      action={
        detail.ok ? (
          <ButtonLink href="/app/decks" variant="secondary" size="small">
            All decks
          </ButtonLink>
        ) : undefined
      }
    >
      <DeckStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {detail.ok && catalog?.ok ? (
        <>
          {detail.preview || catalog.preview ? <DeckPreviewBadge /> : null}
          <DeckEditor
            detail={detail.data}
            catalog={catalog.data}
            query={query}
            surface={surface}
            collections={collections?.ok ? collections.data.items : []}
            collectionsAvailable={Boolean(collections?.ok)}
            printingPicker={
              printingEntry && printings?.ok
                ? { entryId: printingEntry.id, page: printings.data }
                : null
            }
          />
        </>
      ) : failure ? (
        <DeckReadErrorState
          reason={failure.reason}
          requestId={failure.requestId}
          subject={failure === detail ? "deck" : "deck catalog"}
          retryHref={`/app/decks/${validated.value}`}
        />
      ) : null}
    </PageFrame>
  );
}
