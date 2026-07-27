import { DeviceApiError } from "./api-response";
import type { DeviceRpcClient } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ERROR_MAPPINGS: Array<{
  tokens: string[];
  status: number;
  code: string;
  message: string;
}> = [
  {
    tokens: ["idempotency_conflict"],
    status: 409,
    code: "idempotency_conflict",
    message: "This idempotency key was already used for a different request.",
  },
  {
    tokens: ["request_in_progress"],
    status: 409,
    code: "request_in_progress",
    message: "An identical request is still being processed.",
  },
  {
    tokens: ["device_run_conflict"],
    status: 409,
    code: "run_conflict",
    message: "This external run ID was already used for different run data.",
  },
  {
    tokens: ["catalog_printing_unknown"],
    status: 409,
    code: "catalog_printing_unknown",
    message: "The batch references a printing that is not in the active catalog.",
  },
  {
    tokens: ["snapshot_incompatible"],
    status: 409,
    code: "snapshot_incompatible",
    message: "No catalog snapshot is compatible with this client.",
  },
  {
    tokens: ["catalog_snapshot_unknown"],
    status: 409,
    code: "catalog_snapshot_unknown",
    message: "The referenced catalog snapshot is not available.",
  },
  {
    tokens: ["inventory_negative", "quantity_negative", "insufficient_inventory"],
    status: 409,
    code: "inventory_negative",
    message: "The batch would make an inventory quantity negative.",
  },
  {
    tokens: ["inventory_finish_unsupported"],
    status: 409,
    code: "inventory_finish_unsupported",
    message: "The requested finish is not supported by a referenced printing.",
  },
  {
    tokens: ["collection_grant_denied", "grant_denied"],
    status: 403,
    code: "collection_grant_denied",
    message: "This device is not granted the required collection permission.",
  },
  {
    tokens: ["device_suspended"],
    status: 403,
    code: "device_suspended",
    message: "This device is suspended.",
  },
  {
    tokens: [
      "device_revoked",
      "device_auth_invalid",
      "device_credential_invalid",
      "credential_revoked",
    ],
    status: 401,
    code: "device_credential_invalid",
    message: "The device credential is missing or invalid.",
  },
  {
    tokens: ["quota_exceeded", "rate_limited"],
    status: 429,
    code: "rate_limited",
    message: "The device request quota has been reached. Retry later.",
  },
  {
    tokens: ["feature_disabled", "maintenance"],
    status: 503,
    code: "feature_disabled",
    message: "This device feature is temporarily disabled.",
  },
  {
    tokens: ["device_request_too_large"],
    status: 413,
    code: "payload_too_large",
    message: "The request exceeds the configured device limit.",
  },
  {
    tokens: [
      "device_request_invalid",
      "device_heartbeat_invalid",
      "catalog_manifest_request_invalid",
      "device_inventory_page_invalid",
      "device_inventory_cursor_invalid",
      "device_inventory_batch_invalid",
      "device_inventory_lines_invalid",
      "device_inventory_line_invalid",
      "device_inventory_line_id_duplicate",
      "device_inventory_aggregate_delta_invalid",
      "device_run_summary_invalid",
    ],
    status: 400,
    code: "request_validation_failed",
    message: "The device request is invalid.",
  },
  {
    tokens: ["snapshot_unavailable", "not_found"],
    status: 404,
    code: "resource_not_found",
    message: "The requested resource is not available.",
  },
];

function detailRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string" && value.length <= 8_192) {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeRpcDetails(error: { details?: unknown; hint?: unknown }): Record<string, unknown> {
  const sources = [detailRecord(error.details), detailRecord(error.hint)].filter(
    (value): value is Record<string, unknown> => Boolean(value),
  );
  const safe: Record<string, unknown> = {};
  for (const source of sources) {
    const rawIdGroups = [
      source.unknown_printing_ids ?? source.printing_ids,
      source.inactive_printing_ids,
    ];
    const rawIds = rawIdGroups.flatMap((value) =>
      Array.isArray(value) && value.length <= 50 ? value : [],
    );
    if (rawIds.length > 0 && rawIds.length <= 50) {
      const ids = rawIds.filter(
        (value): value is string => typeof value === "string" && UUID_PATTERN.test(value),
      );
      if (ids.length === rawIds.length) {
        safe.unknown_printing_ids = [...new Set(ids.map((id) => id.toLowerCase()))];
      }
    }
    const unknownCount = source.unknown_count;
    const inactiveCount = source.inactive_count;
    if (
      typeof unknownCount === "number" &&
      Number.isSafeInteger(unknownCount) &&
      unknownCount >= 0 &&
      typeof inactiveCount === "number" &&
      Number.isSafeInteger(inactiveCount) &&
      inactiveCount >= 0 &&
      unknownCount + inactiveCount <= 10_000
    ) {
      safe.unknown_printing_count = unknownCount + inactiveCount;
    }
    const version =
      source.latest_compatible_snapshot_version ??
      source.latest_snapshot_version ??
      source.latest_version;
    if (
      typeof version === "string" &&
      version.length >= 1 &&
      version.length <= 160 &&
      !/[\u0000-\u001f]/.test(version)
    ) {
      safe.latest_compatible_snapshot_version = version;
    }
    const schemas = source.supported_schema_versions;
    if (
      Array.isArray(schemas) &&
      schemas.length <= 16 &&
      schemas.every(
        (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 1,
      )
    ) {
      safe.supported_schema_versions = [...new Set(schemas)];
    }
  }
  return safe;
}

function mapRpcError(
  error: { code?: string; message?: string; details?: unknown; hint?: unknown } | null,
): DeviceApiError {
  const source = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.tokens.some((token) => source.includes(token))) {
      const headers = mapping.status === 429 ? { "retry-after": "60" } : undefined;
      const details =
        error &&
        (mapping.code === "catalog_printing_unknown" ||
          mapping.code === "snapshot_incompatible" ||
          mapping.code === "catalog_snapshot_unknown")
          ? safeRpcDetails(error)
          : {};
      return new DeviceApiError(mapping.status, mapping.code, mapping.message, details, headers);
    }
  }
  return new DeviceApiError(
    503,
    "device_operation_unavailable",
    "The device operation is temporarily unavailable. Nothing changed.",
  );
}

export async function callDeviceRpc(
  client: DeviceRpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let result: Awaited<ReturnType<DeviceRpcClient["rpc"]>>;
  try {
    result = await client.rpc(functionName, args);
  } catch {
    throw mapRpcError(null);
  }
  if (result.error) throw mapRpcError(result.error);
  return result.data;
}

export function invalidDeviceRpcResponse(): DeviceApiError {
  return new DeviceApiError(
    503,
    "device_operation_invalid_response",
    "The device operation returned an invalid response. Nothing changed.",
  );
}
