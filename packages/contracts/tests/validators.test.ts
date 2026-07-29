import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  parseCatalogSnapshotManifest,
  parseDeviceInventoryBatch,
  parseDeviceRunSummary,
} from "../src/index.js";

const inventoryBatch = {
  schema_version: 1,
  catalog_snapshot_version: "mtg-20260726T120000Z-a1b2c3d4-s1",
  occurred_at: "2026-07-26T12:30:00Z",
  external_run_id: "run-001",
  lines: [
    {
      line_id: "line-001",
      printing_id: "0f8f2d35-49d2-4c6f-a1fd-9b0760a97ab4",
      finish: "nonfoil",
      condition: "near_mint",
      quantity_delta: 1,
    },
  ],
  metadata: { fixture: true },
} as const;

describe("device inventory batch validation", () => {
  it("accepts a canonical inventory batch", () => {
    expect(parseDeviceInventoryBatch(inventoryBatch)).toEqual(inventoryBatch);
  });

  it("rejects zero deltas and unknown properties", () => {
    expect(() =>
      parseDeviceInventoryBatch({
        ...inventoryBatch,
        unexpected: true,
        lines: [{ ...inventoryBatch.lines[0], quantity_delta: 0 }],
      }),
    ).toThrow(ContractValidationError);
  });

  it("enforces semantic line identifier uniqueness", () => {
    expect(() =>
      parseDeviceInventoryBatch({
        ...inventoryBatch,
        lines: [inventoryBatch.lines[0], inventoryBatch.lines[0]],
      }),
    ).toThrow(/canonical contract validation/u);
  });
});

describe("device run summary validation", () => {
  it("accepts the bounded thin run summary", () => {
    const run = {
      schema_version: 1,
      external_run_id: "run-001",
      collection_id: "e3fc093a-4dc0-4e2f-ad73-257b1b453ba2",
      status: "completed",
      catalog_snapshot_version: "mtg-20260726T120000Z-a1b2c3d4-s1",
      started_at: "2026-07-26T12:00:00Z",
      completed_at: "2026-07-26T12:20:00Z",
      counts: {
        total: 10,
        recognized: 9,
        unrecognized: 1,
        posted: 9,
      },
    };

    expect(parseDeviceRunSummary(run)).toEqual(run);
  });

  it("rejects robot execution state", () => {
    expect(() =>
      parseDeviceRunSummary({
        schema_version: 1,
        external_run_id: "run-001",
        collection_id: "e3fc093a-4dc0-4e2f-ad73-257b1b453ba2",
        status: "completed",
        catalog_snapshot_version: "snapshot",
        started_at: "2026-07-26T12:00:00Z",
        completed_at: "2026-07-26T12:20:00Z",
        counts: { total: 1, recognized: 1, unrecognized: 0, posted: 1 },
        movement_plan: [{ axis: "x", distance: 4 }],
      }),
    ).toThrow(ContractValidationError);
  });
});

describe("catalog manifest validation", () => {
  const latest = {
    snapshot_id: "906c85ad-4748-4dc3-9630-77ba9f984749",
    version: "mtg-20260726T120000Z-a1b2c3d4-s1",
    snapshot_schema_version: 1,
    game_code: "mtg",
    generated_at: "2026-07-26T12:10:00Z",
    provider_observed_at: "2026-07-26T12:00:00Z",
    sha256: "a".repeat(64),
    byte_size: 1024,
    record_counts: {
      sets: 1,
      oracle_cards: 2,
      printings: 3,
      faces: 4,
      prices: 5,
    },
    minimum_client_version: "0.1.0",
  } as const;

  it("accepts an up-to-date response without a download", () => {
    const manifest = {
      schema_version: 1,
      up_to_date: true,
      server_time: "2026-07-26T12:15:00Z",
      latest,
    };
    expect(parseCatalogSnapshotManifest(manifest)).toEqual(manifest);
  });

  it("requires a download when an update is available", () => {
    expect(() =>
      parseCatalogSnapshotManifest({
        schema_version: 1,
        up_to_date: false,
        server_time: "2026-07-26T12:15:00Z",
        latest,
      }),
    ).toThrow(ContractValidationError);
  });
});
