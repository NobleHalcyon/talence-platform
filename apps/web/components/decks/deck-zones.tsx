import Link from "next/link";

import { Badge, ButtonLink, CardImage, EmptyState, PriceDisplay, StatusBadge } from "@talence/ui";

import type { DeckDetail, DeckEntry } from "@/features/decks/types";

import { DeckEntryControls } from "./deck-entry-controls";
import styles from "./decks.module.css";

const ZONES = [
  ["commander", "Commander", "Commander requirements count toward the exact deck total."],
  ["companion", "Companion", "For constructed formats, a companion consumes sideboard capacity."],
  ["mainboard", "Mainboard", "Primary required cards."],
  ["sideboard", "Sideboard", "Required cards allocated after the mainboard."],
  [
    "maybeboard",
    "Maybeboard",
    "Ideas only. These cards do not reserve owned copies or increase missing totals.",
  ],
] as const;

function ownershipTone(entry: DeckEntry) {
  if (!entry.ownership.countsTowardRequirement) return "information" as const;
  return entry.ownership.missingQuantity > 0 ? ("warning" as const) : ("success" as const);
}

function EntryCard({
  entry,
  deck,
  returnTo,
}: {
  entry: DeckEntry;
  deck: DeckDetail["deck"];
  returnTo: string;
}) {
  const preferred = entry.card.printingChoices.find(
    (printing) => printing.printingId === entry.preferredPrintingId,
  );
  const disabled = deck.status !== "active";
  return (
    <li className={styles.entryCard}>
      <div className={styles.entryIdentity}>
        <CardImage
          className={styles.entryImage}
          src={preferred?.imageSmallUri ?? entry.card.representativePrinting?.imageSmallUri ?? null}
          alt={`${entry.card.name} card image`}
        />
        <div className={styles.minWidthZero}>
          <h4>
            <Link href={`/app/catalog/cards/${entry.card.cardId}`}>{entry.card.name}</Link>
          </h4>
          <p>{entry.card.typeLine ?? "Type unavailable"}</p>
          <div className={styles.badgeRow}>
            <Badge>{entry.quantity} required</Badge>
            <StatusBadge tone={ownershipTone(entry)}>
              {entry.ownership.countsTowardRequirement
                ? `${entry.ownership.allocatedQuantity} allocated`
                : "Does not reserve copies"}
            </StatusBadge>
          </div>
        </div>
      </div>
      <dl className={styles.entryOwnership}>
        <div>
          <dt>{entry.zone === "maybeboard" ? "Available pool" : "Required"}</dt>
          <dd>
            {entry.zone === "maybeboard"
              ? entry.ownership.ownedQuantity
              : entry.ownership.requiredQuantity}
          </dd>
        </div>
        <div>
          <dt>Allocated owned</dt>
          <dd>{entry.ownership.allocatedQuantity}</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd>{entry.ownership.missingQuantity}</dd>
        </div>
        <div>
          <dt>Oracle pool available</dt>
          <dd>{entry.ownership.ownedQuantity}</dd>
        </div>
        <div>
          <dt>Preferred available</dt>
          <dd>{entry.ownership.preferredPrintingOwnedQuantity ?? "Not selected"}</dd>
        </div>
        <div>
          <dt>Preferred allocated</dt>
          <dd>{entry.ownership.preferredPrintingAllocatedQuantity ?? "Not selected"}</dd>
        </div>
        <div>
          <dt>Preferred missing</dt>
          <dd>{entry.ownership.preferredPrintingMissingQuantity ?? "Not selected"}</dd>
        </div>
      </dl>
      <p className={styles.allocationNote}>
        Oracle pool availability is shared across zones and is not additive. Only “Allocated owned”
        contributes to whole-deck ownership.
      </p>
      {entry.preferredPrintingId ? (
        <div className={styles.preferredPrinting}>
          <strong>Preferred:</strong>{" "}
          {preferred
            ? `${preferred.setCode} #${preferred.collectorNumber}`
            : entry.preferredPrintingId}{" "}
          · {entry.preferredFinish ?? "finish unavailable"}
          {preferred && !preferred.active ? (
            <StatusBadge tone="warning">Inactive printing retained</StatusBadge>
          ) : null}
          <PriceDisplay observation={entry.preferredPrice} />
        </div>
      ) : (
        <p className={styles.secondaryText}>
          No preferred printing or finish. Exact preferred value is unavailable.
        </p>
      )}
      <DeckEntryControls entry={entry} deckId={deck.id} returnTo={returnTo} disabled={disabled} />
      <ButtonLink
        href={`${returnTo}${returnTo.includes("?") ? "&" : "?"}printing_for=${entry.id}`}
        variant="secondary"
        size="small"
      >
        Browse preferred printings
      </ButtonLink>
    </li>
  );
}

export function DeckZoneEditor({ detail, returnTo }: { detail: DeckDetail; returnTo: string }) {
  if (!detail.entries.length) {
    return (
      <EmptyState
        title="This deck has no entries"
        message="Use catalog search to add an oracle card to a named zone."
      />
    );
  }
  return (
    <div className={styles.zoneStack}>
      {ZONES.map(([zone, label, description]) => {
        const entries = detail.entries.filter((entry) => entry.zone === zone);
        const quantity = entries.reduce((total, entry) => total + entry.quantity, 0);
        return (
          <section className={styles.zoneSection} key={zone} aria-labelledby={`deck-zone-${zone}`}>
            <header className={styles.zoneHeader}>
              <div>
                <h3 id={`deck-zone-${zone}`}>{label}</h3>
                <p>{description}</p>
              </div>
              <Badge>{quantity} cards</Badge>
            </header>
            {entries.length ? (
              <ul className={styles.entryList}>
                {entries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} deck={detail.deck} returnTo={returnTo} />
                ))}
              </ul>
            ) : (
              <p className={styles.emptyZone}>No {label.toLocaleLowerCase("en-US")} entries.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
