import { Badge, ButtonLink, DataTable, EmptyState, Panel, StatusBadge } from "@talence/ui";

import type {
  InventoryHistoryPage,
  InventoryTransaction,
  InventoryTransactionLine,
} from "@/features/collections/types";

import { formatInstant, label } from "./collection-shared";
import { ReversalControl } from "./reversal-control";
import styles from "./collections.module.css";

function safeReference(value: string | null): string {
  if (!value) return "Not supplied";
  return value.length <= 12 ? value : `••••${value.slice(-8)}`;
}

function transactionTone(
  source: InventoryTransaction["source"],
): "neutral" | "information" | "success" | "warning" {
  if (source === "reversal") return "warning";
  if (source === "transfer") return "information";
  if (source === "csv_import" || source === "device") return "success";
  return "neutral";
}

export function InventoryTransactionLinesTable({
  label: tableLabel,
  lines,
}: {
  label: string;
  lines: InventoryTransactionLine[];
}) {
  return (
    <DataTable label={tableLabel}>
      <table className={styles.historyTable}>
        <thead>
          <tr>
            <th scope="col">Card</th>
            <th scope="col">Finish</th>
            <th scope="col">Condition</th>
            <th scope="col">Delta</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td data-label="Card">
                {line.name}
                <span className={styles.secondaryText}>
                  {line.setCode} #{line.collectorNumber} · {line.language.toUpperCase()}
                </span>
              </td>
              <td data-label="Finish">{label(line.finish)}</td>
              <td data-label="Condition">{label(line.condition)}</td>
              <td data-label="Delta">
                <strong className={line.quantityDelta > 0 ? styles.positive : styles.negative}>
                  {line.quantityDelta > 0 ? "+" : ""}
                  {line.quantityDelta}
                </strong>
              </td>
              <td data-label="Before">{line.quantityBefore}</td>
              <td data-label="After">{line.quantityAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export function CollectionHistoryView({
  history,
  occurredAt,
}: {
  history: InventoryHistoryPage;
  occurredAt: string;
}) {
  if (!history.transactions.length) {
    return (
      <EmptyState
        title="No inventory transactions"
        message="Adding an exact printing or committing an import creates the first immutable entry."
      />
    );
  }

  return (
    <div className={styles.historyList}>
      {history.transactions.map((transaction) => (
        <Panel className={styles.transactionCard} key={transaction.id}>
          <header className={styles.transactionHeader}>
            <div>
              <div className={styles.badgeRow}>
                <StatusBadge tone={transactionTone(transaction.source)}>
                  {label(transaction.source)}
                </StatusBadge>
                <Badge>{transaction.lineCount.toLocaleString("en-US")} lines</Badge>
                {transaction.linesTruncated ? (
                  <Badge tone="information">First 5 shown</Badge>
                ) : null}
                {transaction.transferGroupId ? (
                  <Badge tone="information">Paired transfer</Badge>
                ) : null}
                {transaction.reversesTransactionId ? (
                  <Badge tone="warning">Compensating reversal</Badge>
                ) : null}
              </div>
              <h2>{formatInstant(transaction.committedAt)} UTC</h2>
              <p>
                {transaction.actorLabel} · occurred {formatInstant(transaction.occurredAt)} UTC
              </p>
            </div>
            {transaction.reversible ? (
              <ReversalControl
                collectionId={history.collection.id}
                transaction={transaction}
                occurredAt={occurredAt}
                collectionStatus={history.collection.status}
              />
            ) : (
              <Badge>
                {transaction.source === "reversal" ? "Reversal is final" : "Already reversed"}
              </Badge>
            )}
          </header>
          {transaction.note ? <p className={styles.transactionNote}>{transaction.note}</p> : null}
          <dl className={styles.transactionMeta}>
            <div>
              <dt>Transaction</dt>
              <dd>{safeReference(transaction.id)}</dd>
            </div>
            <div>
              <dt>Idempotency</dt>
              <dd>{safeReference(transaction.idempotencyReference)}</dd>
            </div>
            <div>
              <dt>External reference</dt>
              <dd>{safeReference(transaction.externalReference)}</dd>
            </div>
            <div>
              <dt>Reverses</dt>
              <dd>{safeReference(transaction.reversesTransactionId)}</dd>
            </div>
            <div>
              <dt>Paired transaction</dt>
              <dd>{safeReference(transaction.pairedTransactionId)}</dd>
            </div>
          </dl>
          <InventoryTransactionLinesTable
            label={`Transaction ${safeReference(transaction.id)} line preview`}
            lines={transaction.lines}
          />
          {transaction.linesTruncated ? (
            <ButtonLink
              href={`/app/collections/${history.collection.id}/history/${transaction.id}`}
              variant="secondary"
              size="small"
            >
              View all {transaction.lineCount.toLocaleString("en-US")} lines
            </ButtonLink>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}
