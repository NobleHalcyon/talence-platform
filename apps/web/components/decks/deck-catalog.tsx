import {
  Badge,
  Button,
  ButtonLink,
  CardImage,
  EmptyState,
  FormField,
  NumberInput,
  SearchInput,
  Select,
  StatusBadge,
} from "@talence/ui";

import { addDeckEntryAction } from "@/features/decks/actions";
import { deckEditorHref } from "@/features/decks/query";
import type { DeckCatalogSearchPage, DeckDetail } from "@/features/decks/types";

import styles from "./decks.module.css";

const ZONES = [
  ["mainboard", "Mainboard"],
  ["sideboard", "Sideboard"],
  ["commander", "Commander"],
  ["companion", "Companion"],
  ["maybeboard", "Maybeboard"],
] as const;

function legalityTone(legality: string | null) {
  if (legality === "legal" || legality === "restricted") return "success" as const;
  if (legality === null) return "warning" as const;
  return "danger" as const;
}

export function DeckCatalogRail({
  detail,
  result,
  query,
  returnTo,
}: {
  detail: DeckDetail;
  result: DeckCatalogSearchPage;
  query: string;
  returnTo: string;
}) {
  const disabled = detail.deck.status !== "active" || !detail.permissions.canEdit;
  return (
    <div className={styles.catalogRailContent}>
      <form
        className={styles.deckSearch}
        action={`/app/decks/${detail.deck.id}`}
        method="get"
        role="search"
      >
        <input type="hidden" name="surface" value="catalog" />
        <FormField
          inputId="deck-catalog-query"
          label="Search oracle cards"
          hint="Talence searches the ingested catalog. No live provider request is made."
        >
          <SearchInput
            name="q"
            defaultValue={query}
            minLength={2}
            maxLength={120}
            placeholder="Card name or rules text"
          />
        </FormField>
        <Button type="submit">Search</Button>
      </form>
      <p className={styles.secondaryText}>
        Results are oracle-level and deduplicated. Add the oracle requirement first; choosing the
        shown printing is always explicit.
      </p>
      {result.items.length ? (
        <ul className={styles.catalogResultList} aria-label="Deck catalog results">
          {result.items.map((item) => {
            const printing = item.card.representativePrinting;
            const defaultFinish = printing?.availableFinishes[0] ?? null;
            return (
              <li className={styles.catalogResult} key={item.card.cardId}>
                <div className={styles.catalogResultIdentity}>
                  <CardImage
                    className={styles.catalogResultImage}
                    src={printing?.imageSmallUri}
                    alt={`${item.card.name} card image`}
                  />
                  <div className={styles.minWidthZero}>
                    <h3>{item.card.name}</h3>
                    <p>{item.card.typeLine ?? "Type unavailable"}</p>
                    <div className={styles.badgeRow}>
                      <StatusBadge tone={legalityTone(item.legality)}>
                        {item.legality ?? "Legality unknown"}
                      </StatusBadge>
                      <Badge>{item.ownedQuantity} available</Badge>
                    </div>
                  </div>
                </div>
                <form className={styles.catalogAddForm} action={addDeckEntryAction}>
                  <input type="hidden" name="deckId" value={detail.deck.id} />
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={detail.deck.currentRevision}
                  />
                  <input type="hidden" name="cardId" value={item.card.cardId} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <FormField inputId={`add-${item.card.cardId}-zone`} label="Add to zone">
                    <Select name="zone" defaultValue="mainboard" disabled={disabled}>
                      {ZONES.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField inputId={`add-${item.card.cardId}-quantity`} label="Quantity">
                    <NumberInput
                      name="quantity"
                      min={1}
                      max={999}
                      defaultValue={1}
                      disabled={disabled}
                    />
                  </FormField>
                  <input type="hidden" name="preferredPrintingId" value="" />
                  <input type="hidden" name="preferredFinish" value="" />
                  <Button type="submit" size="small" disabled={disabled}>
                    Add oracle card
                  </Button>
                </form>
                {printing && defaultFinish ? (
                  <form className={styles.preferredAddForm} action={addDeckEntryAction}>
                    <input type="hidden" name="deckId" value={detail.deck.id} />
                    <input
                      type="hidden"
                      name="expectedRevision"
                      value={detail.deck.currentRevision}
                    />
                    <input type="hidden" name="cardId" value={item.card.cardId} />
                    <input type="hidden" name="zone" value="mainboard" />
                    <input type="hidden" name="quantity" value="1" />
                    <input type="hidden" name="preferredPrintingId" value={printing.printingId} />
                    <input type="hidden" name="preferredFinish" value={defaultFinish} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Button
                      type="submit"
                      size="small"
                      variant="secondary"
                      disabled={disabled || !printing.active}
                    >
                      Add with {printing.setCode} #{printing.collectorNumber} {defaultFinish}
                    </Button>
                    {!printing.active ? (
                      <span>Inactive printings cannot become a new preference.</span>
                    ) : null}
                  </form>
                ) : (
                  <p className={styles.secondaryText}>
                    No active preferred printing and finish are available from this result.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={query ? "No oracle cards matched" : "No catalog cards available"}
          message={
            query
              ? "Adjust the search. No card was added."
              : "Catalog data must be imported before deck entries can be added."
          }
        />
      )}
      {result.nextCursor ? (
        <ButtonLink
          href={deckEditorHref(detail.deck.id, {
            surface: "catalog",
            query,
            catalogCursor: result.nextCursor,
          })}
          variant="secondary"
          size="small"
        >
          More catalog results
        </ButtonLink>
      ) : null}
      {result.catalogVersion ? (
        <p className={styles.versionText}>Catalog version {result.catalogVersion}</p>
      ) : (
        <StatusBadge tone="warning">Catalog version unavailable</StatusBadge>
      )}
    </div>
  );
}
