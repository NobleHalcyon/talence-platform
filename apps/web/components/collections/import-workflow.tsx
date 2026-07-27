"use client";

import { useActionState } from "react";

import {
  Badge,
  Button,
  ButtonLink,
  DataTable,
  FormField,
  InlineAlert,
  Panel,
  Select,
  StatusBadge,
  TextInput,
} from "@talence/ui";

import {
  cancelInventoryImportAction,
  commitInventoryImportAction,
  resolveInventoryImportRowAction,
  stageInventoryImportAction,
} from "@/features/collections/import-actions";
import { INVENTORY_IMPORT_LIMITS, serializeImportErrorReport } from "@/features/collections/csv";
import { canManuallyResolveImportRow } from "@/features/collections/import-review";
import {
  INITIAL_IMPORT_ACTION_STATE,
  type ImportActionState,
} from "@/features/collections/import-state";
import type {
  InventoryImportPreview,
  InventoryImportPreviewRow,
} from "@/features/collections/types";

import { label } from "./collection-shared";
import styles from "./collections.module.css";

function RowResolutionForm({
  collectionId,
  jobId,
  afterRowNumber,
  row,
}: {
  collectionId: string;
  jobId: string;
  afterRowNumber: number;
  row: InventoryImportPreviewRow;
}) {
  if (canManuallyResolveImportRow(row)) {
    return (
      <form className={styles.rowResolution} action={resolveInventoryImportRowAction}>
        <input type="hidden" name="collectionId" value={collectionId} />
        <input type="hidden" name="importJobId" value={jobId} />
        <input type="hidden" name="rowNumber" value={row.rowNumber} />
        <input type="hidden" name="afterRowNumber" value={afterRowNumber} />
        <input type="hidden" name="resolution" value="match" />
        {row.candidates.length ? (
          <Select name="printingId" aria-label={`Resolve row ${row.rowNumber}`} required>
            <option value="">Choose exact printing</option>
            {row.candidates.map((candidate) => (
              <option key={candidate.printingId} value={candidate.printingId}>
                {candidate.name} · {candidate.setCode} #{candidate.collectorNumber} ·{" "}
                {candidate.language.toUpperCase()}
              </option>
            ))}
          </Select>
        ) : (
          <TextInput
            name="printingId"
            aria-label={`Exact printing ID for row ${row.rowNumber}`}
            placeholder="Exact active printing UUID"
            required
          />
        )}
        <Button type="submit" size="small">
          Use exact printing
        </Button>
      </form>
    );
  }

  return null;
}

function ExcludeResetForm({
  collectionId,
  jobId,
  afterRowNumber,
  row,
}: {
  collectionId: string;
  jobId: string;
  afterRowNumber: number;
  row: InventoryImportPreviewRow;
}) {
  const excluded = row.status === "excluded";
  return (
    <form action={resolveInventoryImportRowAction}>
      <input type="hidden" name="collectionId" value={collectionId} />
      <input type="hidden" name="importJobId" value={jobId} />
      <input type="hidden" name="rowNumber" value={row.rowNumber} />
      <input type="hidden" name="afterRowNumber" value={afterRowNumber} />
      <input type="hidden" name="resolution" value={excluded ? "reset" : "exclude"} />
      <Button type="submit" size="small" variant="quiet">
        {excluded ? "Reset row" : "Exclude row"}
      </Button>
    </form>
  );
}

