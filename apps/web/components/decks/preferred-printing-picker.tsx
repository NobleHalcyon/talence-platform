import {
  Badge,
  Button,
  ButtonLink,
  CardImage,
  EmptyState,
  PriceDisplay,
  StatusBadge,
} from "@talence/ui";

import { updateDeckEntryAction } from "@/features/decks/actions";
import { deckEditorHref } from "@/features/decks/query";
import type { DeckCardPrintingsPage, DeckEntry } from "@/features/decks/types";

import styles from "./decks.module.css";

function updateHiddenFields(entry: DeckEntry, returnTo: string) {
  return (
    <>
      <input type="hidden" name="deckId" value={entry.deckId} />
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="quantity" value={entry.quantity} />
      <input type="hidden" name="zone" value={entry.zone} />
      <input type="hidden" name="notes" value={entry.notes ?? ""} />
      <input type="hidden" name="expectedRevision" value={entry.currentRevision} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

export function PreferredPrintingPicker({
  entry,
  page,
  query,
}: {
  entry: DeckEntry;
  page: DeckCardPrintingsPage;
  query: string;
}) {
  const returnTo = deckEditorHref(entry.deckId, { surface: "deck", query });
  return (
    <section className={styles.printingPicker} aria-labelledby="preferred-printing-title">
      <header className={styles.regionHeader}>
        <div>
          <p className={styles.regionEyebrow}>Exact printing and finish</p>
          <h3 id="preferred-printing-title">Choose for {entry.card.name}</h3>
        </div>
        <ButtonLink href={returnTo} variant="secondary" size="small">
          Close
        </ButtonLink>
      </header>
      <p className={styles.secondaryText}>
        This preference controls exact ownership and valuation; oracle-level deck identity does not
        change. Inactive existing preferences remain visible, but cannot be newly selected.
      </p>
      <form action={updateDeckEntryAction}>
        {updateHiddenFields(entry, returnTo)}
        <input type="hidden" name="preferredPrintingId" value="" />
        <input type="hidden" name="preferredFinish" value="" />
        <Button type="submit" size="small" variant="secondary">
          Clear preferred printing
        </Button>
      </form>
      {page.items.length ? (
        <ul className={styles.printingList}>
          {page.items.map((printing) => (
            <li key={printing.printingId}>
              <div className={styles.catalogResultIdentity}>
                <CardImage
                  className={styles.catalogResultImage}
                  src={printing.imageSmallUri}
                  alt={`${entry.card.name}, ${printing.setCode} ${printing.collectorNumber}`}
                />
                <div className={styles.minWidthZero}>
                  <strong>
                    {printing.setCode} #{printing.collectorNumber}
                  </strong>
                  <p>
                    {printing.setName} · {printing.language.toUpperCase()}
                  </p>
                  {!printing.active ? (
                    <StatusBadge tone="warning">Inactive printing</StatusBadge>
                  ) : null}
                </div>
              </div>
              {printing.finishOptions.length ? (
                <ul className={styles.finishOptionList}>
                  {printing.finishOptions.map((option) => (
                    <li key={option.finish}>
                      <div>
                        <Badge>{option.finish}</Badge>
                        <span>{option.ownedQuantity} exact copies owned</span>
                        <PriceDisplay observation={option.price} />
                      </div>
                      <form action={updateDeckEntryAction}>
                        {updateHiddenFields(entry, returnTo)}
                        <input
                          type="hidden"
                          name="preferredPrintingId"
                          value={printing.printingId}
                        />
                        <input type="hidden" name="preferredFinish" value={option.finish} />
                        <Button type="submit" size="small" disabled={!printing.active}>
                          Prefer {printing.setCode} {option.finish}
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No selectable finish was supplied.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No printings available"
          message="No active exact printing can be selected for this oracle card."
        />
      )}
      {page.nextCursor ? (
        <ButtonLink
          href={deckEditorHref(entry.deckId, {
            surface: "deck",
            query,
            printingFor: entry.id,
            printingCursor: page.nextCursor,
          })}
          variant="secondary"
          size="small"
        >
          More printings
        </ButtonLink>
      ) : null}
    </section>
  );
}
