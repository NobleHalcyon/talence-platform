import Link from "next/link";

import {
  Badge,
  ButtonLink,
  CardImage,
  DataTable,
  EmptyState,
  Panel,
  PriceDisplay,
  Section,
  StatusBadge,
} from "@talence/ui";

import type {
  CatalogCardDetail,
  CatalogPrintingDetail,
  CatalogSearchItem,
  CatalogSetDetail,
} from "@/features/catalog/types";

import { CatalogFreshnessSummary } from "./catalog-results";
import styles from "./catalog.module.css";

function faceImages(item: CatalogSearchItem) {
  return item.faces.map((face, index) => ({
    src: face.imageLargeUri ?? face.imageNormalUri ?? face.imageSmallUri,
    alt:
      item.faces.length > 1
        ? `${face.name}, face ${index + 1} of ${item.name}`
        : `${face.name} from ${item.set.name}`,
    label: face.name,
  }));
}

function safeExternalHref(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "scryfall.com" || parsed.hostname.endsWith(".scryfall.com"))
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(date);
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function BackToCatalog({ href }: { href: string }) {
  return (
    <ButtonLink href={href} variant="quiet" size="small">
      ← Back to catalog
    </ButtonLink>
  );
}

function PrintingIdentity({ item }: { item: CatalogSearchItem }) {
  return (
    <dl className={styles.definitionGrid}>
      <div>
        <dt>Set</dt>
        <dd>
          <Link href={`/app/catalog/sets/${item.set.code}`}>
            {item.set.name} ({item.set.code})
          </Link>
        </dd>
      </div>
      <div>
        <dt>Collector number</dt>
        <dd>{item.collectorNumber}</dd>
      </div>
      <div>
        <dt>Language</dt>
        <dd>{item.language.toUpperCase()}</dd>
      </div>
      <div>
        <dt>Rarity</dt>
        <dd>{item.rarity ? label(item.rarity) : "Unavailable"}</dd>
      </div>
      <div>
        <dt>Released</dt>
        <dd>{formatDate(item.releasedAt)}</dd>
      </div>
      <div>
        <dt>Artist</dt>
        <dd>{item.artist ?? "Unavailable"}</dd>
      </div>
      <div>
        <dt>Layout</dt>
        <dd>{item.layout ? label(item.layout) : "Unavailable"}</dd>
      </div>
      <div>
        <dt>Medium</dt>
        <dd>{item.digital ? "Digital" : "Physical"}</dd>
      </div>
    </dl>
  );
}

