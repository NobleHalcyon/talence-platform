import { describe, expect, it } from "vitest";

import { canonicalJson, canonicalJsonSha256 } from "@/features/devices/canonical-json";
import {
  parseManifestQuery,
  readBoundedJsonWithSize,
  requireIdempotencyKey,
} from "@/features/devices/api-request";
import { DeviceApiError } from "@/features/devices/api-response";
import {
  findProhibitedDeviceStateKey,
  parseHeartbeatRequest,
  parseInventoryBatchRequest,
  parseRunSummaryRequest,
} from "@/features/devices/api-validation";
import { isSafeSnapshotSignedUrl } from "@/features/devices/signed-url";

const PRINTING_ID = "11111111-1111-4111-8111-111111111111";
const COLLECTION_ID = "22222222-2222-4222-8222-222222222222";

function inventoryBody() {
  return {
    schema_version: 1 as const,
    catalog_snapshot_version: "mtg-20260727T120000Z-a1b2c3d4-s1",
    occurred_at: "2026-07-27T12:00:00.000Z",
    lines: [
      {
        line_id: "line-1",
        printing_id: PRINTING_ID,
        finish: "nonfoil",
        condition: "near_mint",
        quantity_delta: 1,
      },
    ],
    metadata: { station: "intake-a" },
  };
}

function runBody() {
  return {
    schema_version: 1 as const,
    external_run_id: "run-local-001",
    collection_id: COLLECTION_ID,
    status: "completed",
    catalog_snapshot_version: "mtg-20260727T120000Z-a1b2c3d4-s1",
    started_at: "2026-07-27T11:00:00.000Z",
    completed_at: "2026-07-27T12:00:00.000Z",
    counts: { total: 5, recognized: 4, unrecognized: 1, posted: 4 },
  };
}

