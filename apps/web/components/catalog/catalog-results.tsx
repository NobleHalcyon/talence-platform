import { randomUUID } from "node:crypto";

import Link from "next/link";

import {
  Badge,
  ButtonLink,
  CardImage,
  CursorControls,
  DataTable,
  PriceDisplay,
  StatusBadge,
} from "@talence/ui";

import { AddToCollection } from "@/components/collections/add-to-collection";
import {
  ALL_CATALOG_LANGUAGES,
  catalogHref,
  DEFAULT_CATALOG_LANGUAGE,
} from "@/features/catalog/query";
import type {
  CatalogFreshness,
  CatalogDeckOption,
  CatalogSearchItem,
  CatalogSearchQuery,
  CatalogSearchResult,
} from "@/features/catalog/types";

import styles from "./catalog.module.css";
import { CatalogAddToDeck } from "./catalog-add-to-deck";

function formatInstant(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(instant);
}

export function CatalogFreshnessSummary({
  freshness,
  preview = false,
}: {
  freshness: CatalogFreshness;
  preview?: boolean;
}) {
  return (
    <div className={styles.freshness} aria-label="Catalog freshness">
      <span>
        Catalog {freshness.version ?? "version unavailable"} · provider observed{" "}
        <time dateTime={freshness.sourceObservedAt ?? undefined}>
          {formatInstant(freshness.sourceObservedAt)} UTC
        </time>
      </span>
      {freshness.ingestedAt ? (
        <span>
          Ingested{" "}
          <time dateTime={freshness.ingestedAt}>{formatInstant(freshness.ingestedAt)} UTC</time>
        </span>
      ) : null}
      {preview ? <Badge tone="information">Deterministic preview data</Badge> : null}
    </div>
  );
}

function faceImages(item: CatalogSearchItem) {
  return item.faces.map((face, index) => ({
    src: face.imageNormalUri ?? face.imageLargeUri ?? face.imageSmallUri,
    alt:
      item.faces.length > 1
        ? `${face.name}, face ${index + 1} of ${item.name}`
        : `${face.name} from ${item.set.name}`,
    label: face.name,
  }));
}

function detailsHref(item: CatalogSearchItem, from: string): string {
  const pathname = item.cardId
    ? `/app/catalog/cards/${item.cardId}`
    : `/app/catalog/printings/${item.printingId}`;
  return `${pathname}?${new URLSearchParams({ from })}`;
}

function printingHref(item: CatalogSearchItem, from: string): string {
  return `/app/catalog/printings/${item.printingId}?${new URLSearchParams({ from })}`;
}

