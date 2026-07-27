import { ButtonLink, ErrorState, InlineAlert } from "@talence/ui";

import { DeckCreateForm, DeckListView } from "@/components/decks/deck-list";
import {
  DeckPreviewBadge,
  DeckReadErrorState,
  DeckStatusNotice,
} from "@/components/decks/deck-shared";
import { PageFrame } from "@/components/shell/page-frame";
import { loadDeckFormats, loadDeckList, loadDeckSourceCollections } from "@/features/decks/data";
import { parseDeckCursor, parseDeckStatusFilter } from "@/features/decks/query";

export const metadata = {
  title: "Decks",
};

export default async function DecksPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const filter = parseDeckStatusFilter(parameters);
  const [list, formats, collections] = await Promise.all([
    loadDeckList(filter, parseDeckCursor(parameters)),
    loadDeckFormats(),
    loadDeckSourceCollections(false),
  ]);
  const failure = !list.ok ? list : !formats.ok ? formats : null;
  return (
    <PageFrame
      eyebrow="Workspace decks"
      title="Decks"
      description="Private oracle-level deck requirements connected to selected collection sources, finite-copy ownership allocation, and versioned advisory validation."
      action={
        list.ok && formats.ok && collections.ok && list.data.permissions.canCreate ? (
          <DeckCreateForm formats={formats.data} collections={collections.data.items} />
        ) : undefined
      }
    >
      <DeckStatusNotice status={parameters.status} requestId={parameters.request_id} />
      {list.ok && formats.ok ? (
        <>
          {list.preview || formats.preview ? <DeckPreviewBadge /> : null}
          {!collections.ok && list.data.permissions.canCreate ? (
            <InlineAlert title="Deck creation sources are unavailable" tone="warning">
              The collection list could not be loaded, so deck creation is temporarily disabled to
              avoid silently omitting ownership sources. Nothing changed. Support reference:{" "}
              {collections.requestId}.
            </InlineAlert>
          ) : null}
          <DeckListView page={list.data} filter={filter} />
          {list.data.nextCursor ? (
            <ButtonLink
              href={`/app/decks?${new URLSearchParams({
                status_filter: filter,
                cursor: list.data.nextCursor,
              })}`}
              variant="secondary"
            >
              More decks
            </ButtonLink>
          ) : null}
        </>
      ) : failure ? (
        <DeckReadErrorState
          reason={failure.reason}
          requestId={failure.requestId}
          subject="deck list"
          retryHref="/app/decks"
        />
      ) : (
        <ErrorState
          title="Decks could not be loaded"
          message="Nothing changed. Reload the page safely."
        />
      )}
    </PageFrame>
  );
}