describe("device API request validation", () => {
  it("canonicalizes object keys deterministically while preserving array order", () => {
    const left = { z: 1, nested: { b: true, a: null }, lines: [2, 1] };
    const right = { lines: [2, 1], nested: { a: null, b: true }, z: 1 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJsonSha256(left)).toBe(canonicalJsonSha256(right));
    expect(canonicalJsonSha256({ lines: [1, 2] })).not.toBe(canonicalJsonSha256({ lines: [2, 1] }));
  });

  it("reads only UTF-8 JSON within the endpoint byte bound", async () => {
    const request = new Request("https://talence.invalid/api/v1/device/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true }),
    });
    const parsed = await readBoundedJsonWithSize(request, 128);
    expect(parsed).toEqual({ value: { ok: true }, byteLength: 11 });

    await expect(
      readBoundedJsonWithSize(
        new Request("https://talence.invalid", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "too large" }),
        }),
        5,
      ),
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
    await expect(
      readBoundedJsonWithSize(
        new Request("https://talence.invalid", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        }),
        10,
      ),
    ).rejects.toMatchObject({ status: 415, code: "content_type_unsupported" });
  });

  it("enforces the exact idempotency header bounds", () => {
    expect(
      requireIdempotencyKey(
        new Request("https://talence.invalid", {
          headers: { "idempotency-key": "device-op-0001" },
        }),
      ),
    ).toBe("device-op-0001");
    expect(() =>
      requireIdempotencyKey(
        new Request("https://talence.invalid", {
          headers: { "idempotency-key": "short" },
        }),
      ),
    ).toThrow(DeviceApiError);
  });

  it("normalizes bounded manifest versions before compatibility selection", () => {
    expect(
      parseManifestQuery(
        new URL(
          "https://talence.invalid/api/v1/device/catalog/manifest?current_version=%20&client_version=%200.5.0%20&supported_schema_versions=1,2,1",
        ),
      ),
    ).toEqual({
      currentVersion: null,
      clientVersion: "0.5.0",
      supportedSchemaVersions: [1, 2],
    });
  });

  it("rejects normalized motion, camera, motor, sensor, bin-state, and checkpoint keys", () => {
    for (const key of [
      "Motion_State",
      "restart-checkpoint",
      "cameraFrames",
      "motor_commands",
      "sensorReadings",
      "bin occupancy",
      "executionState",
      "trajectory",
    ]) {
      expect(findProhibitedDeviceStateKey({ metadata: { [key]: "x" } })).toBe(key);
    }
    expect(findProhibitedDeviceStateKey({ metadata: { promotion: "safe scalar" } })).toBeNull();
  });

  it("strictly validates heartbeat fields and rejects robot execution state", () => {
    expect(
      parseHeartbeatRequest({
        schema_version: 1,
        client_version: "robot/1.0",
        catalog_snapshot_version: null,
        health: { temperature_c: 32.5, ready: true },
      }),
    ).toMatchObject({ client_version: "robot/1.0" });
    expect(() =>
      parseHeartbeatRequest({
        schema_version: 1,
        client_version: "robot/1.0",
        catalog_snapshot_version: null,
        health: { restartCheckpoint: "move-44" },
      }),
    ).toThrowError(/Motion plans and execution checkpoints/);
    expect(() =>
      parseHeartbeatRequest({
        schema_version: 1,
        client_version: "robot/1.0",
        catalog_snapshot_version: null,
        unknown: true,
      }),
    ).toThrow(DeviceApiError);
    expect(
      parseHeartbeatRequest({
        schema_version: 1,
        client_version: " robot/1.0 ",
        firmware_version: "",
        catalog_snapshot_version: " ",
      }),
    ).toMatchObject({
      client_version: "robot/1.0",
      firmware_version: null,
      catalog_snapshot_version: null,
    });
  });

  it("uses canonical inventory validation, unique line IDs, bounded metadata, and clock checks", () => {
    expect(
      parseInventoryBatchRequest(inventoryBody(), new Date("2026-07-27T12:05:00.000Z")),
    ).toMatchObject({ lines: [{ line_id: "line-1" }] });
    expect(() =>
      parseInventoryBatchRequest(
        {
          ...inventoryBody(),
          lines: [inventoryBody().lines[0], inventoryBody().lines[0]],
        },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrow();
    expect(() =>
      parseInventoryBatchRequest(
        { ...inventoryBody(), metadata: { motionPlan: "forbidden" } },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrowError(/Motion plans/);
    expect(() =>
      parseInventoryBatchRequest(
        { ...inventoryBody(), occurred_at: "2026-07-27T12:10:01.000Z" },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrowError(/too far in the future/);
    expect(() =>
      parseInventoryBatchRequest(
        {
          ...inventoryBody(),
          lines: [inventoryBody().lines[0], { ...inventoryBody().lines[0], line_id: " line-1 " }],
        },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrowError(/unique after normalization/);
  });

  it("requires coherent run counts and ordered timestamps", () => {
    expect(parseRunSummaryRequest(runBody(), new Date("2026-07-27T12:05:00.000Z"))).toMatchObject({
      external_run_id: "run-local-001",
    });
    expect(() =>
      parseRunSummaryRequest(
        { ...runBody(), counts: { total: 6, recognized: 4, unrecognized: 1, posted: 4 } },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrowError(/internally inconsistent/);
    expect(() =>
      parseRunSummaryRequest(
        {
          ...runBody(),
          started_at: "2026-07-27T12:01:00.000Z",
          completed_at: "2026-07-27T12:00:00.000Z",
        },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toThrowError(/must not precede/);
    expect(
      parseRunSummaryRequest(
        {
          ...runBody(),
          external_run_id: " run-local-001 ",
          catalog_snapshot_version: ` ${runBody().catalog_snapshot_version} `,
          diagnostic_code: "",
        },
        new Date("2026-07-27T12:05:00.000Z"),
      ),
    ).toMatchObject({
      external_run_id: "run-local-001",
      catalog_snapshot_version: runBody().catalog_snapshot_version,
      diagnostic_code: null,
    });
  });

  it("binds signed URLs to the configured Supabase origin, bucket, and object", () => {
    const productionBinding = {
      projectUrl: "https://project.supabase.co",
      bucket: "catalog-snapshots",
      objectPath: "mtg/version/catalog.sqlite",
    };
    const localBinding = {
      projectUrl: "http://127.0.0.1:54321",
      bucket: "catalog-snapshots",
      objectPath: "mtg/version/catalog.sqlite",
    };
    expect(
      isSafeSnapshotSignedUrl(
        "https://project.supabase.co/storage/v1/object/sign/catalog-snapshots/mtg/version/catalog.sqlite?token=signed",
        productionBinding,
        "production",
      ),
    ).toBe(true);
    expect(
      isSafeSnapshotSignedUrl(
        "http://127.0.0.1:54321/storage/v1/object/sign/catalog-snapshots/mtg/version/catalog.sqlite?token=signed",
        localBinding,
        "test",
      ),
    ).toBe(true);
    expect(
      isSafeSnapshotSignedUrl(
        "http://127.0.0.1:54321/storage/v1/object/sign/catalog-snapshots/mtg/version/catalog.sqlite?token=signed",
        localBinding,
        "production",
      ),
    ).toBe(false);
    expect(
      isSafeSnapshotSignedUrl(
        "https://other.supabase.co/storage/v1/object/sign/catalog-snapshots/mtg/version/catalog.sqlite?token=signed",
        productionBinding,
        "test",
      ),
    ).toBe(false);
    expect(
      isSafeSnapshotSignedUrl(
        "https://project.supabase.co/storage/v1/object/sign/other-bucket/mtg/version/catalog.sqlite?token=signed",
        productionBinding,
        "test",
      ),
    ).toBe(false);
    expect(
      isSafeSnapshotSignedUrl(
        "https://project.supabase.co/storage/v1/object/sign/catalog-snapshots/mtg/other/catalog.sqlite?token=signed",
        productionBinding,
        "test",
      ),
    ).toBe(false);
    expect(
      isSafeSnapshotSignedUrl(
        "https://project.supabase.co/storage/v1/object/sign/catalog-snapshots/mtg/version/catalog.sqlite",
        productionBinding,
        "test",
      ),
    ).toBe(false);
    expect(isSafeSnapshotSignedUrl("javascript:alert(1)", productionBinding, "test")).toBe(false);
    expect(
      isSafeSnapshotSignedUrl("ftp://project.supabase.co/file", productionBinding, "test"),
    ).toBe(false);
  });
});
