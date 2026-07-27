import { Badge, Panel, Section } from "@talence/ui";

import type { CollectionAnalytics, CollectionSummary } from "@/features/collections/types";

import { formatInstant, formatMoney, formatPriceProviders } from "./collection-shared";
import styles from "./collections.module.css";

export function CollectionSummaryView({ summary }: { summary: CollectionSummary }) {
  const primaryValue = summary.estimatedValues[0] ?? null;
  return (
    <section className={styles.summaryGrid} aria-label="Collection summary">
      <Panel>
        <span className={styles.metricLabel}>Physical cards</span>
        <strong className={styles.metricValue}>{summary.totalQuantity.toLocaleString()}</strong>
      </Panel>
      <Panel>
        <span className={styles.metricLabel}>Unique printings</span>
        <strong className={styles.metricValue}>{summary.uniquePrintings.toLocaleString()}</strong>
      </Panel>
      <Panel>
        <span className={styles.metricLabel}>Unique cards</span>
        <strong className={styles.metricValue}>{summary.uniqueCards.toLocaleString()}</strong>
      </Panel>
      <Panel>
        <span className={styles.metricLabel}>Estimated value</span>
        <strong className={styles.metricValue}>
          {primaryValue ? formatMoney(primaryValue.amount, primaryValue.currency) : "Unavailable"}
        </strong>
        <span className={styles.secondaryText}>{formatPriceProviders(summary.priceProviders)}</span>
      </Panel>
      <Panel>
        <span className={styles.metricLabel}>Unpriced quantity</span>
        <strong className={styles.metricValue}>{summary.unpricedQuantity.toLocaleString()}</strong>
      </Panel>
      <Panel>
        <span className={styles.metricLabel}>Stale priced quantity</span>
        <strong className={styles.metricValue}>
          {summary.stalePricedQuantity.toLocaleString()}
        </strong>
      </Panel>
      <Panel className={styles.freshnessMetric}>
        <span className={styles.metricLabel}>Price observations used</span>
        <span>
          Observed {formatInstant(summary.oldestPriceObservedAt)} to{" "}
          {formatInstant(summary.latestPriceObservedAt)} UTC
          <br />
          Ingested {formatInstant(summary.oldestPriceIngestedAt)} to{" "}
          {formatInstant(summary.latestPriceIngestedAt)} UTC
        </span>
      </Panel>
      <Panel className={styles.freshnessMetric}>
        <span className={styles.metricLabel}>Inventory last changed</span>
        <span>{formatInstant(summary.latestTransactionAt)} UTC</span>
      </Panel>
    </section>
  );
}

function AnalyticsTable({
  title,
  description,
  currency,
  groups,
}: {
  title: string;
  description: string;
  currency: string;
  groups: CollectionAnalytics["groups"]["sets"];
}) {
  return (
    <Section title={title} description={description}>
      {groups.length ? (
        <div className={styles.analyticsTableRegion} role="region" aria-label={title} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Quantity</th>
                <th scope="col">Estimate</th>
                <th scope="col">Unpriced</th>
                <th scope="col">Stale</th>
                <th scope="col">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={`${group.group}:${JSON.stringify(group.key)}`}>
                  <th scope="row">{group.label}</th>
                  <td>{group.quantity.toLocaleString()}</td>
                  <td>
                    {formatMoney(group.estimatedValue, currency)}
                    <span className={styles.secondaryText}>
                      {formatPriceProviders(group.priceProviders)}
                    </span>
                  </td>
                  <td>{group.unpricedQuantity.toLocaleString()}</td>
                  <td>{group.staleQuantity.toLocaleString()}</td>
                  <td>
                    Observed {formatInstant(group.oldestPriceObservedAt)} to{" "}
                    {formatInstant(group.latestPriceObservedAt)}
                    <span className={styles.secondaryText}>
                      Ingested {formatInstant(group.oldestPriceIngestedAt)} to{" "}
                      {formatInstant(group.latestPriceIngestedAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.mutedCopy}>No balances contribute to this dimension.</p>
      )}
    </Section>
  );
}

export function CollectionAnalyticsView({ analytics }: { analytics: CollectionAnalytics }) {
  return (
    <div className={styles.sectionStack}>
      <div className={styles.analyticsHeadline}>
        <Panel>
          <span className={styles.metricLabel}>Grouped estimate</span>
          <strong className={styles.metricValue}>
            {formatMoney(analytics.estimatedValue, analytics.currency)}
          </strong>
          <span className={styles.secondaryText}>
            {formatPriceProviders(analytics.priceProviders)}
          </span>
        </Panel>
        <Panel>
          <span className={styles.metricLabel}>Coverage</span>
          <strong className={styles.metricValue}>
            {analytics.pricedQuantity}/{analytics.quantityTotal} priced
          </strong>
          {analytics.staleQuantity ? (
            <Badge tone="warning">{analytics.staleQuantity} stale</Badge>
          ) : (
            <Badge tone="success">Current</Badge>
          )}
        </Panel>
        <Panel>
          <span className={styles.metricLabel}>Price freshness</span>
          <span>
            Observed {formatInstant(analytics.oldestPriceObservedAt)} to{" "}
            {formatInstant(analytics.latestPriceObservedAt)} UTC
          </span>
          <span className={styles.secondaryText}>
            Ingested {formatInstant(analytics.oldestPriceIngestedAt)} to{" "}
            {formatInstant(analytics.latestPriceIngestedAt)} UTC
          </span>
        </Panel>
      </div>
      <AnalyticsTable
        title="Sets"
        description="Each balance contributes once to its exact printing set."
        currency={analytics.currency}
        groups={analytics.groups.sets}
      />
      <AnalyticsTable
        title="Colors"
        description="Canonical color arrays are grouped as one value; multicolor balances are never double-counted."
        currency={analytics.currency}
        groups={analytics.groups.colors}
      />
      <AnalyticsTable
        title="Color identity"
        description="Oracle color-identity arrays grouped without exploding individual colors."
        currency={analytics.currency}
        groups={analytics.groups.colorIdentities}
      />
      <AnalyticsTable
        title="Rarities"
        description="Printing rarity with readable quantities and values."
        currency={analytics.currency}
        groups={analytics.groups.rarities}
      />
      <AnalyticsTable
        title="Finishes"
        description="Finish-specific pricing keeps foil, etched, and nonfoil values distinct."
        currency={analytics.currency}
        groups={analytics.groups.finishes}
      />
      <AnalyticsTable
        title="Conditions"
        description="No condition multiplier is applied in this release."
        currency={analytics.currency}
        groups={analytics.groups.conditions}
      />
      <AnalyticsTable
        title="Value tiers"
        description={`Currency-neutral policy thresholds evaluated in ${analytics.currency}.`}
        currency={analytics.currency}
        groups={analytics.groups.valueTiers}
      />
    </div>
  );
}
