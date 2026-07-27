import { describe, expect, it, vi } from "vitest";

import { createCollectionWithClient } from "@/features/collections/actions";
import {
  bulkAttemptIdempotencyKey,
  inventoryEditAttempt,
} from "@/features/collections/idempotency";
import { canManuallyResolveImportRow } from "@/features/collections/import-review";
import {
  parseCollectionInventoryResult,
  parseInventoryExportPage,
  parseInventoryHistoryPage,
  parseInventoryImportErrorReportPage,
  parseInventoryImportCreate,
  parseInventoryImportPreview,
  parseImportPreviewRow,
} from "@/features/collections/parse";
import {
  parseCollectionInventoryQuery,
  parseInventoryImportAfterRow,
} from "@/features/collections/query";
import type { CollectionRpcClient, InventoryBalanceItem } from "@/features/collections/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/app-context", () => ({ getAppContextState: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const PRINTING_ID = "22222222-2222-4222-8222-222222222222";
const TRANSACTION_ID = "33333333-3333-4333-8333-333333333333";

function balance(lastTransactionId = TRANSACTION_ID) {
  return {
    printing: { printingId: PRINTING_ID },
    finish: "nonfoil",
    condition: "near_mint",
    lastTransactionId,
  } as Pick<InventoryBalanceItem, "condition" | "finish" | "lastTransactionId" | "printing">;
}

describe("collection mutation contracts", () => {
  it("reads the nested collection returned by collection_create", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        collection: {
          collection_id: COLLECTION_ID,
          name: "Trade Binder",
        },
        replayed: false,
      },
      error: null,
    });

    await expect(
      createCollectionWithClient({ rpc } as CollectionRpcClient, {
        workspaceId: "44444444-4444-4444-8444-444444444444",
        name: "Trade Binder",
        description: null,
        coverPrintingId: null,
      }),
    ).resolves.toEqual({
      ok: true,
      data: { collectionId: COLLECTION_ID },
    });
  });

  it("keeps an exact quantity retry stable and advances after a committed transaction", () => {
    const first = inventoryEditAttempt(balance());
    expect(inventoryEditAttempt(balance())).toEqual(first);
    expect(
      inventoryEditAttempt(balance("55555555-5555-4555-8555-555555555555")).idempotencyKey,
    ).not.toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toContain(`${TRANSACTION_ID}:${PRINTING_ID}`);
  });

  it("fingerprints the exact bulk selection and body", () => {
    const input = {
      collectionId: COLLECTION_ID,
      destinationCollectionId: "",
      operation: "remove",
      occurredAt: "2026-07-26T12:00:00.000Z",
      note: "Binder cleanup",
      lines: '[{"printingId":"fixture","quantityDelta":-2}]',
      selected: [
        {
          printingId: PRINTING_ID,
          finish: "nonfoil" as const,
          condition: "near_mint" as const,
          lastTransactionId: TRANSACTION_ID,
        },
      ],
    };
    const first = bulkAttemptIdempotencyKey(input);

    expect(bulkAttemptIdempotencyKey({ ...input })).toBe(first);
    expect(
      bulkAttemptIdempotencyKey({
        ...input,
        selected: [
          {
            ...input.selected[0]!,
            lastTransactionId: "66666666-6666-4666-8666-666666666666",
          },
        ],
      }),
    ).not.toBe(first);
    expect(bulkAttemptIdempotencyKey({ ...input, note: "Changed" })).not.toBe(first);
  });

  it("requires and normalizes the persisted import-job creation instant", () => {
    const response = {
      job: {
        import_job_id: "77777777-7777-4777-8777-777777777777",
        collection_id: COLLECTION_ID,
        status: "running",
        created_at: "2026-07-26T12:34:56+00:00",
        staging_completed_at: "2026-07-26T12:35:00+00:00",
        original_filename: "inventory.csv",
        parser_version: "talence-inventory-csv-v1",
        file_sha256: "a".repeat(64),
        storage_path: "workspace/collection/job/inventory.csv",
      },
      counts: {
        total: 0,
        matched: 0,
        ambiguous: 0,
        rejected: 0,
        excluded: 0,
      },
      items: [],
    };

    expect(parseInventoryImportPreview(response)).toMatchObject({
      createdAt: "2026-07-26T12:34:56.000Z",
      canCommit: false,
    });
    expect(
      parseInventoryImportPreview({
        ...response,
        job: { ...response.job, created_at: "not-an-instant" },
      }),
    ).toBeNull();
    expect(
      parseInventoryImportPreview({
        ...response,
        job: {
          ...response.job,
          status: "succeeded",
        },
      }),
    ).toMatchObject({ status: "succeeded", canCommit: false });
  });

  it("rejects an inventory balance without its committed transaction identity", () => {
    expect(
      parseCollectionInventoryResult({
        collection_id: COLLECTION_ID,
        currency: "USD",
        items: [
          {
            finish: "nonfoil",
            condition: "near_mint",
            quantity: 1,
            updated_at: "2026-07-26T12:00:00Z",
            printing: {
              printing_id: PRINTING_ID,
              name: "Fixture",
              set_id: "88888888-8888-4888-8888-888888888888",
              set_code: "TST",
              set_name: "Test Set",
              collector_number: "1",
              language: "en",
              finishes: ["nonfoil"],
            },
          },
        ],
        summary: {
          total_quantity: 1,
          distinct_printings: 1,
          distinct_balances: 1,
          priced_quantity: 0,
          unpriced_quantity: 1,
          stale_quantity: 0,
          total_estimate: null,
          oldest_observed_at: null,
          latest_observed_at: null,
        },
      }),
    ).toBeNull();
  });

  it("parses the actual export RPC identity keys and permits tuple fallback", () => {
    expect(
      parseInventoryExportPage({
        collection_id: COLLECTION_ID,
        items: [
          {
            scryfall_id: null,
            scryfall_oracle_id: "99999999-9999-4999-8999-999999999999",
            display_name: "Fixture",
            set_code: "TST",
            collector_number: "7",
            language: "en",
            finish: "nonfoil",
            condition: "near_mint",
            quantity: 2,
            current_price: null,
          },
        ],
        next_cursor: null,
        has_more: false,
      }),
    ).toMatchObject({
      items: [
        {
          scryfallId: null,
          oracleId: "99999999-9999-4999-8999-999999999999",
          name: "Fixture",
        },
      ],
    });
  });

  it("accepts the last possible source row as an import page cursor", () => {
    expect(parseInventoryImportAfterRow("5001")).toBe(5_001);
    expect(parseInventoryImportAfterRow("5002")).toBe(0);
    expect(parseInventoryImportAfterRow("-1")).toBe(0);
  });

  it("resets a one-character inventory search before the RPC boundary", () => {
    expect(parseCollectionInventoryQuery({ q: "x" })).toMatchObject({
      query: { query: "" },
      notices: [expect.stringContaining("at least two")],
    });
  });

  it("allows an explicit exact-printing override for a valid name-only review row", () => {
    expect(
      canManuallyResolveImportRow({
        rowNumber: 2,
        scryfallId: null,
        oracleId: null,
        name: "Name-only fixture",
        setCode: null,
        collectorNumber: null,
        language: null,
        finish: "nonfoil",
        condition: "near_mint",
        quantity: 1,
        strategy: "set_collector_language",
        errorCode: "set_code_required",
        errorMessage: "Exact identity required.",
        status: "rejected",
        included: false,
        proposedPrintingId: null,
        proposedPrinting: null,
        candidates: [],
        suggestion: "Choose an exact printing.",
      }),
    ).toBe(true);
  });

  it("fails closed on impossible inventory-import job states", () => {
    const base = {
      import_job_id: "77777777-7777-4777-8777-777777777777",
      status: "running",
      storage_bucket: "inventory-imports",
      storage_path: `${COLLECTION_ID}/job/inventory.csv`,
      max_file_bytes: 2 * 1024 * 1024,
      max_rows: 5_000,
      purge_after: "2026-08-02T12:00:00Z",
      staging_completed_at: null,
      replayed: true,
    };

    expect(parseInventoryImportCreate(base)).toMatchObject({
      status: "running",
      stagingCompletedAt: null,
    });
    expect(parseInventoryImportCreate({ ...base, status: "made_up" })).toBeNull();
    expect(
      parseInventoryImportCreate({
        ...base,
        status: "queued",
        staging_completed_at: "2026-07-26T12:00:00Z",
      }),
    ).toBeNull();
    expect(parseInventoryImportCreate({ ...base, status: "succeeded" })).toBeNull();
  });

  it("never exposes a raw inventory idempotency key in history data", () => {
    const rawSecret = "raw-user-supplied-idempotency-key";
    const history = parseInventoryHistoryPage(
      {
        collection_id: COLLECTION_ID,
        items: [
          {
            transaction_id: TRANSACTION_ID,
            collection_id: COLLECTION_ID,
            source: "manual",
            occurred_at: "2026-07-26T12:00:00Z",
            committed_at: "2026-07-26T12:00:01Z",
            idempotency_key: rawSecret,
            idempotency_reference: "sha256:fixture-safe-reference",
            line_count: 1,
            lines_truncated: false,
            lines: [
              {
                line_number: 1,
                printing_id: PRINTING_ID,
                finish: "nonfoil",
                condition: "near_mint",
                quantity_delta: 1,
                quantity_before: 0,
                quantity_after: 1,
              },
            ],
          },
        ],
        next_cursor: null,
      },
      {
        id: COLLECTION_ID,
        workspaceId: "44444444-4444-4444-8444-444444444444",
        name: "Fixture",
        slug: "fixture",
        description: null,
        coverPrintingId: null,
        status: "active",
        isDefault: false,
        createdAt: "2026-07-26T12:00:00Z",
        updatedAt: "2026-07-26T12:00:00Z",
        archivedAt: null,
        deletedAt: null,
      },
    );

    expect(history?.transactions[0]?.idempotencyReference).toBe("sha256:fixture-safe-reference");
    expect(JSON.stringify(history)).not.toContain(rawSecret);
  });

  it("maps the actual import error-detail contract without dumping raw JSON", () => {
    const row = parseImportPreviewRow({
      row_number: 2,
      status: "ambiguous",
      finish: "nonfoil",
      condition: "near_mint",
      quantity: 1,
      error_code: "name_requires_manual_review",
      error_detail: {
        source_secret: "=do-not-render",
      },
      raw: {
        name: "Fixture",
        finish: "nonfoil",
        condition: "near_mint",
        quantity: 1,
      },
      candidates: [],
      suggested_printing_ids: [],
    });

    expect(row?.errorMessage).toContain("requires an explicit");
    expect(JSON.stringify(row)).not.toContain("do-not-render");
    expect(
      parseImportPreviewRow({
        ...row,
        row_number: 3,
        status: "rejected",
        error_code: "future_unknown_code",
        error_detail: { unsafe: "@never" },
      })?.errorMessage,
    ).toBe("This row requires review before it can be included.");
  });

  it("keeps the error-report parser lightweight while preview rows retain candidates", () => {
    const candidate = {
      printing_id: PRINTING_ID,
      name: "Candidate",
      set_id: "44444444-4444-4444-8444-444444444444",
      set_code: "TST",
      set_name: "Test Set",
      collector_number: "1",
      language: "en",
      finishes: ["nonfoil"],
      active: true,
    };
    expect(
      parseImportPreviewRow({
        row_number: 2,
        status: "ambiguous",
        raw: {
          name: "Candidate",
          finish: "nonfoil",
          condition: "near_mint",
          quantity: 1,
        },
        error_code: "name_requires_manual_review",
        candidates: [candidate],
      })?.candidates,
    ).toHaveLength(1);

    const lightweightItem = {
      row_number: 2,
      status: "rejected",
      error_code: "set_collector_language_not_found",
      error_message: "unsafe database message",
      error_detail: { internal: "=never-export" },
      suggested_printing_ids: [PRINTING_ID],
      suggestion: "Choose an exact printing.",
      raw: {
        scryfall_id: null,
        set_code: "TST",
        collector_number: "1",
        language: "en",
        name: "Fixture",
        finish: "nonfoil",
        condition: "near_mint",
        quantity: "1",
      },
    };
    const page = parseInventoryImportErrorReportPage({
      items: [lightweightItem],
      after_row_number: 0,
      previous_after_row_number: null,
      has_more: false,
      next_after_row_number: null,
    });

    expect(page).toMatchObject({
      rows: [
        {
          rowNumber: 2,
          errorMessage: "Set, collector number, and language did not match an active printing.",
          raw: { name: "Fixture", quantity: "1" },
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain("unsafe database");
    expect(JSON.stringify(page)).not.toContain("never-export");
    expect(JSON.stringify(page)).not.toContain(PRINTING_ID);
    expect(
      parseInventoryImportErrorReportPage({
        items: [{ ...lightweightItem, candidates: [candidate] }],
        after_row_number: 0,
        previous_after_row_number: null,
        has_more: false,
        next_after_row_number: null,
      }),
    ).toBeNull();
  });
});
