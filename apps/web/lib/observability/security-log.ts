import "server-only";

type SafeLogLevel = "error" | "info" | "warn";

const EVENT_PATTERN = /^[a-z][a-z0-9_.-]{2,99}$/;
const SAFE_FIELD_NAMES = new Set([
  "action",
  "code",
  "correlation_id",
  "device_id",
  "duration_ms",
  "invitation_id",
  "quota_category",
  "replayed",
  "request_id",
  "resource_id",
  "result_code",
  "route",
  "status",
  "user_id",
  "workspace_id",
]);

export type SafeLogFields = Record<string, boolean | number | string | null | undefined>;

function safeString(value: string): string | null {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function sanitizeLogFields(
  fields: SafeLogFields,
): Record<string, boolean | number | string> {
  const safe: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_FIELD_NAMES.has(key) || value === null || value === undefined) continue;
    if (typeof value === "string") {
      const normalized = safeString(value);
      if (normalized !== null) safe[key] = normalized;
      continue;
    }
    if (typeof value === "number") {
      if (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
        safe[key] = value;
      }
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function writeSecurityLog(
  level: SafeLogLevel,
  event: string,
  fields: SafeLogFields = {},
): void {
  const safeEvent = EVENT_PATTERN.test(event) ? event : "application.invalid_log_event";
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: safeEvent,
    ...sanitizeLogFields(fields),
  });
  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}
