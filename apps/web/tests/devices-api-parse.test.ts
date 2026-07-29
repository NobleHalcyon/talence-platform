import { describe, expect, it, vi } from "vitest";

import {
  parseDeviceMeData,
  parseInventoryBatchData,
  parseInventoryPageData,
  parseRunSummaryData,
  parseSnapshotManifestSource,
} from "@/features/devices/api-parse";
import { callDeviceRpc } from "@/features/devices/api-rpc";
import { deviceApiRequestContext, deviceApiSuccess } from "@/features/devices/api-response";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const COLLECTION_ID = "33333333-3333-4333-8333-333333333333";
const PRINTING_ID = "44444444-4444-4444-8444-444444444444";
const BATCH_ID = "55555555-5555-4555-8555-555555555555";
const TRANSACTION_ID = "66666666-6666-4666-8666-666666666666";
const RUN_ID = "77777777-7777-4777-8777-777777777777";
const SNAPSHOT_ID = "88888888-8888-4888-8888-888888888888";
const NOW = "2026-07-27T12:00:00.000Z";
const VERSION = "mtg-20260727T120000Z-a1b2c3d4-s1";

describe("strict device API database response parsing", () => {
  it("binds /me identity and rejects duplicate or unknown grants", () => {
    const value = {
      device_id: DEVICE_ID,
      workspace_id: WORKSPACE_ID,
      name: "Sorter",
      type: "talence_sorter",
      status: "active",
      grants: [
        {
          collection_id: COLLECTION_ID,
          permissions: ["inventory_read", "inventory_write"],
        },
      ],
      api_version: "v1",
      server_time: NOW,
    };
    expect(parseDeviceMeData(value, DEVICE_ID)).toMatchObject({ device_id: DEVICE_ID });
    expect(parseDeviceMeData({ ...value, device_id: WORKSPACE_ID }, DEVICE_ID)).toBeNull();
    expect(
      parseDeviceMeData(
        { ...value, grants: [{ collection_id: COLLECTION_ID, permissions: ["admin"] }] },
        DEVICE_ID,
      ),
    ).toBeNull();
  });

  it("parses only the frozen snapshot metadata layout and keeps storage fields private", () => {
    const value = {
      schema_version: 1,
      up_to_date: false,
      server_time: NOW,
      latest: {
        snapshot_id: SNAPSHOT_ID,
        version: VERSION,
        snapshot_schema_version: 1,
        game_code: "mtg",
        generated_at: NOW,
        provider_observed_at: NOW,
        sha256: "a".repeat(64),
        byte_size: 1234,
        record_counts: {
          sets: 1,
          oracle_cards: 2,
          printings: 3,
          faces: 4,
          prices: 5,
        },
        minimum_client_version: "0.5.0",
        api_contract_version: "v1",
        storage_bucket: "catalog-snapshots",
        storage_path: `mtg/${VERSION}/catalog.sqlite`,
      },
    };
    const parsed = parseSnapshotManifestSource(value);
    expect(parsed?.storagePath).toBe(`mtg/${VERSION}/catalog.sqlite`);
    expect(parsed?.manifest.latest).not.toHaveProperty("storage_path");
    expect(
      parseSnapshotManifestSource({
        ...value,
        schema_version: 2,
      }),
    ).toBeNull();
  });

  it("binds every inventory result line to the submitted line ID and printing ID", () => {
    const value = {
      batch_id: BATCH_ID,
      transaction_id: TRANSACTION_ID,
      collection_id: COLLECTION_ID,
      committed_at: NOW,
      replayed: false,
      lines: [
        {
          line_id: "line-1",
          printing_id: PRINTING_ID,
          quantity_before: 0,
          quantity_after: 1,
        },
      ],
    };
    const expected = [{ line_id: "line-1", printing_id: PRINTING_ID }];
    expect(parseInventoryBatchData(value, COLLECTION_ID, expected)).toMatchObject({
      batch_id: BATCH_ID,
    });
    expect(
      parseInventoryBatchData(
        {
          ...value,
          lines: [{ ...value.lines[0], printing_id: DEVICE_ID }],
        },
        COLLECTION_ID,
        expected,
      ),
    ).toBeNull();
    expect(parseInventoryBatchData({ ...value, lines: [] }, COLLECTION_ID, expected)).toBeNull();
  });

  it("binds paginated inventory to its granted collection and cursor coherence", () => {
    const value = {
      collection_id: COLLECTION_ID,
      items: [
        {
          printing_id: PRINTING_ID,
          finish: "nonfoil",
          condition: "near_mint",
          quantity: 2,
          updated_at: NOW,
        },
      ],
      next_cursor: "opaque",
      has_more: true,
      server_time: NOW,
    };
    expect(parseInventoryPageData(value, COLLECTION_ID)?.nextCursor).toBe("opaque");
    expect(parseInventoryPageData({ ...value, has_more: false }, COLLECTION_ID)).toBeNull();
    expect(parseInventoryPageData(value, DEVICE_ID)).toBeNull();
  });

  it("binds run summary replay results to the submitted external run ID", () => {
    const value = {
      run_summary_id: RUN_ID,
      external_run_id: "run-1",
      accepted_at: NOW,
      replayed: true,
    };
    expect(parseRunSummaryData(value, "run-1")).toEqual(value);
    expect(parseRunSummaryData(value, "run-2")).toBeNull();
  });

  it("whitelists only actionable catalog error details from PostgreSQL", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "catalog_printing_unknown",
        details: JSON.stringify({
          unknown_printing_ids: [PRINTING_ID],
          inactive_printing_ids: [COLLECTION_ID],
          unknown_count: 1,
          inactive_count: 1,
          latest_compatible_snapshot_version: VERSION,
          sql: "must never escape",
        }),
      },
    });
    await expect(callDeviceRpc({ rpc }, "apply_device_inventory_batch", {})).rejects.toMatchObject({
      status: 409,
      code: "catalog_printing_unknown",
      details: {
        unknown_printing_ids: [PRINTING_ID, COLLECTION_ID],
        unknown_printing_count: 2,
        latest_compatible_snapshot_version: VERSION,
      },
    });
    try {
      await callDeviceRpc({ rpc }, "apply_device_inventory_batch", {});
    } catch (error) {
      expect((error as { details: Record<string, unknown> }).details).not.toHaveProperty("sql");
    }
  });

  it("maps an unknown snapshot to an actionable conflict without exposing raw details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23503",
        message: "talence_catalog_snapshot_unknown",
        details: JSON.stringify({
          latest_snapshot_version: VERSION,
          internal_path: "must never escape",
        }),
      },
    });
    await expect(callDeviceRpc({ rpc }, "apply_device_inventory_batch", {})).rejects.toMatchObject({
      status: 409,
      code: "catalog_snapshot_unknown",
      details: {
        latest_compatible_snapshot_version: VERSION,
      },
    });
  });

  it("maps race, quota-bound, and database validation failures to stable HTTP contracts", async () => {
    const cases = [
      ["talence_device_credential_invalid", 401, "device_credential_invalid"],
      ["talence_inventory_quantity_negative", 409, "inventory_negative"],
      ["talence_device_run_conflict", 409, "run_conflict"],
      ["talence_device_request_too_large", 413, "payload_too_large"],
      ["talence_device_run_summary_invalid", 400, "request_validation_failed"],
    ] as const;
    for (const [message, status, code] of cases) {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0001", message },
      });
      await expect(callDeviceRpc({ rpc }, "device_operation", {})).rejects.toMatchObject({
        status,
        code,
      });
    }
  });

  it("never lets response metadata override the canonical request ID", async () => {
    const requestId = "99999999-9999-4999-8999-999999999999";
    const context = deviceApiRequestContext(
      new Request("https://talence.invalid", {
        headers: { "x-request-id": requestId },
      }),
    );
    const response = deviceApiSuccess(context, { ok: true }, 200, {
      request_id: DEVICE_ID,
      next_cursor: null,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    await expect(response.json()).resolves.toMatchObject({
      meta: { request_id: requestId, next_cursor: null },
    });
  });

  it("replaces an invalid caller request ID with a canonical UUID", () => {
    const context = deviceApiRequestContext(
      new Request("https://talence.invalid", {
        headers: { "x-request-id": "not-a-request-id" },
      }),
    );
    expect(context.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