function ActiveFilters({ query }: { query: CatalogSearchQuery }) {
  const filters: Array<{
    key: string;
    label: string;
    overrides: Partial<CatalogSearchQuery>;
  }> = [];

  if (query.query)
    filters.push({ key: "q", label: `Search: ${query.query}`, overrides: { query: "" } });
  if (query.setCode) {
    filters.push({ key: "set", label: `Set: ${query.setCode}`, overrides: { setCode: "" } });
  }
  if (query.language !== DEFAULT_CATALOG_LANGUAGE) {
    filters.push({
      key: "language",
      label:
        query.language === ALL_CATALOG_LANGUAGES ? "All languages" : `Language: ${query.language}`,
      overrides: { language: DEFAULT_CATALOG_LANGUAGE },
    });
  }
  if (query.rarity) {
    filters.push({ key: "rarity", label: query.rarity, overrides: { rarity: "" } });
  }
  if (query.finish) {
    filters.push({ key: "finish", label: query.finish, overrides: { finish: "" } });
  }
  if (query.colors.length) {
    filters.push({
      key: "colors",
      label: `Color: ${query.colors.join("")}`,
      overrides: { colors: [] },
    });
  }
  if (query.colorIdentity.length) {
    filters.push({
      key: "identity",
      label: `Identity: ${query.colorIdentity.join("")}`,
      overrides: { colorIdentity: [] },
    });
  }
  if (query.typeLine) {
    filters.push({ key: "type", label: `Type: ${query.typeLine}`, overrides: { typeLine: "" } });
  }
  if (query.manaValueMin !== null || query.manaValueMax !== null) {
    filters.push({
      key: "mana",
      label: `Mana: ${query.manaValueMin ?? "0"}–${query.manaValueMax ?? "any"}`,
      overrides: { manaValueMin: null, manaValueMax: null },
    });
  }
  if (query.priceAvailability !== "any") {
    filters.push({
      key: "price",
      label: query.priceAvailability === "available" ? "Priced" : "Unpriced",
      overrides: { priceAvailability: "any" },
    });
  }
  if (query.currency) {
    filters.push({ key: "currency", label: query.currency, overrides: { currency: "" } });
  }
  if (query.includeDigital) {
    filters.push({
      key: "digital",
      label: "Digital included",
      overrides: { includeDigital: false },
    });
  }
  if (query.includeNondefault) {
    filters.push({
      key: "nondefault",
      label: "Nondefault objects included",
      overrides: { includeNondefault: false },
    });
  }
  if (query.returnAllVariants) {
    filters.push({
      key: "variants",
      label: "All variants",
      overrides: { returnAllVariants: false },
    });
  }
  if (query.releasedFrom || query.releasedTo) {
    filters.push({
      key: "release",
      label: `Released ${query.releasedFrom || "any"}–${query.releasedTo || "now"}`,
      overrides: { releasedFrom: "", releasedTo: "" },
    });
  }

  if (filters.length === 0) {
    return null;
  }

  return (
    <ul className={styles.filterChips} aria-label="Active filters">
      {filters.map((filter) => (
        <li key={filter.key}>
          <Link href={catalogHref(query, { ...filter.overrides, cursor: null })}>
            {filter.label} <span aria-hidden="true">×</span>
            <span className={styles.visuallyHidden}>Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CatalogViewToggle({ query }: { query: CatalogSearchQuery }) {
  return (
    <div className={styles.viewToggle} role="group" aria-label="Catalog result view">
      {(["grid", "table"] as const).map((view) => {
        const selected = query.view === view;
        const returnTo = catalogHref(query, { cursor: null, view });
        return (
          <ButtonLink
            href={returnTo}
            size="small"
            variant={selected ? "primary" : "secondary"}
            aria-pressed={selected}
            key={view}
          >
            {view === "table" ? "Table" : "Grid"}
          </ButtonLink>
        );
      })}
    </div>
  );
}

function FinishBadges({ item }: { item: CatalogSearchItem }) {
  return (
    <span className={styles.finishList} aria-label="Available finishes">
      {item.finishes.length ? (
        item.finishes.map((finish) => <Badge key={finish}>{finish}</Badge>)
      ) : (
        <span>Not supplied</span>
      )}
    </span>
  );
}

function compactPrices(item: CatalogSearchItem): string[] {
  return (
    [
      ["Nonfoil", item.displayPrices.nonfoil],
      ["Foil", item.displayPrices.foil],
    ] as const
  ).flatMap(([label, price]) => {
    if (!price) return [];
    if (price.currency === "TIX") return [`${label} ${price.amount} TIX`];
    const amount = Number(price.amount);
    const formatted = Number.isFinite(amount)
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: price.currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount)
      : `${price.amount} ${price.currency}`;
    return [`${label} ${formatted}`];
  });
}

function CatalogGrid({
  items,
  from,
  decks,
}: {
  items: CatalogSearchItem[];
  from: string;
  decks: CatalogDeckOption[];
}) {
  return (
    <div className={styles.cardGrid} aria-label="Catalog results">
      {items.map((item) => {
        const addAttemptId = randomUUID();
        const addOccurredAt = new Date().toISOString();
        const prices = compactPrices(item);
        return (
          <article className={styles.catalogCard} key={item.printingId}>
            <p className={styles.gridOracleName}>{item.oracleName}</p>
            <CardImage
              className={styles.gridImage}
              alt={`${item.name} card image`}
              faces={faceImages(item).slice(0, 1)}
            />
            <Link
              className={styles.gridCardLink}
              href={detailsHref(item, from)}
              aria-label={`View ${item.oracleName}`}
            />
            <div className={styles.gridQuickActions}>
              <AddToCollection
                printingId={item.printingId}
                name={item.name}
                finishes={item.finishes}
                attemptId={addAttemptId}
                occurredAt={addOccurredAt}
                iconOnly
              />
              <CatalogAddToDeck cardId={item.cardId} name={item.oracleName} decks={decks} />
            </div>
            <p className={styles.gridPrices}>
              {prices.length ? prices.join(" · ") : "Price unavailable"}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function CatalogTable({ items, from }: { items: CatalogSearchItem[]; from: string }) {
  return (
    <DataTable className={styles.catalogTable} label="Catalog results">
      <table>
        <thead>
          <tr>
            <th scope="col">Card</th>
            <th scope="col">Printing</th>
            <th scope="col">Language</th>
            <th scope="col">Rarity</th>
            <th scope="col">Finishes</th>
            <th scope="col">Estimate</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const addAttemptId = randomUUID();
            const addOccurredAt = new Date().toISOString();
            return (
              <tr key={item.printingId}>
                <td data-label="Card">
                  <div className={styles.tableIdentity}>
                    <CardImage
                      className={styles.tableImage}
                      alt={`${item.name} card image`}
                      faces={faceImages(item).slice(0, 1)}
                    />
                    <span>
                      <Link className={styles.primaryLink} href={detailsHref(item, from)}>
                        {item.name}
                      </Link>
                      <span className={styles.secondaryText}>
                        {item.typeLine ?? "Type unavailable"}
                      </span>
                    </span>
                  </div>
                </td>
                <td data-label="Printing">
                  <Link className={styles.primaryLink} href={printingHref(item, from)}>
                    {item.set.code} #{item.collectorNumber}
                  </Link>
                  <span className={styles.secondaryText}>{item.set.name}</span>
                </td>
                <td data-label="Language">{item.language.toUpperCase()}</td>
                <td data-label="Rarity">{item.rarity ?? "Unavailable"}</td>
                <td data-label="Finishes">
                  <FinishBadges item={item} />
                </td>
                <td data-label="Estimate">
                  <PriceDisplay observation={item.bestPrice} />
                  <AddToCollection
                    printingId={item.printingId}
                    name={item.name}
                    finishes={item.finishes}
                    attemptId={addAttemptId}
                    occurredAt={addOccurredAt}
                    compact
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTable>
  );
}

export function CatalogResults({
  query,
  result,
  deckOptions = [],
}: {
  query: CatalogSearchQuery;
  result: CatalogSearchResult;
  preview: boolean;
  deckOptions?: CatalogDeckOption[];
}) {
  const from = catalogHref(query);
  const countLabel =
    result.totalCount === null
      ? `${result.resultCount} results on this page`
      : `${result.totalCount.toLocaleString("en-US")} results`;

  return (
    <section className={styles.results} aria-labelledby="catalog-results-title">
      <div className={styles.resultHeader}>
        <h2 id="catalog-results-title">{countLabel}</h2>
        <CatalogViewToggle query={query} />
      </div>
      <ActiveFilters query={query} />
      {query.view === "grid" ? (
        <CatalogGrid items={result.items} from={from} decks={deckOptions} />
      ) : (
        <CatalogTable items={result.items} from={from} />
      )}
      <CursorControls
        previousHref={
          result.previousCursor ? catalogHref(query, { cursor: result.previousCursor }) : undefined
        }
        nextHref={result.nextCursor ? catalogHref(query, { cursor: result.nextCursor }) : undefined}
        label={`Showing ${result.resultCount.toLocaleString("en-US")} of ${
          result.totalCount?.toLocaleString("en-US") ?? "available"
        }`}
      />
      {result.items.some((item) => item.digital) ? (
        <StatusBadge tone="information">Digital results included by filter</StatusBadge>
      ) : null}
    </section>
  );
}
