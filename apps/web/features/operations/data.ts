import "server-only";

import { randomUUID } from "node:crypto";

import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  ExternalUsageSummary,
  OperationalControl,
  OperationalControlKind,
  OperationalControls,
  OperationalControlsResult,
  SafeAuditEvent,
} from "./types";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function policyControl(value: unknown, kind: OperationalControlKind): OperationalControl | null {
  const row = record(value);
  const key = text(kind === "external" ? row?.service_key : row?.feature_key);
  const updatedAt = text(row?.updated_at);
  if (!row || !key || typeof row.enabled !== "boolean" || !updatedAt) return null;

  const limitNames =
    kind === "application"
      ? [
          ["Requests / minute", "per_minute_requests"],
          ["Requests / day", "per_day_requests"],
          ["Units / day", "per_day_units"],
          ["Units / request", "max_units_per_request"],
        ]
      : kind === "device"
        ? [
            ["Requests / minute", "per_minute_requests"],
            ["Requests / day", "per_day_requests"],
            ["Units / day", "per_day_units"],
            ["Maximum bytes", "max_request_bytes"],
            ["Maximum items", "max_items"],
          ]
        : [
            ["Global units / day", "global_daily_units"],
            ["User units / day", "per_user_daily_units"],
            ["Workspace units / day", "per_workspace_daily_units"],
            ["Device units / day", "per_device_daily_units"],
          ];

  return {
    enabled: row.enabled,
    key,
    kind,
    limits: limitNames.map(([label, field]) => ({
      label,
      value: row[field] === null ? null : integer(row[field]),
    })),
    updatedAt,
  };
}

function controls(value: unknown, kind: OperationalControlKind): OperationalControl[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item) => policyControl(item, kind));
  return parsed.every((item): item is OperationalControl => item !== null) ? parsed : null;
}

function usage(value: unknown): ExternalUsageSummary[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item): ExternalUsageSummary | null => {
    const row = record(item);
    const serviceKey = text(row?.service_key);
    const scopeKind = text(row?.scope_kind);
    const unitsConsumed = integer(row?.units_consumed);
    const requestCount = integer(row?.request_count);
    return row && serviceKey && scopeKind && unitsConsumed !== null && requestCount !== null
      ? { requestCount, scopeKind, serviceKey, unitsConsumed }
      : null;
  });
  return parsed.every((item): item is ExternalUsageSummary => item !== null) ? parsed : null;
}

function auditEvents(value: unknown): SafeAuditEvent[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item): SafeAuditEvent | null => {
    const row = record(item);
    const id = text(row?.id);
    const eventType = text(row?.event_type);
    const resultCode = text(row?.result_code);
    const correlationId = text(row?.correlation_id);
    const occurredAt = text(row?.occurred_at);
    return row && id && eventType && resultCode && correlationId && occurredAt
      ? { correlationId, eventType, id, occurredAt, resultCode }
      : null;
  });
  return parsed.every((item): item is SafeAuditEvent => item !== null) ? parsed : null;
}

export function parseOperationalControls(value: unknown): OperationalControls | null {
  const source = record(value);
  if (!source) return null;
  const application = controls(source.application_features, "application");
  const device = controls(source.device_features, "device");
  const external = controls(source.external_services, "external");
  const usageToday = usage(source.external_usage_today);
  const recentAuditEvents = auditEvents(source.recent_audit_events);
  return application && device && external && usageToday && recentAuditEvents
    ? { application, device, external, recentAuditEvents, usageToday }
    : null;
}

export async function loadOperationalControls(): Promise<OperationalControlsResult> {
  const requestId = randomUUID();
  try {
    const client = await createServerSupabaseClient();
    if (!client) return { ok: false, requestId };
    const result = await client.rpc(DATABASE_FUNCTIONS.adminOperationalControls);
    if (result.error) {
      writeSecurityLog("warn", "operations.controls.read_failed", {
        code: result.error.code ?? "rpc_error",
        request_id: requestId,
      });
      return { ok: false, requestId };
    }
    const parsed = parseOperationalControls(result.data);
    if (!parsed) {
      writeSecurityLog("warn", "operations.controls.read_failed", {
        code: "invalid_response",
        request_id: requestId,
      });
      return { ok: false, requestId };
    }
    return { ok: true, data: parsed };
  } catch {
    writeSecurityLog("warn", "operations.controls.read_failed", {
      code: "rpc_unavailable",
      request_id: requestId,
    });
    return { ok: false, requestId };
  }
}
