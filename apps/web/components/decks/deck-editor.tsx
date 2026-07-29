import { ButtonLink, InlineAlert, StatusBadge } from "@talence/ui";

import type { CollectionListItem } from "@/features/collections/types";
import { deckEditorHref } from "@/features/decks/query";
import type {
  DeckCatalogSearchPage,
  DeckCardPrintingsPage,
  DeckDetail,
  DeckEditorSurface,
} from "@/features/decks/types";

import { DeckAnalysisInspector, DeckPersistentSummary } from "./deck-analysis";
import { DeckCatalogRail } from "./deck-catalog";
import { DeckLifecycleControl, DuplicateDeckControl } from "./deck-lifecycle-control";
import { DeckSettingsForm, DeckSourceControl } from "./deck-settings";
import { DeckZoneEditor } from "./deck-zones";
import { PreferredPrintingPicker } from "./preferred-printing-picker";
import styles from "./decks.module.css";

function surfaceClass(surface: DeckEditorSurface, region: DeckEditorSurface): string {
  return `${styles.editorRegion} ${surface === region ? "" : styles.compactHidden}`;
}

export function DeckEditor({
  detail,
  catalog,
  query,
  surface,
  collections,
  collectionsAvailable,
  printingPicker,
}: {
  detail: DeckDetail;
  catalog: DeckCatalogSearchPage;
  query: string;
  surface: DeckEditorSurface;
  collections: CollectionListItem[];
  collectionsAvailable: boolean;
  printingPicker: { entryId: string; page: DeckCardPrintingsPage } | null;
}) {
  const returnTo = deckEditorHref(detail.deck.id, { surface, query });
  return (
    <div className={styles.editorStack}>
      {detail.deck.status === "archived" ? (
        <InlineAlert title="Archived deck is read-only" tone="warning">
          Restore it to edit entries, format, or inventory sources. Existing selected archived
          sources still count until removed after restoration.
        </InlineAlert>
      ) : null}
      <DeckPersistentSummary detail={detail} />
      <nav className={styles.compactTabs} aria-label="Deck builder surfaces">
        {(["catalog", "deck", "analysis"] as const).map((region) => (
          <ButtonLink
            key={region}
            href={deckEditorHref(detail.deck.id, { surface: region, query })}
            variant={surface === region ? "primary" : "secondary"}
            size="small"
            aria-current={surface === region ? "page" : undefined}
          >
            {region.slice(0, 1).toUpperCase()}
            {region.slice(1)}
          </ButtonLink>
        ))}
      </nav>
      <div className={styles.managementBar}>
        <DeckSettingsForm detail={detail} />
        <DeckSourceControl
          detail={detail}
          collections={collections}
          collectionsAvailable={collectionsAvailable}
        />
        <div className={styles.actionRow}>
          <ButtonLink href={`/app/decks/${detail.deck.id}/import`} variant="secondary" size="small">
            Import text
          </ButtonLink>
          <ButtonLink href={`/app/decks/${detail.deck.id}/export`} variant="secondary" size="small">
            Export text
          </ButtonLink>
          <ButtonLink
            href={`/app/decks/${detail.deck.id}/export?format=json`}
            variant="secondary"
            size="small"
          >
            Export JSON
          </ButtonLink>
          <DuplicateDeckControl deck={detail.deck} disabled={!detail.permissions.canDuplicate} />
          {detail.deck.status === "active" ? (
            <DeckLifecycleControl
              deck={detail.deck}
              operation="archive"
              disabled={!detail.permissions.canArchive}
            />
          ) : (
            <DeckLifecycleControl
              deck={detail.deck}
              operation="restore"
              disabled={!detail.permissions.canRestore}
            />
          )}
          <DeckLifecycleControl
            deck={detail.deck}
            operation="delete"
            disabled={!detail.permissions.canDelete}
          />
        </div>
      </div>
      {detail.sources.some((source) => source.status === "archived") ? (
        <InlineAlert title="Archived collection source is still counted" tone="warning">
          {detail.sources
            .filter((source) => source.status === "archived")
            .map((source) => source.name)
            .join(", ")}{" "}
          remains in ownership allocation. Deleted collections cannot be selected.
        </InlineAlert>
      ) : null}
      <div className={styles.editorGrid}>
        <section
          className={`${surfaceClass(surface, "catalog")} ${styles.catalogRegion}`}
          aria-labelledby="deck-catalog-title"
        >
          <header className={styles.regionHeader}>
            <div>
              <p className={styles.regionEyebrow}>Catalog</p>
              <h2 id="deck-catalog-title">Find oracle cards</h2>
            </div>
            <StatusBadge tone="information">Versioned</StatusBadge>
          </header>
          <DeckCatalogRail detail={detail} result={catalog} query={query} returnTo={returnTo} />
        </section>
        <section
          className={`${surfaceClass(surface, "deck")} ${styles.deckRegion}`}
          aria-labelledby="deck-zones-title"
        >
          <header className={styles.regionHeader}>
            <div>
              <p className={styles.regionEyebrow}>Deck</p>
              <h2 id="deck-zones-title">Zones and entries</h2>
            </div>
            <StatusBadge tone={detail.deck.status === "active" ? "success" : "warning"}>
              {detail.deck.status}
            </StatusBadge>
          </header>
          {printingPicker ? (
            <PreferredPrintingPicker
              entry={detail.entries.find((entry) => entry.id === printingPicker.entryId)!}
              page={printingPicker.page}
              query={query}
            />
          ) : null}
          <DeckZoneEditor detail={detail} returnTo={returnTo} />
        </section>
        <aside
          className={`${surfaceClass(surface, "analysis")} ${styles.analysisRegion}`}
          aria-labelledby="deck-analysis-title"
        >
          <header className={styles.regionHeader}>
            <div>
              <p className={styles.regionEyebrow}>Analysis</p>
              <h2 id="deck-analysis-title">Ownership and validation</h2>
            </div>
          </header>
          <DeckAnalysisInspector detail={detail} />
        </aside>
      </div>
    </div>
  );
}
