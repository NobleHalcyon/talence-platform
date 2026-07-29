import {
  ContractValidationError,
  parseDeviceInventoryBatch,
  parseDeviceRunSummary,
} from "@talence/contracts";

import { DeviceApiError } from "./api-response";
import type { HeartbeatRequest, InventoryBatchRequest, RunSummaryRequest } from "./types";

const HEARTBEAT_KEYS = new Set([
  "schema_version",
  "client_version",
  "firmware_version",
  "catalog_snapshot_version",
  "health",
]);
const PROHIBITED_EXECUTION_KEYS = new Set([
  "bin_occupancy",
  "bin_occupancies",
  "bin_state",
  "bin_states",
  "camera",
  "camera_frame",
  "camera_frames",
  "camera_state",
  "coordinates",
  "execution_checkpoint",
  "execution_state",
  "execution_states",
  "motor_command",
  "motor_commands",
  "motor_state",
  "motor_states",
  "move_plan",
  "movement_plan",
  "moves",
  "remote_start",
  "restart_checkpoint",
  "restart_state",
  "sensor_reading",
  "sensor_readings",
  "sensor_telemetry",
  "start_motion",
  "trajectory",
  "trajectories",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function prohibitedKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    PROHIBITED_EXECUTION_KEYS.has(normalized) ||
    /(^|_)(motion|checkpoint|trajectory)($|_)/.test(normalized) ||
    /(^|_)(camera|motor|sensor)(_|$)/.test(normalized) ||
    /(^|_)(bin|restart|execution)_(state|states|occupancy|occupancies|checkpoint)($|_)/.test(
      normalized,
    )
  );
}

export function findProhibitedDeviceStateKey(value: unknown): string | null {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length > 0 && visited < 4_000) {
    const item = pending.pop();
    visited += 1;
    if (Array.isArray(item)) {
      pending.push(...item);
      continue;
    }
    const object = record(item);
    if (!object) continue;
    for (const [key, nested] of Object.entries(object)) {
      if (prohibitedKey(key)) return key;
      if (nested && typeof nested === "object") pending.push(nested);
    }
  }
  return null;
}

function rejectProhibitedState(value: unknown): void {
  const key = findProhibitedDeviceStateKey(value);
  if (key) {
    throw new DeviceApiError(
      400,
      "robot_execution_state_prohibited",
      "Motion plans and execution checkpoints are not accepted by the cloud API.",
      { field: key.slice(0, 80) },
    );
  }
}

function boundedScalarRecord(
  value: unknown,
): Record<string, string | number | boolean | null> | null {
  const object = record(value);
  if (!object || Object.keys(object).length > 20) return null;
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(object)) {
    if (
      key.length < 1 ||
      key.length > 64 ||
      /[\u0000-\u001f]/.test(key) ||
      !(
        item === null ||
        typeof item === "string" ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item))
      ) ||
      (typeof item === "string" && item.length > 500)
    ) {
      return null;
    }
    result[key] = item;
  }
  return result;
}

function contractFailure(error: unknown): never {
  if (error instanceof ContractValidationError) {
    throw new DeviceApiError(400, "request_validation_failed", "The request body is invalid.", {
      fields: error.issues.slice(0, 20).map((issue) => issue.instancePath || "/"),
      issues_truncated: error.issues.length > 20,
    });
  }
  throw error;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function normalizedBoundedText(value: string, maximum: number, field: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\u0000-\u001f]/.test(normalized)) {
    throw new DeviceApiError(400, "request_validation_failed", `${field} is invalid.`);
  }
  return normalized;
}

function rejectFarFuture(value: string, field: string, now: Date): void {
  if (Date.parse(value) > now.getTime() + 5 * 60 * 1_000) {
    throw new DeviceApiError(400, `${field}_invalid`, `${field} is too far in the future.`);
  }
}

export function parseHeartbeatRequest(value: unknown): HeartbeatRequest {
  rejectProhibitedState(value);
  const body = record(value);
  if (!body || Object.keys(body).some((key) => !HEARTBEAT_KEYS.has(key))) {
    throw new DeviceApiError(400, "request_validation_failed", "The heartbeat body is invalid.");
  }
  const clientVersion = body.client_version;
  const firmwareVersion = body.firmware_version;
  const catalogVersion = body.catalog_snapshot_version;
  const health = body.health === undefined ? undefined : boundedScalarRecord(body.health);
  if (
    body.schema_version !== 1 ||
    typeof clientVersion !== "string" ||
    !(
      firmwareVersion === undefined ||
      firmwareVersion === null ||
      (typeof firmwareVersion === "string" && firmwareVersion.length <= 80)
    ) ||
    !(
      catalogVersion === null ||
      (typeof catalogVersion === "string" && catalogVersion.length <= 160)
    ) ||
    (body.health !== undefined && !health)
  ) {
    throw new DeviceApiError(400, "request_validation_failed", "The heartbeat body is invalid.");
  }
  const normalizedClientVersion = normalizedBoundedText(clientVersion, 80, "client_version");
  const normalizedFirmwareVersion =
    typeof firmwareVersion === "string"
      ? firmwareVersion.trim()
        ? normalizedBoundedText(firmwareVersion, 80, "firmware_version")
        : null
      : firmwareVersion;
  const normalizedCatalogVersion =
    typeof catalogVersion === "string"
      ? catalogVersion.trim()
        ? normalizedBoundedText(catalogVersion, 160, "catalog_snapshot_version")
        : null
      : null;
  return {
    schema_version: 1,
    client_version: normalizedClientVersion,
    ...(firmwareVersion !== undefined ? { firmware_version: normalizedFirmwareVersion } : {}),
    catalog_snapshot_version: normalizedCatalogVersion,
    ...(health ? { health } : {}),
  };
}

