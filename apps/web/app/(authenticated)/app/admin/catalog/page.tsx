import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  ErrorState,
  InlineAlert,
  Panel,
  StatusBadge,
  Tabs,
} from "@talence/ui";

import { CatalogFreshnessSummary } from "@/components/catalog/catalog-results";
import { PageFrame } from "@/components/shell/page-frame";
import { queueCatalogSyncAction } from "@/features/catalog/actions";
import { loadAdminCatalogStatus } from "@/features/catalog/data";
import type { CatalogImportSummary } from "@/features/catalog/types";
import { getAppContextState } from "@/lib/auth/app-context";

import styles from "./admin-catalog.module.css";

export const metadata = {
  title: "Catalog administration",
};

interface AdminCatalogPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatInstant(value: string | null): string {
  if (!value) {
    return "Not yet";
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(instant);
}

function importTone(status: string): "danger" | "information" | "neutral" | "success" | "warning" {
  if (status === "succeeded" || status === "skipped") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "running") return "information";
  if (status === "queued") return "warning";
  return "neutral";
}

function StatusNotice({ status, requestId }: { status: string; requestId: string }) {
  if (!status) {
    return null;
  }
  if (status === "sync_queued") {
    return (
      <InlineAlert title="Catalog sync queued" tone="success">
        A worker may claim the queued import. No bulk provider work ran in this web request.
      </InlineAlert>
    );
  }
  if (status === "sync_disabled") {
    return (
      <InlineAlert title="Catalog sync is disabled" tone="warning">
        The server-side kill switch is closed. No job was queued.
      </InlineAlert>
    );
  }
  return (
    <InlineAlert title="Catalog sync was not queued" tone="danger">
      No import ran and no catalog state changed. Retry after checking trusted configuration.
      Request ID: {requestId || "unavailable"}
    </InlineAlert>
  );
}

