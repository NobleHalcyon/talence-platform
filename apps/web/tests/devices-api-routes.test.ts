import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
}));

vi.mock("@/features/devices/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/features/devices/api-auth")>(
    "@/features/devices/api-auth",
  );
  return {
    ...actual,
    authenticateDeviceRequest: mocks.authenticate,
  };
});

import { GET as manifestGet } from "@/app/api/v1/device/catalog/manifest/route";
import { POST as inventoryPost } from "@/app/api/v1/device/collections/[collectionId]/inventory-batches/route";
import { GET as inventoryGet } from "@/app/api/v1/device/collections/[collectionId]/inventory/route";
import { POST as heartbeatPost } from "@/app/api/v1/device/heartbeat/route";
import { GET as meGet } from "@/app/api/v1/device/me/route";
import { POST as runPost } from "@/app/api/v1/device/runs/route";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const CREDENTIAL_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const COLLECTION_ID = "44444444-4444-4444-8444-444444444444";
const PRINTING_ID = "55555555-5555-4555-8555-555555555555";
const BATCH_ID = "66666666-6666-4666-8666-666666666666";
const TRANSACTION_ID = "77777777-7777-4777-8777-777777777777";
const RUN_ID = "88888888-8888-4888-8888-888888888888";
const SNAPSHOT_ID = "99999999-9999-4999-8999-999999999999";
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-07-27T12:00:00.000Z";
const VERSION = "mtg-20260727T120000Z-a1b2c3d4-s1";