function PrintingSelector({ printings, from }: { printings: CatalogSearchItem[]; from: string }) {
  if (printings.length === 0) {
    return (
      <EmptyState
        title="No active printings"
        message="This oracle identity is present, but no admitted-user printing is currently active."
      />
    );
  }

  return (
    <DataTable className={styles.detailTable} label="Printing selector">
      <table>
        <thead>
          <tr>
            <th scope="col">Set / number</th>
            <th scope="col">Language</th>
            <th scope="col">Rarity</th>
            <th scope="col">Finishes</th>
            <th scope="col">Estimate</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {printings.map((printing) => (
            <tr key={printing.printingId}>
              <td data-label="Set / number">
                {printing.set.code} #{printing.collectorNumber}
              </td>
              <td data-label="Language">{printing.language.toUpperCase()}</td>
              <td data-label="Rarity">
                {printing.rarity ? label(printing.rarity) : "Unavailable"}
              </td>
              <td data-label="Finishes">
                <span className={styles.finishList}>
                  {printing.finishes.map((finish) => (
                    <Badge key={finish}>{finish}</Badge>
                  ))}
                </span>
              </td>
              <td data-label="Estimate">
                <PriceDisplay observation={printing.bestPrice} />
              </td>
              <td data-label="Details">
                <Link
                  className={styles.primaryLink}
                  href={`/app/catalog/printings/${printing.printingId}?${new URLSearchParams({
                    from,
                  })}`}
                >
                  Exact printing
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export function CatalogCardDetailView({
  detail,
  backHref,
  preview,
}: {
  detail: CatalogCardDetail;
  backHref: string;
  preview: boolean;
}) {
  const representative = detail.representativePrinting;
  const browsePrintingsHref = `/app/catalog?${new URLSearchParams({
    q: detail.card.name,
    view: "table",
  })}`;

  return (
    <div className={styles.detailStack}>
      <BackToCatalog href={backHref} />
      <CatalogFreshnessSummary freshness={detail.catalog} preview={preview} />
      <div className={styles.detailHero}>
        <div className={styles.detailImageColumn}>
          {representative ? (
            <CardImage
              alt={`${detail.card.name} card image`}
              faces={faceImages(representative)}
              fallbackLabel={`${detail.card.name} image unavailable`}
            />
          ) : (
            <CardImage
              alt={`${detail.card.name} card image`}
              fallbackLabel={`${detail.card.name} image unavailable`}
            />
          )}
        </div>
        <Panel className={styles.oraclePanel}>
          <div className={styles.detailBadges}>
            {detail.card.colors.map((color) => (
              <Badge key={color}>{color}</Badge>
            ))}
            {detail.card.reserved ? <StatusBadge tone="warning">Reserved</StatusBadge> : null}
          </div>
          <dl className={styles.definitionGrid}>
            <div>
              <dt>Mana cost</dt>
              <dd>{detail.card.manaCost ?? "None"}</dd>
            </div>
            <div>
              <dt>Mana value</dt>
              <dd>{detail.card.manaValue ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Type line</dt>
              <dd>{detail.card.typeLine ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Color identity</dt>
              <dd>
                {detail.card.colorIdentity.length
                  ? detail.card.colorIdentity.join(", ")
                  : "Colorless"}
              </dd>
            </div>
          </dl>
          <div>
            <h2 className={styles.subheading}>Oracle text</h2>
            <p className={styles.oracleText}>
              {detail.card.oracleText ?? "Oracle text unavailable."}
            </p>
          </div>
          <div>
            <h2 className={styles.subheading}>Keywords</h2>
            <p className={styles.compactCopy}>
              {detail.card.keywords.length ? detail.card.keywords.join(", ") : "None"}
            </p>
          </div>
        </Panel>
      </div>

      <Section
        title={`Printings (${detail.printingCount.toLocaleString()})`}
        description={
          detail.printingsTruncated
            ? `Showing the newest ${detail.printings.length.toLocaleString()} of ${detail.printingCount.toLocaleString()} printings. Use catalog search to browse beyond this bounded detail view.`
            : "Choose the exact set, collector number, language, finish, and current estimate."
        }
        action={
          detail.printingsTruncated ? (
            <ButtonLink href={browsePrintingsHref} variant="secondary" size="small">
              Browse catalog matches
            </ButtonLink>
          ) : undefined
        }
      >
        <PrintingSelector printings={detail.printings} from={backHref} />
      </Section>

      <Section
        title="Legalities"
        description="Provider-supplied legality by format for this oracle identity."
      >
        {detail.legalities.length ? (
          <ul className={styles.legalityGrid}>
            {detail.legalities.map((legality) => (
              <li key={legality.formatCode}>
                <span>{label(legality.formatCode)}</span>
                <StatusBadge
                  tone={
                    legality.legality === "legal"
                      ? "success"
                      : legality.legality === "not_legal"
                        ? "neutral"
                        : "warning"
                  }
                >
                  {label(legality.legality)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.compactCopy}>Legality data is unavailable.</p>
        )}
      </Section>
    </div>
  );
}

export function CatalogPrintingDetailView({
  detail,
  backHref,
  preview,
}: {
  detail: CatalogPrintingDetail;
  backHref: string;
  preview: boolean;
}) {
  const item = detail.printing;
  const providerHref = safeExternalHref(item.providerUri);

  return (
    <div className={styles.detailStack}>
      <BackToCatalog href={backHref} />
      <CatalogFreshnessSummary freshness={detail.catalog} preview={preview} />
      <div className={styles.detailHero}>
        <div className={styles.detailImageColumn}>
          <CardImage
            alt={`${item.name} card image`}
            faces={faceImages(item)}
            fallbackLabel={`${item.name} image unavailable`}
          />
        </div>
        <Panel className={styles.oraclePanel}>
          <div className={styles.detailBadges}>
            {item.finishes.map((finish) => (
              <Badge key={finish}>{finish}</Badge>
            ))}
            {item.digital ? <Badge tone="information">Digital</Badge> : null}
            {item.promo ? <Badge tone="information">Promo</Badge> : null}
            {item.oversized ? <Badge tone="warning">Oversized</Badge> : null}
          </div>
          <PrintingIdentity item={item} />
          {item.printedName && item.printedName !== item.name ? (
            <div>
              <h2 className={styles.subheading}>Printed name</h2>
              <p className={styles.compactCopy}>{item.printedName}</p>
            </div>
          ) : null}
          {providerHref ? (
            <ButtonLink href={providerHref} target="_blank" rel="noreferrer" variant="secondary">
              Open provider record
            </ButtonLink>
          ) : null}
        </Panel>
      </div>

      <Section
        title="Current estimates"
        description="General market estimates by finish and currency, with provider observation and Talence ingestion timestamps."
      >
        {detail.prices.length ? (
          <div className={styles.priceGrid}>
            {detail.prices.map((price) => (
              <Panel
                className={styles.pricePanel}
                key={`${price.provider}-${price.currency}-${price.finish}`}
              >
                <div className={styles.detailBadges}>
                  <Badge>{price.finish}</Badge>
                  <Badge>{price.currency}</Badge>
                </div>
                <PriceDisplay observation={price} />
              </Panel>
            ))}
          </div>
        ) : (
          <div className={styles.unavailablePrice}>
            <PriceDisplay observation={null} />
            <p>No provider observation exists for this printing and selected finishes.</p>
          </div>
        )}
      </Section>

      <Section
        title="Printing rules faces"
        description="Rules and art identity are kept per ordered face."
      >
        <div className={styles.faceRulesGrid}>
          {item.faces.map((face) => (
            <article key={face.id} className={styles.faceRules}>
              <h3>{face.name}</h3>
              <p>
                {face.manaCost ?? "No mana cost"} · {face.typeLine ?? "Type unavailable"}
              </p>
              <p className={styles.oracleText}>{face.oracleText ?? "Oracle text unavailable."}</p>
              {face.power || face.toughness ? (
                <p>
                  Power / toughness: {face.power ?? "—"} / {face.toughness ?? "—"}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function CatalogSetDetailView({
  detail,
  backHref,
  preview,
}: {
  detail: CatalogSetDetail;
  backHref: string;
  preview: boolean;
}) {
  return (
    <div className={styles.detailStack}>
      <BackToCatalog href={backHref} />
      <CatalogFreshnessSummary freshness={detail.catalog} preview={preview} />
      <Panel>
        <dl className={styles.definitionGrid}>
          <div>
            <dt>Code</dt>
            <dd>{detail.set.code}</dd>
          </div>
          <div>
            <dt>Set type</dt>
            <dd>{detail.set.setType ? label(detail.set.setType) : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Released</dt>
            <dd>{formatDate(detail.set.releasedAt)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{detail.set.sourceProvider}</dd>
          </div>
          <div>
            <dt>Printings</dt>
            <dd>{detail.totalCount ?? detail.set.cardCount ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Medium</dt>
            <dd>{detail.set.digital ? "Digital" : "Physical"}</dd>
          </div>
        </dl>
      </Panel>
      <Section
        title="Printing sample"
        description="A bounded set sample is shown here; use the catalog filter for the complete cursor-paginated result."
        action={
          <ButtonLink
            href={`/app/catalog?${new URLSearchParams({ set: detail.set.code, view: "table" })}`}
            variant="secondary"
            size="small"
          >
            Browse all
          </ButtonLink>
        }
      >
        <PrintingSelector printings={detail.printings} from={backHref} />
      </Section>
    </div>
  );
}