function ImportTable({ imports, label }: { imports: CatalogImportSummary[]; label: string }) {
  return (
    <DataTable className={styles.importTable} label={label}>
      <table>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Status</th>
            <th scope="col">Trigger</th>
            <th scope="col">Started</th>
            <th scope="col">Completed</th>
            <th scope="col">Seen / written / rejected</th>
            <th scope="col">Safe failure</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((item) => (
            <tr key={item.id}>
              <td data-label="Run">
                <code>{item.id.slice(0, 8)}</code>
              </td>
              <td data-label="Status">
                <StatusBadge tone={importTone(item.status)}>{item.status}</StatusBadge>
              </td>
              <td data-label="Trigger">{item.triggerType}</td>
              <td data-label="Started">{formatInstant(item.startedAt)} UTC</td>
              <td data-label="Completed">{formatInstant(item.completedAt)} UTC</td>
              <td data-label="Counts">
                {item.recordsSeen ?? "—"} / {item.recordsWritten ?? "—"} /{" "}
                {item.recordsRejected ?? "—"}
              </td>
              <td data-label="Safe failure">
                {item.errorCode ?? "None"}
                {item.errorSummary ? (
                  <span className={styles.errorSummary}>{item.errorSummary}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export default async function AdminCatalogPage({
  searchParams = Promise.resolve({}),
}: AdminCatalogPageProps) {
  const [query, contextState] = await Promise.all([searchParams, getAppContextState()]);
  if (contextState.status !== "ready" || !contextState.context.isPlatformAdmin) {
    notFound();
  }

  const result = await loadAdminCatalogStatus(contextState.context.userId);
  const status = first(query.status);
  const requestId = first(query.request_id);

  return (
    <PageFrame
      eyebrow="Platform administration"
      title="Catalog operations"
      description="Inspect the active catalog, sources, imports, failures, and worker queue without running bulk ingestion in a request."
    >
      <Tabs
        label="Administration"
        items={[
          { href: "/app/admin/invites", label: "Invitations" },
          { href: "/app/admin/catalog", label: "Catalog", active: true },
          { href: "/app/admin/operations", label: "Operations" },
        ]}
      />
      <StatusNotice status={status} requestId={requestId} />

      {!result.ok ? (
        <ErrorState
          title="Catalog operations status is unavailable"
          message={`No catalog state changed. Verify the trusted server key and database migration, then retry. Request ID: ${result.requestId}`}
        />
      ) : (
        <>
          <CatalogFreshnessSummary freshness={result.data.catalog} />
          <div className={styles.countGrid}>
            {Object.entries(result.data.counts).map(([name, value]) => (
              <Panel className={styles.countPanel} key={name}>
                <span>{name}</span>
                <strong>{value?.toLocaleString("en-US") ?? "Unavailable"}</strong>
              </Panel>
            ))}
          </div>

          <div className={styles.operationGrid}>
            <Panel className={styles.sourcePanel}>
              <header>
                <h2>Latest source file</h2>
                <Badge tone="information">
                  {result.data.source?.provider ?? "Provider unavailable"}
                </Badge>
              </header>
              <dl>
                <div>
                  <dt>Source type</dt>
                  <dd>{result.data.source?.sourceType ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Provider updated</dt>
                  <dd>{formatInstant(result.data.source?.providerUpdatedAt ?? null)} UTC</dd>
                </div>
                <div>
                  <dt>Downloaded</dt>
                  <dd>{formatInstant(result.data.source?.downloadedAt ?? null)} UTC</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{result.data.source?.status ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd>
                    <code>
                      {result.data.source?.sha256
                        ? `${result.data.source.sha256.slice(0, 16)}…`
                        : "Unavailable"}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Robot snapshot</dt>
                  <dd>{result.data.snapshotVersion ?? "Not published in Phase 2"}</dd>
                </div>
              </dl>
            </Panel>

            <Panel className={styles.queuePanel}>
              <header>
                <h2>Manual sync</h2>
                <StatusBadge tone={result.data.syncEnabled ? "success" : "warning"}>
                  {result.data.syncEnabled ? "Queue enabled" : "Kill switch closed"}
                </StatusBadge>
              </header>
              <p>
                This action creates or replays a queued import record. A separately scheduled worker
                performs discovery, download, validation, and promotion.
              </p>
              {!result.data.syncEnabled ? (
                <InlineAlert title="Manual sync unavailable" tone="warning">
                  Set the server-only catalog sync switch only after worker credentials and
                  operational review are complete.
                </InlineAlert>
              ) : null}
              <form className={styles.queueForm} action={queueCatalogSyncAction}>
                <Checkbox
                  name="force"
                  label="Force a new run even when provider metadata is unchanged"
                  disabled={!result.data.syncEnabled}
                />
                <Button type="submit" disabled={!result.data.syncEnabled}>
                  Queue catalog sync
                </Button>
              </form>
            </Panel>
          </div>

          <section className={styles.importSection} aria-labelledby="queued-imports-title">
            <header>
              <h2 id="queued-imports-title">Queued imports</h2>
              <p>Pending work visible to the catalog worker.</p>
            </header>
            {result.data.queuedImports.length ? (
              <ImportTable imports={result.data.queuedImports} label="Queued catalog imports" />
            ) : (
              <Panel className={styles.emptyImport}>No catalog import is currently queued.</Panel>
            )}
          </section>

          <section className={styles.importSection} aria-labelledby="recent-imports-title">
            <header>
              <h2 id="recent-imports-title">Latest imports</h2>
              <p>Recent terminal and active outcomes, including bounded safe failures.</p>
            </header>
            {result.data.latestImports.length ? (
              <ImportTable imports={result.data.latestImports} label="Latest catalog imports" />
            ) : (
              <Panel className={styles.emptyImport}>No catalog import run is recorded yet.</Panel>
            )}
          </section>
        </>
      )}
    </PageFrame>
  );
}