export function parseInventoryBatchRequest(
  value: unknown,
  now = new Date(),
): InventoryBatchRequest {
  rejectProhibitedState(value);
  let parsed: InventoryBatchRequest;
  try {
    parsed = parseDeviceInventoryBatch(value);
  } catch (error) {
    contractFailure(error);
  }
  if (parsed.metadata !== undefined && !boundedScalarRecord(parsed.metadata)) {
    throw new DeviceApiError(
      400,
      "request_validation_failed",
      "Inventory metadata is outside the bounded scalar contract.",
    );
  }
  const catalogSnapshotVersion = normalizedBoundedText(
    parsed.catalog_snapshot_version,
    160,
    "catalog_snapshot_version",
  );
  const externalRunId =
    typeof parsed.external_run_id === "string"
      ? parsed.external_run_id.trim()
        ? normalizedBoundedText(parsed.external_run_id, 128, "external_run_id")
        : null
      : parsed.external_run_id;
  const lineIds = new Set<string>();
  const lines = parsed.lines.map((line) => {
    const lineId = normalizedBoundedText(line.line_id, 128, "line_id");
    if (lineIds.has(lineId)) {
      throw new DeviceApiError(
        400,
        "request_validation_failed",
        "line_id must be unique after normalization.",
      );
    }
    lineIds.add(lineId);
    return {
      ...line,
      line_id: lineId,
      printing_id: line.printing_id.toLowerCase(),
    };
  });
  rejectFarFuture(parsed.occurred_at, "occurred_at", now);
  return {
    ...parsed,
    catalog_snapshot_version: catalogSnapshotVersion,
    ...(parsed.external_run_id !== undefined ? { external_run_id: externalRunId } : {}),
    lines,
  };
}

export function parseRunSummaryRequest(value: unknown, now = new Date()): RunSummaryRequest {
  rejectProhibitedState(value);
  let parsed: RunSummaryRequest;
  try {
    parsed = parseDeviceRunSummary(value);
  } catch (error) {
    contractFailure(error);
  }
  if (parsed.metadata !== undefined && !boundedScalarRecord(parsed.metadata)) {
    throw new DeviceApiError(
      400,
      "request_validation_failed",
      "Run metadata is outside the bounded scalar contract.",
    );
  }
  const externalRunId = normalizedBoundedText(parsed.external_run_id, 128, "external_run_id");
  const catalogSnapshotVersion = normalizedBoundedText(
    parsed.catalog_snapshot_version,
    160,
    "catalog_snapshot_version",
  );
  const diagnosticCode =
    typeof parsed.diagnostic_code === "string"
      ? parsed.diagnostic_code.trim()
        ? normalizedBoundedText(parsed.diagnostic_code, 128, "diagnostic_code")
        : null
      : parsed.diagnostic_code;
  if (!validTimestamp(parsed.started_at) || !validTimestamp(parsed.completed_at)) {
    throw new DeviceApiError(400, "request_validation_failed", "Run timestamps are invalid.");
  }
  if (Date.parse(parsed.completed_at) < Date.parse(parsed.started_at)) {
    throw new DeviceApiError(
      400,
      "run_time_order_invalid",
      "completed_at must not precede started_at.",
    );
  }
  rejectFarFuture(parsed.started_at, "started_at", now);
  rejectFarFuture(parsed.completed_at, "completed_at", now);
  const { total, recognized, unrecognized, posted } = parsed.counts;
  if (recognized + unrecognized !== total || posted > recognized || posted > total) {
    throw new DeviceApiError(400, "run_counts_invalid", "Run counts are internally inconsistent.");
  }
  return {
    ...parsed,
    external_run_id: externalRunId,
    collection_id: parsed.collection_id.toLowerCase(),
    catalog_snapshot_version: catalogSnapshotVersion,
    ...(parsed.diagnostic_code !== undefined ? { diagnostic_code: diagnosticCode } : {}),
  };
}