function authenticatedClient(
  data: unknown,
  signedUrl = "https://project.supabase.co/storage/v1/object/sign/catalog",
) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl },
    error: null,
  });
  const from = vi.fn(() => ({ createSignedUrl }));
  const client = { rpc, storage: { from } };
  mocks.authenticate.mockResolvedValue({
    client,
    credentialId: CREDENTIAL_ID,
    deviceId: DEVICE_ID,
  });
  return { client, rpc, from, createSignedUrl };
}

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": REQUEST_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function manifestSource(upToDate = false) {
  return {
    schema_version: 1,
    up_to_date: upToDate,
    server_time: NOW,
    latest: {
      snapshot_id: SNAPSHOT_ID,
      version: VERSION,
      snapshot_schema_version: 1,
      game_code: "mtg",
      generated_at: NOW,
      provider_observed_at: NOW,
      sha256: "a".repeat(64),
      byte_size: 1_234,
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
}

beforeEach(() => {
  mocks.authenticate.mockReset();
  process.env.FEATURE_DEVICE_INVENTORY_WRITES_ENABLED = "true";
  process.env.FEATURE_SNAPSHOT_DOWNLOADS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.FEATURE_DEVICE_INVENTORY_WRITES_ENABLED;
  delete process.env.FEATURE_SNAPSHOT_DOWNLOADS_ENABLED;
});

describe("device API route handlers", () => {
  it("returns strict /me data with an echoed request ID", async () => {
    const { rpc } = authenticatedClient({
      device_id: DEVICE_ID,
      workspace_id: WORKSPACE_ID,
      name: "Sorter",
      type: "talence_sorter",
      status: "active",
      grants: [],
      api_version: "v1",
      server_time: NOW,
    });
    const response = await meGet(
      new Request("https://talence.invalid/api/v1/device/me", {
        headers: { "x-request-id": REQUEST_ID },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    await expect(response.json()).resolves.toMatchObject({
      data: { device_id: DEVICE_ID, api_version: "v1" },
      meta: { request_id: REQUEST_ID },
    });
    expect(rpc).toHaveBeenCalledWith("device_api_me", {
      p_device_id: DEVICE_ID,
      p_credential_id: CREDENTIAL_ID,
      p_request_id: REQUEST_ID,
      p_request_bytes: 0,
    });
  });

  it("posts bounded heartbeat fields without accepting execution state", async () => {
    const { rpc } = authenticatedClient({ accepted: true, server_time: NOW });
    const response = await heartbeatPost(
      jsonRequest("https://talence.invalid/api/v1/device/heartbeat", {
        schema_version: 1,
        client_version: "robot/1.0",
        firmware_version: null,
        catalog_snapshot_version: VERSION,
        health: { ready: true },
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "device_api_heartbeat",
      expect.objectContaining({
        p_device_id: DEVICE_ID,
        p_credential_id: CREDENTIAL_ID,
        p_client_version: "robot/1.0",
        p_health: { ready: true },
        p_request_bytes: expect.any(Number),
      }),
    );
  });

  it("signs only a version-bound compatible manifest and strips private storage fields", async () => {
    const { rpc, from, createSignedUrl } = authenticatedClient(manifestSource());
    const response = await manifestGet(
      new Request(
        "https://talence.invalid/api/v1/device/catalog/manifest?current_version=older-compatible&client_version=0.5.0&supported_schema_versions=1",
        { headers: { "x-request-id": REQUEST_ID } },
      ),
    );
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("catalog-snapshots");
    expect(createSignedUrl).toHaveBeenCalledWith(`mtg/${VERSION}/catalog.sqlite`, 600);
    expect(rpc).toHaveBeenCalledWith(
      "device_api_catalog_manifest",
      expect.objectContaining({
        p_current_version: "older-compatible",
        p_client_version: "0.5.0",
        p_supported_schema_versions: [1],
      }),
    );
    const body = (await response.json()) as {
      data: { latest: Record<string, unknown> };
    };
    expect(body.data.latest.download).toEqual(
      expect.objectContaining({
        url: "https://project.supabase.co/storage/v1/object/sign/catalog",
      }),
    );
    expect(body.data.latest).not.toHaveProperty("storage_bucket");
    expect(body.data.latest).not.toHaveProperty("storage_path");
    expect(JSON.stringify(body)).not.toContain("api_contract_version");
  });

  it("fails closed when device mutation or snapshot kill switches are absent", async () => {
    delete process.env.FEATURE_DEVICE_INVENTORY_WRITES_ENABLED;
    const inventory = authenticatedClient(null);
    const inventoryResponse = await inventoryPost(
      jsonRequest(
        `https://talence.invalid/api/v1/device/collections/${COLLECTION_ID}/inventory-batches`,
        {},
        { "idempotency-key": "batch-key-0001" },
      ),
      { params: Promise.resolve({ collectionId: COLLECTION_ID }) },
    );
    expect(inventoryResponse.status).toBe(503);
    expect(inventory.rpc).not.toHaveBeenCalled();

    delete process.env.FEATURE_SNAPSHOT_DOWNLOADS_ENABLED;
    const manifest = authenticatedClient(null);
    const manifestResponse = await manifestGet(
      new Request(
        "https://talence.invalid/api/v1/device/catalog/manifest?client_version=0.5.0&supported_schema_versions=1",
      ),
    );
    expect(manifestResponse.status).toBe(503);
    expect(manifest.rpc).not.toHaveBeenCalled();
  });

  it("rejects a malicious signing response and a path not bound to the manifest version", async () => {
    const malicious = authenticatedClient(manifestSource(), "javascript:alert(1)");
    const request = () =>
      new Request(
        "https://talence.invalid/api/v1/device/catalog/manifest?client_version=0.5.0&supported_schema_versions=1",
      );
    const maliciousResponse = await manifestGet(request());
    expect(maliciousResponse.status).toBe(503);
    expect(JSON.stringify(await maliciousResponse.json())).not.toContain("javascript");

    const mismatched = manifestSource();
    mismatched.latest.storage_path = "mtg/other/catalog.sqlite";
    const pathClient = authenticatedClient(mismatched);
    const pathResponse = await manifestGet(request());
    expect(pathResponse.status).toBe(503);
    expect(pathClient.createSignedUrl).not.toHaveBeenCalled();
    expect(malicious.createSignedUrl).toHaveBeenCalled();
  });

  it("returns granted inventory with the OpenAPI array envelope and cursor metadata", async () => {
    const { rpc } = authenticatedClient({
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
      next_cursor: null,
      has_more: false,
      server_time: NOW,
    });
    const response = await inventoryGet(
      new Request(
        `https://talence.invalid/api/v1/device/collections/${COLLECTION_ID}/inventory?limit=25`,
        { headers: { "x-request-id": REQUEST_ID } },
      ),
      { params: Promise.resolve({ collectionId: COLLECTION_ID }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [{ printing_id: PRINTING_ID, quantity: 2 }],
      meta: { request_id: REQUEST_ID, next_cursor: null },
    });
    expect(rpc).toHaveBeenCalledWith(
      "device_api_inventory_page",
      expect.objectContaining({ p_collection_id: COLLECTION_ID, p_limit: 25 }),
    );
  });

  it("commits inventory and run summaries with canonical 201/200 replay semantics", async () => {
    const inventory = authenticatedClient({
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
    });
    const inventoryResponse = await inventoryPost(
      jsonRequest(
        `https://talence.invalid/api/v1/device/collections/${COLLECTION_ID}/inventory-batches`,
        {
          schema_version: 1,
          catalog_snapshot_version: VERSION,
          occurred_at: NOW,
          lines: [
            {
              line_id: "line-1",
              printing_id: PRINTING_ID,
              finish: "nonfoil",
              condition: "near_mint",
              quantity_delta: 1,
            },
          ],
        },
        { "idempotency-key": "batch-key-0001" },
      ),
      { params: Promise.resolve({ collectionId: COLLECTION_ID }) },
    );
    expect(inventoryResponse.status).toBe(201);
    expect(inventory.rpc).toHaveBeenCalledWith(
      "apply_device_inventory_batch",
      expect.objectContaining({
        p_idempotency_key: "batch-key-0001",
        p_lines: [expect.objectContaining({ line_id: "line-1" })],
      }),
    );

    authenticatedClient({
      run_summary_id: RUN_ID,
      external_run_id: "run-1",
      accepted_at: NOW,
      replayed: true,
    });
    const runResponse = await runPost(
      jsonRequest(
        "https://talence.invalid/api/v1/device/runs",
        {
          schema_version: 1,
          external_run_id: "run-1",
          collection_id: COLLECTION_ID,
          status: "completed",
          catalog_snapshot_version: VERSION,
          started_at: "2026-07-27T11:00:00.000Z",
          completed_at: NOW,
          counts: { total: 1, recognized: 1, unrecognized: 0, posted: 1 },
        },
        { "idempotency-key": "run-key-0001" },
      ),
    );
    expect(runResponse.status).toBe(200);
    await expect(runResponse.json()).resolves.toMatchObject({
      data: { run_summary_id: RUN_ID, replayed: true },
    });
  });
});
