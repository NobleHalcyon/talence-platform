import { Badge, DataTable, InlineAlert, Section, StatusBadge } from "@talence/ui";

import type { DeckDetail, DeckValidationIssue } from "@/features/decks/types";

import styles from "./decks.module.css";

function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "Unpriced / unknown";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatInstant(value: string | null): string {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function severityTone(severity: DeckValidationIssue["severity"]) {
  if (severity === "error") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "information" as const;
}

function PriceProvenance({ detail }: { detail: DeckDetail }) {
  const providers = detail.valuation.providers.length
    ? detail.valuation.providers.join(", ")
    : "Source unavailable";
  return (
    <p className={styles.priceProvenance}>
      {providers} estimates · observed {formatInstant(detail.valuation.oldestObservedAt)} to{" "}
      {formatInstant(detail.valuation.latestObservedAt)} UTC · ingested{" "}
      {formatInstant(detail.valuation.oldestIngestedAt)} to{" "}
      {formatInstant(detail.valuation.latestIngestedAt)} UTC
      {detail.valuation.stalePriceCount > 0
        ? ` · ${detail.valuation.stalePriceCount} stale preferred-price entries`
        : ""}
    </p>
  );
}

function issueDetails(issue: DeckValidationIssue) {
  const details = Object.entries(issue.details);
  if (!details.length) return null;
  return (
    <dl className={styles.issueDetails}>
      {details.map(([key, value]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DeckPersistentSummary({ detail }: { detail: DeckDetail }) {
  const errorCount = detail.validation.summary.errorCount;
  return (
    <aside className={styles.persistentSummary} aria-label="Deck count and validation summary">
      <span>
        <strong>{detail.ownership.requiredQuantity}</strong> required
      </span>
      <span>
        <strong>{detail.ownership.allocatedQuantity}</strong> allocated owned
      </span>
      <span>
        <strong>{detail.ownership.missingQuantity}</strong> missing
      </span>
      <StatusBadge tone={detail.validation.valid ? "success" : "warning"}>
        {detail.validation.valid
          ? "Baseline valid"
          : `${errorCount} validation ${errorCount === 1 ? "error" : "errors"}`}
      </StatusBadge>
    </aside>
  );
}

export function DeckAnalysisInspector({ detail }: { detail: DeckDetail }) {
  const { format, ownership, valuation, validation } = detail;
  return (
    <div className={styles.analysisStack}>
      <Section
        title="Whole-deck ownership"
        description="Finite collection copies are allocated once in deterministic zone order."
      >
        <dl className={styles.analysisStats}>
          <div>
            <dt>Required</dt>
            <dd>{ownership.requiredQuantity}</dd>
          </div>
          <div>
            <dt>Allocated owned</dt>
            <dd>{ownership.allocatedQuantity}</dd>
          </div>
          <div>
            <dt>Missing</dt>
            <dd>{ownership.missingQuantity}</dd>
          </div>
          <div>
            <dt>Maybeboard ideas</dt>
            <dd>{ownership.maybeboardQuantity}</dd>
          </div>
          <div>
            <dt>Collection sources</dt>
            <dd>{ownership.sourceCollectionCount}</dd>
          </div>
        </dl>
        <p className={styles.allocationNote}>
          Allocation order:{" "}
          {ownership.allocationOrder.map((zone) => zone.replaceAll("_", " ")).join(" → ")}.
          Maybeboard entries are excluded and do not reserve copies.
        </p>
      </Section>

      <Section
        title="Preferred-printing valuation"
        description="Only an explicitly selected printing and finish can contribute an exact estimate."
      >
        <dl className={styles.valuationStats}>
          <div>
            <dt>Selected preferred printings</dt>
            <dd>{formatMoney(valuation.preferredPrintingValue, valuation.currency)}</dd>
          </div>
          <div>
            <dt>Missing preferred acquisition estimate</dt>
            <dd>{formatMoney(valuation.missingAcquisitionValue, valuation.currency)}</dd>
          </div>
          <div>
            <dt>Unpriced entries</dt>
            <dd>{valuation.unpricedEntryCount}</dd>
          </div>
          <div>
            <dt>Unpriced missing quantity</dt>
            <dd>{valuation.unpricedMissingQuantity}</dd>
          </div>
        </dl>
        <PriceProvenance detail={detail} />
        <p className={styles.secondaryText}>
          These are general market estimates, not condition-adjusted values or storefront offers.
        </p>
      </Section>

      <Section
        title="Advisory validation"
        description="Editing remains available when the baseline result is invalid."
      >
        <div className={styles.badgeRow}>
          <StatusBadge tone={validation.valid ? "success" : "danger"}>
            {validation.valid ? "Baseline checks pass" : "Baseline checks found errors"}
          </StatusBadge>
          <StatusBadge tone={validation.summary.errorCount ? "danger" : "success"}>
            {validation.summary.errorCount} errors
          </StatusBadge>
          <StatusBadge tone={validation.summary.warningCount ? "warning" : "success"}>
            {validation.summary.warningCount} warnings
          </StatusBadge>
          <Badge>{validation.summary.informationCount} information</Badge>
          {validation.summary.unknownLegalityCount > 0 ? (
            <StatusBadge tone="warning">
              {validation.summary.unknownLegalityCount} unknown-legality{" "}
              {validation.summary.unknownLegalityCount === 1 ? "finding" : "findings"}
            </StatusBadge>
          ) : null}
          <Badge>Advisory, not exhaustive</Badge>
        </div>
        {validation.summary.issuesTruncated ? (
          <InlineAlert title="Validation issue details are truncated" tone="warning">
            Complete summary totals cover {validation.summary.issueDetailTotal} issues. This
            response returned {validation.summary.issueDetailReturned} detail rows, including the
            truncation marker; omitted issues can include additional unknown-legality findings.
          </InlineAlert>
        ) : null}
        {validation.summary.unknownLegalityCount > 0 ? (
          <InlineAlert title="Legality data is incomplete" tone="warning">
            The complete validation aggregate includes {validation.summary.unknownLegalityCount}{" "}
            unknown-legality{" "}
            {validation.summary.unknownLegalityCount === 1 ? "finding" : "findings"}. Unknown
            legality is never treated as legal.
          </InlineAlert>
        ) : null}
        <dl className={styles.validationEvidence}>
          <div>
            <dt>Format</dt>
            <dd>{validation.formatName}</dd>
          </div>
          <div>
            <dt>Rules version</dt>
            <dd>{validation.rulesVersion}</dd>
          </div>
          <div>
            <dt>Catalog version</dt>
            <dd>{validation.catalogVersion}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd className={styles.breakAll}>{validation.contentHash}</dd>
          </div>
          <div>
            <dt>Validation run</dt>
            <dd className={styles.breakAll}>{validation.validationRunId}</dd>
          </div>
          <div>
            <dt>Evaluated</dt>
            <dd>{formatInstant(validation.evaluatedAt)} UTC</dd>
          </div>
          <div>
            <dt>Issue details</dt>
            <dd>
              {validation.summary.issueDetailReturned} returned /{" "}
              {validation.summary.issueDetailTotal} total
            </dd>
          </div>
        </dl>
        {format.code === "commander" ? (
          <InlineAlert title="Commander baseline scope">
            Mainboard plus commander must total exactly {format.minimumDeckSize}; one or two
            commanders are supported, while partner/background eligibility and pairing remain
            advisory. Companion is outside that 100-card total.
          </InlineAlert>
        ) : format.companionConsumesSideboard ? (
          <p className={styles.secondaryText}>
            Companion consumes one slot of this format&apos;s sideboard capacity.
          </p>
        ) : null}
        {validation.issues.length ? (
          <ul className={styles.issueList}>
            {validation.issues.map((issue, index) => (
              <li key={`${issue.code}:${issue.cardId ?? "deck"}:${issue.zone ?? "all"}:${index}`}>
                <StatusBadge tone={severityTone(issue.severity)}>{issue.severity}</StatusBadge>
                <div>
                  <strong>{issue.code}</strong>
                  <p>{issue.message}</p>
                  {issueDetails(issue)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No deterministic baseline issues were reported.</p>
        )}
      </Section>

      <Section
        title="Zone totals"
        description="Maybeboard remains visible but does not count toward required or missing totals."
      >
        <DataTable label="Deck zone totals">
          <table>
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">Quantity</th>
                <th scope="col">Ownership effect</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(validation.zoneQuantities).map(([zone, quantity]) => (
                <tr key={zone}>
                  <th scope="row">{zone.replaceAll("_", " ")}</th>
                  <td>{quantity}</td>
                  <td>{zone === "maybeboard" ? "Excluded" : "Required"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </Section>
    </div>
  );
}
