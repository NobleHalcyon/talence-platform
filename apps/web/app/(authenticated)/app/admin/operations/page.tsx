import { notFound } from "next/navigation";

import {
  Button,
  DataTable,
  ErrorState,
  InlineAlert,
  Panel,
  Section,
  StatusBadge,
  Tabs,
} from "@talence/ui";

import { PageFrame } from "@/components/shell/page-frame";
import { toggleOperationalControlAction } from "@/features/operations/actions";
import { loadOperationalControls } from "@/features/operations/data";
import type { OperationalControl, OperationalControlKind } from "@/features/operations/types";
import { getAppContextState } from "@/lib/auth/app-context";
import { safeRequestId } from "@/lib/auth/safe-status";

import styles from "./operations.module.css";

export const metadata = {
  title: "Security and usage",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function label(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatInstant(value: string): string {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(instant);
}

function StatusNotice({ requestId, status }: { requestId: string | null; status: string }) {
  if (!status) return null;
  const suffix = requestId ? ` Request ID: ${requestId}.` : "";
  if (status === "control_enabled" || status === "control_disabled") {
    return (
      <InlineAlert title="Operational control updated" tone="success">
        The selected control now {status === "control_enabled" ? "allows" : "blocks"} new work.
        {suffix}
      </InlineAlert>
    );
  }
  if (status === "control_stale") {
    return (
      <InlineAlert title="Control changed elsewhere" tone="warning">
        Nothing changed. Reloaded values must be reviewed before retrying.{suffix}
      </InlineAlert>
    );
  }
  return (
    <InlineAlert title="Control was not changed" tone="danger">
      Nothing changed. Verify platform-administrator access and retry.{suffix}
    </InlineAlert>
  );
}

function ControlCard({ control }: { control: OperationalControl }) {
  const action = control.enabled ? "Disable" : "Enable";
  return (
    <Panel className={styles.control}>
      <header>
        <h3>{label(control.key)}</h3>
        <StatusBadge tone={control.enabled ? "success" : "danger"}>
          {control.enabled ? "Enabled" : "Disabled"}
        </StatusBadge>
      </header>
      <dl className={styles.limits}>
        {control.limits.map((limit) => (
          <div key={limit.label}>
            <dt>{limit.label}</dt>
            <dd>{limit.value === null ? "Not applied" : limit.value.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
      <form action={toggleOperationalControlAction}>
        <input type="hidden" name="kind" value={control.kind} />
        <input type="hidden" name="key" value={control.key} />
        <input type="hidden" name="enabled" value={String(!control.enabled)} />
        <input type="hidden" name="expectedUpdatedAt" value={control.updatedAt} />
        <Button type="submit" variant={control.enabled ? "danger" : "primary"}>
          {action} {label(control.key)}
        </Button>
      </form>
    </Panel>
  );
}

function ControlGroup({
  controls,
  description,
  kind,
  title,
}: {
  controls: OperationalControl[];
  description: string;
  kind: OperationalControlKind;
  title: string;
}) {
  return (
    <Section title={title} description={description}>
      <div className={styles.controls} data-control-kind={kind}>
        {controls.map((control) => (
          <ControlCard control={control} key={control.key} />
        ))}
      </div>
    </Section>
  );
}

export default async function AdminOperationsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, context] = await Promise.all([searchParams, getAppContextState()]);
  if (context.status !== "ready" || !context.context.isPlatformAdmin) notFound();
  const result = await loadOperationalControls();
  const status = first(query.status);
  const requestId = safeRequestId(query.request_id);

  return (
    <PageFrame
      eyebrow="Platform administration"
      title="Security and usage"
      description="Close risky routes immediately, inspect bounded quotas, and review sanitized control changes without exposing credentials or request bodies."
    >
      <Tabs
        label="Administration"
        items={[
          { href: "/app/admin/invites", label: "Invitations" },
          { href: "/app/admin/catalog", label: "Catalog" },
          { href: "/app/admin/operations", label: "Operations", active: true },
        ]}
      />
      <StatusNotice requestId={requestId} status={status} />
      {!result.ok ? (
        <ErrorState
          title="Operational controls are unavailable"
          message={`Nothing changed. Verify the Phase 6 migration and retry. Request ID: ${result.requestId}`}
        />
      ) : (
        <div className={styles.groups}>
          <ControlGroup
            kind="application"
            title="Application routes"
            description="Principal-scoped request and work-unit guards for selected high-cost database summaries."
            controls={result.data.application}
          />
          <ControlGroup
            kind="external"
            title="External services"
            description="Daily units are reserved atomically before any controlled provider call."
            controls={result.data.external}
          />
          <ControlGroup
            kind="device"
            title="Device API"
            description="Machine requests remain subject to database controls in addition to deployment-level switches."
            controls={result.data.device}
          />

          <Section
            title="External usage today"
            description="Safe UTC-day aggregate counters; identities and provider payloads are intentionally absent."
          >
            <div className={styles.usageGrid}>
              {result.data.usageToday.length > 0 ? (
                result.data.usageToday.map((usage) => (
                  <Panel key={`${usage.serviceKey}-${usage.scopeKind}`}>
                    <strong>{label(usage.serviceKey)}</strong>
                    <span>
                      {label(usage.scopeKind)}: {usage.unitsConsumed.toLocaleString("en-US")} units
                      across {usage.requestCount.toLocaleString("en-US")} requests
                    </span>
                  </Panel>
                ))
              ) : (
                <Panel>No external-service units have been reserved today.</Panel>
              )}
            </div>
          </Section>

          <Section
            title="Recent safe audit events"
            description="Only bounded event codes, resource references, and correlation IDs are retained."
          >
            <DataTable className={styles.auditTable} label="Recent safe audit events">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Result</th>
                    <th scope="col">Occurred</th>
                    <th scope="col">Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.recentAuditEvents.length > 0 ? (
                    result.data.recentAuditEvents.map((event) => (
                      <tr key={event.id}>
                        <td data-label="Event">{event.eventType}</td>
                        <td data-label="Result">{event.resultCode}</td>
                        <td data-label="Occurred">{formatInstant(event.occurredAt)} UTC</td>
                        <td data-label="Correlation">
                          <code>{event.correlationId}</code>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>No safe audit events recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DataTable>
          </Section>
        </div>
      )}
    </PageFrame>
  );
}
