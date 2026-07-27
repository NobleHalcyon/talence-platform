import { beforeEach, describe, expect, it, vi } from "vitest";

import { stageInventoryImportAction } from "@/features/collections/import-actions";
import {
  chunkInventoryImportStageRows,
  INVENTORY_IMPORT_STAGE_LIMITS,
} from "@/features/collections/import-stage";
import { INITIAL_IMPORT_ACTION_STATE } from "@/features/collections/import-state";
import type { InventoryImportInputRow } from "@/features/collections/types";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAppContextState: vi.fn(),
}));

vi.mock("@/lib/auth/app-context", () => ({
  getAppContextState: mocks.getAppContextState,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const CSV = [
  "scryfall_id,finish,condition,quantity",
  "44444444-4444-4444-8444-444444444444,nonfoil,near_mint,1",
].join("\n");

function form(attemptId = ATTEMPT_ID, contents = CSV): FormData {
  const data = new FormData();
  const file = new File([contents], "inventory.csv", { type: "text/csv" });
  if (typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode(contents).buffer,
    });
  }
  data.set("collectionId", COLLECTION_ID);
  data.set("uploadAttemptId", attemptId);
  data.set("inventoryCsv", file);
  return data;
}

function createResult(replayed: boolean, stagingCompletedAt: string | null = null) {
  return {
    data: {
      import_job_id: JOB_ID,
      status: "running",
      storage_bucket: "inventory-imports",
      storage_path: `${COLLECTION_ID}/${JOB_ID}/inventory.csv`,
      max_file_bytes: 2 * 1024 * 1024,
      max_rows: 5_000,
      purge_after: "2026-08-02T12:00:00Z",
      staging_completed_at: stagingCompletedAt,
      replayed,
    },
    error: null,
  };
}

function previewResult() {
  return {
    data: {
      job: {
        import_job_id: JOB_ID,
        collection_id: COLLECTION_ID,
        status: "running",
        created_at: "2026-07-26T12:00:00Z",
        staging_completed_at: "2026-07-26T12:01:00Z",
        original_filename: "inventory.csv",
        parser_version: "talence-inventory-csv-v1",
        file_sha256: "a".repeat(64),
        storage_path: `${COLLECTION_ID}/${JOB_ID}/inventory.csv`,
      },
      counts: {
        total: 0,
        matched: 0,
        ambiguous: 0,
        rejected: 0,
        excluded: 0,
      },
      items: [],
    },
    error: null,
  };
}

function parsedRow(name: string): InventoryImportInputRow {
  return {
    rowNumber: 2,
    scryfallId: "44444444-4444-4444-8444-444444444444",
    oracleId: null,
    name,
    setCode: null,
    collectorNumber: null,
    language: null,
    finish: "nonfoil",
    condition: "near_mint",
    quantity: 1,
    strategy: "scryfall_id",
    errorCode: null,
    errorMessage: null,
  };
}

describe("inventory import attempt replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getAppContextState.mockResolvedValue({
      status: "ready",
      context: {
        workspace: { role: "editor" },
      },
    });
  });

  it("loads a replayed preview without uploading, staging, or cancelling", async () => {
    const upload = vi.fn();
    const from = vi.fn(() => ({ upload }));
    const rpc = vi.fn(async (name: string) => {
      if (name === DATABASE_FUNCTIONS.inventoryImportCreate) {
        return createResult(true, "2026-07-26T12:01:00Z");
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportPreview) {
        return previewResult();
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: { from },
    });

    const state = await stageInventoryImportAction(INITIAL_IMPORT_ACTION_STATE, form());

    expect(state).toMatchObject({
      status: "preview",
      uploadAttemptId: ATTEMPT_ID,
      preview: {
        jobId: JOB_ID,
        createdAt: "2026-07-26T12:00:00.000Z",
      },
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportStageRows,
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      expect.anything(),
    );
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("resumes a partial replay after verifying the already-uploaded object", async () => {
    const existing = new Blob([CSV], { type: "text/csv" });
    if (typeof (existing as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
      Object.defineProperty(existing, "arrayBuffer", {
        value: async () => new TextEncoder().encode(CSV).buffer,
      });
    }
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { statusCode: 409, message: "The resource already exists" },
    });
    const download = vi.fn().mockResolvedValue({ data: existing, error: null });
    const rpc = vi.fn(async (name: string) => {
      if (name === DATABASE_FUNCTIONS.inventoryImportCreate) {
        return createResult(true);
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportStageRows) {
        return { data: { staged: 1 }, error: null };
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportPreview) {
        return previewResult();
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn(() => ({ upload, download })) },
    });

    const state = await stageInventoryImportAction(INITIAL_IMPORT_ACTION_STATE, form());

    expect(state.status).toBe("preview");
    expect(upload).toHaveBeenCalledWith(
      `${COLLECTION_ID}/${JOB_ID}/inventory.csv`,
      expect.any(Uint8Array),
      {
        contentType: "text/csv",
        metadata: {
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          import_job_id: JOB_ID,
          parser_version: "talence-csv-v1",
        },
        upsert: false,
      },
    );
    expect(download).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportStageRows,
      expect.objectContaining({
        p_import_job_id: JOB_ID,
        p_complete: true,
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      expect.anything(),
    );
  });

  it("cancels a partial replay when the bound object hash does not match", async () => {
    const mismatched = new Blob(["different"], { type: "text/csv" });
    if (typeof (mismatched as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
      Object.defineProperty(mismatched, "arrayBuffer", {
        value: async () => new TextEncoder().encode("different").buffer,
      });
    }
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { statusCode: 409, message: "The resource already exists" },
    });
    const download = vi.fn().mockResolvedValue({
      data: mismatched,
      error: null,
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === DATABASE_FUNCTIONS.inventoryImportCreate) {
        return createResult(true);
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportCancel) {
        return { data: { status: "cancelled" }, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn(() => ({ upload, download })) },
    });

    const state = await stageInventoryImportAction(INITIAL_IMPORT_ACTION_STATE, form());

    expect(state.status).toBe("error");
    expect(state.uploadAttemptId).not.toBe(ATTEMPT_ID);
    expect(rpc).toHaveBeenCalledWith(DATABASE_FUNCTIONS.inventoryImportCancel, {
      p_import_job_id: JOB_ID,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportStageRows,
      expect.anything(),
    );
  });

  it("keeps a partial multi-chunk job resumable and replays every chunk", async () => {
    const largeCsv = [
      "scryfall_id,finish,condition,quantity",
      ...Array.from(
        { length: 501 },
        () => "44444444-4444-4444-8444-444444444444,nonfoil,near_mint,1",
      ),
    ].join("\n");
    const existing = new Blob([largeCsv], { type: "text/csv" });
    if (typeof (existing as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
      Object.defineProperty(existing, "arrayBuffer", {
        value: async () => new TextEncoder().encode(largeCsv).buffer,
      });
    }
    let createCount = 0;
    let stageCount = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === DATABASE_FUNCTIONS.inventoryImportCreate) {
        createCount += 1;
        return createResult(createCount > 1);
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportStageRows) {
        stageCount += 1;
        if (stageCount === 2) {
          return {
            data: null,
            error: { code: "08006", message: "transient connection loss" },
          };
        }
        return { data: { staged: true }, error: null };
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportPreview) {
        return previewResult();
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: { path: "fixture" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { statusCode: 409, message: "The resource already exists" },
      });
    const download = vi.fn().mockResolvedValue({ data: existing, error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn(() => ({ upload, download })) },
    });

    const first = await stageInventoryImportAction(
      INITIAL_IMPORT_ACTION_STATE,
      form(ATTEMPT_ID, largeCsv),
    );
    expect(first).toMatchObject({
      status: "error",
      uploadAttemptId: ATTEMPT_ID,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      expect.anything(),
    );

    const retried = await stageInventoryImportAction(first, form(ATTEMPT_ID, largeCsv));
    expect(retried.status).toBe("preview");
    expect(stageCount).toBe(4);
    expect(download).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      expect.anything(),
    );
  });

  it("keeps multibyte stage payloads below the exact 512 KiB JSON boundary", async () => {
    const multibyteName = "😀".repeat(2_048);
    const multibyteCsv = [
      "scryfall_id,name,finish,condition,quantity",
      ...Array.from(
        { length: 70 },
        () => `44444444-4444-4444-8444-444444444444,${multibyteName},nonfoil,near_mint,1`,
      ),
    ].join("\n");
    const stagePayloads: Array<{
      p_rows: Record<string, unknown>[];
      p_complete: boolean;
    }> = [];
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === DATABASE_FUNCTIONS.inventoryImportCreate) {
        return createResult(false);
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportStageRows) {
        stagePayloads.push(
          args as {
            p_rows: Record<string, unknown>[];
            p_complete: boolean;
          },
        );
        return { data: { staged: true }, error: null };
      }
      if (name === DATABASE_FUNCTIONS.inventoryImportPreview) {
        return previewResult();
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({
            data: { path: "fixture" },
            error: null,
          }),
        })),
      },
    });

    const state = await stageInventoryImportAction(
      INITIAL_IMPORT_ACTION_STATE,
      form(ATTEMPT_ID, multibyteCsv),
    );

    expect(state.status).toBe("preview");
    expect(stagePayloads).toHaveLength(2);
    expect(stagePayloads[0]!.p_complete).toBe(false);
    expect(stagePayloads[1]!.p_complete).toBe(true);
    expect(stagePayloads.reduce((total, payload) => total + payload.p_rows.length, 0)).toBe(70);
    const payloadBytes = stagePayloads.map(
      (payload) => new TextEncoder().encode(JSON.stringify(payload.p_rows)).byteLength,
    );
    expect(payloadBytes[0]).toBeGreaterThan(500 * 1024);
    expect(
      payloadBytes.every((size) => size <= INVENTORY_IMPORT_STAGE_LIMITS.maximumChunkBytes),
    ).toBe(true);
    expect(
      stagePayloads.every(
        (payload) => payload.p_rows.length <= INVENTORY_IMPORT_STAGE_LIMITS.maximumRowsPerChunk,
      ),
    ).toBe(true);
  });

  it("rejects a single staged row above the defensive database row cap", () => {
    const result = chunkInventoryImportStageRows([parsedRow("😀".repeat(33_000))]);

    expect(result).toEqual({
      ok: false,
      reason: "row_too_large",
      rowNumber: 2,
    });
  });

  it("issues a fresh attempt UUID after an explicitly returned create error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "fixture failure" },
    });
    const upload = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn(() => ({ upload })) },
    });

    const state = await stageInventoryImportAction(INITIAL_IMPORT_ACTION_STATE, form());

    expect(state.status).toBe("error");
    expect(state.uploadAttemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(state.uploadAttemptId).not.toBe(ATTEMPT_ID);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(
      DATABASE_FUNCTIONS.inventoryImportCancel,
      expect.anything(),
    );
  });
});
