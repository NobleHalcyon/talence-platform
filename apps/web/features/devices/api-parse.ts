import type { TalenceCatalogSnapshotManifest } from "@talence/contracts";

import {
  DEVICE_GRANT_PERMISSIONS,
  DEVICE_STATUSES,
  DEVICE_TYPES,
  type DeviceGrantPermission,
  type DeviceMeResponse,
  type HeartbeatRequest,
  type InventoryBatchResponse,
  type InventoryPageResponse,
  type RunSummaryResponse,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GRANTS = new Set<string>(DEVICE_GRANT_PERMISSIONS);
const STATUSES = new Set<string>(DEVICE_STATUSES);
const TYPES = new Set<string>(DEVICE_TYPES);
const FINISHES = new Set(["unknown", "nonfoil", "foil", "etched"]);
const CONDITIONS = new Set([
  "unknown",
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function string(value: unknown, maximum = 10_000): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseDeviceMeData(
  value: unknown,
  expectedDeviceId: string,
): DeviceMeResponse["data"] | null {
  const data = record(value);
  const deviceId = uuid(data?.device_id);
  const workspaceId = uuid(data?.workspace_id);
  const name = string(data?.name, 120);
  const type = typeof data?.type === "string" && TYPES.has(data.type) ? data.type : null;
  const status = typeof data?.status === "string" && STATUSES.has(data.status) ? data.status : null;
  const serverTime = timestamp(data?.server_time);
  if (
    !data ||
    deviceId !== expectedDeviceId ||
    !workspaceId ||
    !name ||
    !type ||
    !status ||
    data.api_version !== "v1" ||
    !serverTime ||
    !Array.isArray(data.grants) ||
    data.grants.length > 500
  ) {
    return null;
  }
  const grants: DeviceMeResponse["data"]["grants"] = [];
  const collections = new Set<string>();
  for (const raw of data.grants) {
    const grant = record(raw);
    const collectionId = uuid(grant?.collection_id);
    if (
      !grant ||
      !collectionId ||
      collections.has(collectionId) ||
      !Array.isArray(grant.permissions) ||
      grant.permissions.length > DEVICE_GRANT_PERMISSIONS.length
    ) {
      return null;
    }
    const permissions = grant.permissions.filter(
      (permission): permission is DeviceGrantPermission =>
        typeof permission === "string" && GRANTS.has(permission),
    );
    if (
      permissions.length !== grant.permissions.length ||
      new Set(permissions).size !== permissions.length
    ) {
      return null;
    }
    collections.add(collectionId);
    grants.push({ collection_id: collectionId, permissions });
  }
  return {
    device_id: deviceId,
    workspace_id: workspaceId,
    name,
    type: type as DeviceMeResponse["data"]["type"],
    status: status as DeviceMeResponse["data"]["status"],
    grants,
    api_version: "v1",
    server_time: serverTime,
  };
}

export function parseHeartbeatData(
  value: unknown,
): { accepted: boolean; server_time: string } | null {
  const data = record(value);
  const serverTime = timestamp(data?.server_time);
  return data?.accepted === true && serverTime ? { accepted: true, server_time: serverTime } : null;
}

export interface SnapshotManifestSource {
  manifest: Omit<TalenceCatalogSnapshotManifest, "latest"> & {
    latest: Omit<TalenceCatalogSnapshotManifest["latest"], "download">;
  };
  storageBucket: string;
  storagePath: string;
}

export function parseSnapshotManifestSource(value: unknown): SnapshotManifestSource | null {
  const root = record(value);
  const latest = record(root?.latest);
  const counts = record(latest?.record_counts);
  const snapshotId = uuid(latest?.snapshot_id);
  const version = string(latest?.version, 160);
  const generatedAt = timestamp(latest?.generated_at);
  const providerObservedAt = timestamp(latest?.provider_observed_at);
  const sha256 =
    typeof latest?.sha256 === "string" && SHA256_PATTERN.test(latest.sha256) ? latest.sha256 : null;
  const byteSize = nonnegativeInteger(latest?.byte_size);
  const snapshotSchemaVersion = nonnegativeInteger(latest?.snapshot_schema_version);
  const minimumClientVersion = string(latest?.minimum_client_version, 80);
  const apiContractVersion = string(latest?.api_contract_version, 40);
  const serverTime = timestamp(root?.server_time);
  const storageBucket = string(latest?.storage_bucket, 64);
  const storagePath = string(latest?.storage_path, 1_024);
  const sets = nonnegativeInteger(counts?.sets);
  const oracleCards = nonnegativeInteger(counts?.oracle_cards);
  const printings = nonnegativeInteger(counts?.printings);
  const faces = nonnegativeInteger(counts?.faces);
  const prices = nonnegativeInteger(counts?.prices);
  if (
    !root ||
    root.schema_version !== 1 ||
    typeof root.up_to_date !== "boolean" ||
    !serverTime ||
    !latest ||
    !snapshotId ||
    !version ||
    !snapshotSchemaVersion ||
    latest.game_code !== "mtg" ||
    !generatedAt ||
    !providerObservedAt ||
    !sha256 ||
    byteSize === null ||
    byteSize < 1 ||
    !minimumClientVersion ||
    !apiContractVersion ||
    !counts ||
    sets === null ||
    oracleCards === null ||
    printings === null ||
    faces === null ||
    prices === null ||
    !storageBucket ||
    !storagePath
  ) {
    return null;
  }
  return {
    manifest: {
      schema_version: 1,
      up_to_date: root.up_to_date,
      server_time: serverTime,
      latest: {
        snapshot_id: snapshotId,
        version,
        snapshot_schema_version: snapshotSchemaVersion,
        game_code: "mtg",
        generated_at: generatedAt,
        provider_observed_at: providerObservedAt,
        sha256,
        byte_size: byteSize,
        record_counts: {
          sets,
          oracle_cards: oracleCards,
          printings,
          faces,
          prices,
        },
        minimum_client_version: minimumClientVersion,
      },
    },
    storageBucket,
    storagePath,
  };
}

export function parseInventoryBatchData(
  value: unknown,
  expectedCollectionId: string,
  expectedLines: Array<{ line_id: string; printing_id: string }>,
): InventoryBatchResponse["data"] | null {
  const root = record(value);
  const data = record(root?.result) ?? root;
  const batchId = uuid(data?.batch_id);
  const transactionId = uuid(data?.transaction_id);
  const collectionId = uuid(data?.collection_id);
  const committedAt = timestamp(data?.committed_at);
  if (
    !data ||
    !batchId ||
    !transactionId ||
    collectionId !== expectedCollectionId ||
    !committedAt ||
    typeof data.replayed !== "boolean" ||
    !Array.isArray(data.lines) ||
    data.lines.length !== expectedLines.length ||
    data.lines.length > 500
  ) {
    return null;
  }
  const expectedPrintingByLine = new Map(
    expectedLines.map((line) => [line.line_id, line.printing_id.toLowerCase()]),
  );
  const lines: InventoryBatchResponse["data"]["lines"] = [];
  const lineIds = new Set<string>();
  for (const raw of data.lines) {
    const line = record(raw);
    const lineId = string(line?.line_id, 128);
    const printingId = uuid(line?.printing_id);
    const before = nonnegativeInteger(line?.quantity_before);
    const after = nonnegativeInteger(line?.quantity_after);
    if (
      !line ||
      !lineId ||
      lineIds.has(lineId) ||
      !printingId ||
      expectedPrintingByLine.get(lineId) !== printingId ||
      before === null ||
      after === null
    ) {
      return null;
    }
    lineIds.add(lineId);
    lines.push({
      line_id: lineId,
      printing_id: printingId,
      quantity_before: before,
      quantity_after: after,
    });
  }
  if (lineIds.size !== expectedPrintingByLine.size) return null;
  return {
    batch_id: batchId,
    transaction_id: transactionId,
    collection_id: collectionId,
    committed_at: committedAt,
    replayed: data.replayed,
    lines,
  };
}

export function parseInventoryPageData(
  value: unknown,
  expectedCollectionId: string,
): {
  data: InventoryPageResponse["data"];
  nextCursor: string | null;
} | null {
  const root = record(value);
  const items = Array.isArray(root?.items)
    ? root.items
    : Array.isArray(root?.data)
      ? root.data
      : null;
  const nextCursor =
    root?.next_cursor === null || typeof root?.next_cursor === "string"
      ? root.next_cursor
      : undefined;
  if (
    !root ||
    uuid(root.collection_id) !== expectedCollectionId ||
    !timestamp(root.server_time) ||
    !items ||
    items.length > 200 ||
    nextCursor === undefined ||
    typeof root.has_more !== "boolean" ||
    root.has_more !== Boolean(nextCursor)
  ) {
    return null;
  }
  const data: InventoryPageResponse["data"] = [];
  const identities = new Set<string>();
  for (const raw of items) {
    const item = record(raw);
    const printingId = uuid(item?.printing_id);
    const finish =
      typeof item?.finish === "string" && FINISHES.has(item.finish) ? item.finish : null;
    const condition =
      typeof item?.condition === "string" && CONDITIONS.has(item.condition) ? item.condition : null;
    const quantity = nonnegativeInteger(item?.quantity);
    const updatedAt = timestamp(item?.updated_at);
    const identity = `${printingId}:${finish}:${condition}`;
    if (
      !item ||
      !printingId ||
      !finish ||
      !condition ||
      quantity === null ||
      !updatedAt ||
      identities.has(identity)
    ) {
      return null;
    }
    identities.add(identity);
    data.push({
      printing_id: printingId,
      finish: finish as InventoryPageResponse["data"][number]["finish"],
      condition: condition as InventoryPageResponse["data"][number]["condition"],
      quantity,
      updated_at: updatedAt,
    });
  }
  return { data, nextCursor };
}

export function parseRunSummaryData(
  value: unknown,
  expectedExternalRunId: string,
): RunSummaryResponse["data"] | null {
  const root = record(value);
  const data = record(root?.result) ?? root;
  const runSummaryId = uuid(data?.run_summary_id);
  const externalRunId = string(data?.external_run_id, 128);
  const acceptedAt = timestamp(data?.accepted_at);
  if (
    !data ||
    !runSummaryId ||
    externalRunId !== expectedExternalRunId ||
    !acceptedAt ||
    typeof data.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    run_summary_id: runSummaryId,
    external_run_id: externalRunId,
    accepted_at: acceptedAt,
    replayed: data.replayed,
  };
}

export function heartbeatRpcArgs(body: HeartbeatRequest): Record<string, unknown> {
  return {
    p_client_version: body.client_version,
    p_firmware_version: body.firmware_version ?? null,
    p_catalog_snapshot_version: body.catalog_snapshot_version,
    p_health: body.health ?? {},
  };
}