function ImportPreviewTable({
  preview,
  canMutate,
}: {
  preview: InventoryImportPreview;
  canMutate: boolean;
}) {
  const reviewable =
    canMutate && preview.status === "running" && preview.stagingCompletedAt !== null;
  const cancellable = canMutate && (preview.status === "queued" || preview.status === "running");
  const report = serializeImportErrorReport(preview.rows);
  const reportHref = preview.storagePath
    ? `/app/collections/${preview.collectionId}/import/${preview.jobId}/errors`
    : `data:text/csv;charset=utf-8,${encodeURIComponent(report)}`;
  const pageHref = (afterRowNumber: number) => {
    const parameters = new URLSearchParams({ job: preview.jobId });
    if (afterRowNumber > 0) {
      parameters.set("after_row", String(afterRowNumber));
    }
    return `/app/collections/${preview.collectionId}/import?${parameters}`;
  };
  return (
    <div className={styles.importPreview}>
      <div className={styles.importCounts} aria-label="Import preview counts">
        <Panel>
          <span>Total</span>
          <strong>{preview.counts.total}</strong>
        </Panel>
        <Panel>
          <span>Matched</span>
          <strong>{preview.counts.matched}</strong>
        </Panel>
        <Panel>
          <span>Ambiguous</span>
          <strong>{preview.counts.ambiguous}</strong>
        </Panel>
        <Panel>
          <span>Rejected</span>
          <strong>{preview.counts.rejected}</strong>
        </Panel>
        <Panel>
          <span>Excluded</span>
          <strong>{preview.counts.excluded}</strong>
        </Panel>
      </div>
      {preview.counts.ambiguous ? (
        <InlineAlert title="Ambiguity blocks confirmation" tone="warning">
          Match every ambiguous row to one exact active printing, or explicitly exclude it.
        </InlineAlert>
      ) : null}
      {preview.status === "succeeded" ? (
        <InlineAlert title="Import already committed" tone="information">
          This staged job is terminal. Its inventory transaction can be reviewed in collection
          history.
        </InlineAlert>
      ) : preview.status === "failed" || preview.status === "cancelled" ? (
        <InlineAlert title={`Import ${preview.status}`} tone="warning">
          This staged job is terminal and cannot be edited or committed.
        </InlineAlert>
      ) : !reviewable ? (
        <InlineAlert title="Import is read-only" tone="information">
          Restore the collection or use an editor role to resolve and commit staged rows.
        </InlineAlert>
      ) : null}
      <div className={styles.importPreviewHeader}>
        <div>
          <h2>Staged preview</h2>
          <p>
            {preview.originalFilename} · parser {preview.parserVersion}
          </p>
        </div>
        {preview.counts.rejected || preview.counts.ambiguous ? (
          <a
            className={styles.downloadLink}
            href={reportHref}
            download={`talence-import-${preview.jobId}-errors.csv`}
          >
            Download safe error report
          </a>
        ) : null}
      </div>
      <DataTable label="Staged import rows">
        <table className={styles.importTable}>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Status</th>
              <th scope="col">Source identity</th>
              <th scope="col">Resolved printing</th>
              <th scope="col">Inventory</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.rowNumber}>
                <td data-label="Row">{row.rowNumber}</td>
                <td data-label="Status">
                  <StatusBadge
                    tone={
                      row.status === "matched"
                        ? "success"
                        : row.status === "ambiguous"
                          ? "warning"
                          : row.status === "rejected"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {label(row.status)}
                  </StatusBadge>
                </td>
                <td data-label="Source identity">
                  {row.scryfallId ? (
                    <>
                      <Badge>Scryfall ID</Badge>
                      <code>{row.scryfallId}</code>
                    </>
                  ) : (
                    <>
                      <Badge>Set tuple</Badge>
                      <span>
                        {row.setCode ?? "—"} #{row.collectorNumber ?? "—"} ·{" "}
                        {row.language?.toUpperCase() ?? "—"}
                      </span>
                    </>
                  )}
                  {row.name ? <span className={styles.secondaryText}>{row.name}</span> : null}
                </td>
                <td data-label="Resolved printing">
                  {row.proposedPrinting ? (
                    <>
                      <strong>{row.proposedPrinting.name}</strong>
                      <span className={styles.secondaryText}>
                        {row.proposedPrinting.setCode} #{row.proposedPrinting.collectorNumber} ·{" "}
                        {row.proposedPrinting.language.toUpperCase()}
                      </span>
                    </>
                  ) : (
                    <span>{row.errorMessage ?? row.suggestion ?? "Review required"}</span>
                  )}
                </td>
                <td data-label="Inventory">
                  {row.quantity ?? "—"} · {row.finish ? label(row.finish) : "Invalid finish"} ·{" "}
                  {row.condition ? label(row.condition) : "Invalid condition"}
                </td>
                <td data-label="Review">
                  {reviewable ? (
                    <>
                      <RowResolutionForm
                        collectionId={preview.collectionId}
                        jobId={preview.jobId}
                        afterRowNumber={preview.afterRowNumber}
                        row={row}
                      />
                      <ExcludeResetForm
                        collectionId={preview.collectionId}
                        jobId={preview.jobId}
                        afterRowNumber={preview.afterRowNumber}
                        row={row}
                      />
                    </>
                  ) : (
                    <span>Read only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
      {preview.afterRowNumber > 0 || preview.hasMore ? (
        <nav className={styles.pagination} aria-label="Import preview pages">
          {preview.previousAfterRowNumber !== null ? (
            <ButtonLink
              href={pageHref(preview.previousAfterRowNumber)}
              variant="secondary"
              size="small"
            >
              Previous rows
            </ButtonLink>
          ) : null}
          <span>Rows after {preview.afterRowNumber.toLocaleString("en-US")}</span>
          {preview.hasMore && preview.nextAfterRowNumber !== null ? (
            <ButtonLink
              href={pageHref(preview.nextAfterRowNumber)}
              variant="secondary"
              size="small"
            >
              Next rows
            </ButtonLink>
          ) : null}
        </nav>
      ) : null}
      {reviewable || cancellable ? (
        <div className={styles.importCommit}>
          {reviewable ? (
            <form className={styles.commitForm} action={commitInventoryImportAction}>
              <input type="hidden" name="collectionId" value={preview.collectionId} />
              <input type="hidden" name="importJobId" value={preview.jobId} />
              <input type="hidden" name="occurredAt" value={preview.createdAt} />
              <FormField
                inputId="import-note"
                label="Transaction note"
                hint="Optional note on the one resulting inventory transaction."
              >
                <TextInput name="note" maxLength={1_000} />
              </FormField>
              <Button type="submit" disabled={!preview.canCommit}>
                Confirm one transaction
              </Button>
            </form>
          ) : null}
          {cancellable ? (
            <form action={cancelInventoryImportAction}>
              <input type="hidden" name="collectionId" value={preview.collectionId} />
              <input type="hidden" name="importJobId" value={preview.jobId} />
              <Button type="submit" variant="secondary">
                Cancel staged job
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImportWorkflow({
  collectionId,
  uploadAttemptId,
  canMutate,
  initialPreview = null,
}: {
  collectionId: string;
  uploadAttemptId: string;
  canMutate: boolean;
  initialPreview?: InventoryImportPreview | null;
}) {
  const initialState: ImportActionState = initialPreview
    ? {
        status: "preview",
        message: "Review the existing staged job before confirming.",
        requestId: null,
        preview: initialPreview,
        uploadAttemptId,
      }
    : { ...INITIAL_IMPORT_ACTION_STATE, uploadAttemptId };
  const [state, action, pending] = useActionState(stageInventoryImportAction, initialState);

  return (
    <div className={styles.sectionStack}>
      {canMutate ? (
        <Panel>
          <form className={styles.importForm} action={action}>
            <input type="hidden" name="collectionId" value={collectionId} />
            <input
              type="hidden"
              name="uploadAttemptId"
              value={state.uploadAttemptId ?? uploadAttemptId}
            />
            <FormField
              inputId="inventory-csv"
              label="Inventory CSV"
              hint={`UTF-8 CSV, maximum 2 MiB and ${INVENTORY_IMPORT_LIMITS.maximumRows.toLocaleString()} data rows. Required identity: Scryfall ID or set + collector number + language.`}
            >
              <input
                className={styles.fileInput}
                type="file"
                name="inventoryCsv"
                accept=".csv,text/csv,text/plain"
                required
              />
            </FormField>
            <Button type="submit" busy={pending}>
              Parse and stage preview
            </Button>
          </form>
        </Panel>
      ) : (
        <InlineAlert title="Inventory changes are unavailable" tone="information">
          Restore this collection and use an editor role before staging or changing an import.
        </InlineAlert>
      )}
      {state.message ? (
        <InlineAlert
          title={state.status === "error" ? "Import did not stage" : "Preview ready"}
          tone={state.status === "error" ? "danger" : "information"}
        >
          {state.message}
          {state.requestId ? ` Request ID: ${state.requestId}.` : ""}
        </InlineAlert>
      ) : null}
      {state.preview ? <ImportPreviewTable preview={state.preview} canMutate={canMutate} /> : null}
    </div>
  );
}
