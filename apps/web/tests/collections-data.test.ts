import { describe, expect, it, vi } from "vitest";

import {
  loadCollectionAnalyticsWithClient,
  loadCollectionDetailWithClient,
  loadCollectionListWithClient,
  loadCollectionTransactionLinesWithClient,
  loadInventoryExportPageWithClient,
  loadInventoryImportErrorReportPageWithClient,
  loadInventoryImportPreviewWithClient,
} from "@/features/collections/data";
import { createInventoryExportStream } from "@/features/collections/export-stream";
import { createInventoryImportErrorStream } from "@/features/collections/import-error-stream";
import type { CollectionRpcClient } from "@/features/collections/types";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

function analyticsEnvelope(filters: Record<string, unknown>) {
  return {
    collection_id: COLLECTION_ID,
    currency: "USD",
    filters,
    quantity_total: 1,
    priced_quantity: 1,
    unpriced_quantity: 0,
    stale_quantity: 0,
    estimated_value: "25000.0000",
    price_providers: ["scryfall"],
    oldest_price_observed_at: "2026-07-26T12:00:00Z",
    latest_price_observed_at: "2026-07-26T12:00:00Z",
    oldest_price_ingested_at: "2026-07-26T12:30:00Z",
    latest_price_ingested_at: "2026-07-26T12:30:00Z",
    groups: {
      sets: [],
      colors: [],
      color_identities: [],
      rarities: [],
      finishes: [],
      conditions: [],
      value_tiers: [],
    },
  };
}

function stagedRow(rowNumber: number) {
  return {
    row_number: rowNumber,
    status: "rejected",
    raw: {
      scryfall_id: "33333333-3333-4333-8333-333333333333",
      name: `Fixture ${rowNumber}`,
      finish: "nonfoil",
      condition: "near_mint",
      quantity: 1,
    },
    error_code: "printing_not_found",
    error_message: "No exact active printing matched.",
    candidates: [],
  };
}

function errorReportRow(rowNumber: number) {
  return {
    row_number: rowNumber,
    status: "rejected",
    raw: {
      scryfall_id: "33333333-3333-4333-8333-333333333333",
      set_code: null,
      collector_number: null,
      language: null,
      name: `Fixture ${rowNumber}`,
      finish: "nonfoil",
      condition: "near_mint",
      quantity: "1",
    },
    error_code: "set_collector_language_not_found",
    error_message: "database detail that must not reach the CSV",
    error_detail: { private: "diagnostic" },
    suggested_printing_ids: [],
    suggestion: null,
  };
}

function previewEnvelope(after: number, total: number, limit: number) {
  const end = Math.min(total, after + limit);
  return {
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
      total,
      matched: 0,
      ambiguous: 0,
      rejected: total,
      excluded: 0,
    },
    after_row_number: after,
    previous_after_row_number: after === 0 ? null : Math.max(0, after - limit),
    items: Array.from({ length: end - after }, (_, index) => stagedRow(after + index + 1)),
    has_more: end < total,
    next_after_row_number: end < total ? end : null,
  };
}

describe("collection import pagination", () => {
  it("loads URL-addressable preview rows beyond the first 100", async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: previewEnvelope(Number(args.p_after_row_number), 150, Number(args.p_limit)),
      error: null,
    }));
    const client = { rpc } as CollectionRpcClient;

    const first = await loadInventoryImportPreviewWithClient(client, JOB_ID, 0);
    expect(first).toMatchObject({
      ok: true,
      data: {
        rows: { length: 100 },
        afterRowNumber: 0,
        nextAfterRowNumber: 100,
        hasMore: true,
      },
    });

    const second = await loadInventoryImportPreviewWithClient(client, JOB_ID, 100);
    expect(second).toMatchObject({
      ok: true,
      data: {
        rows: { length: 50 },
        afterRowNumber: 100,
        nextAfterRowNumber: null,
        hasMore: false,
      },
    });
    expect(rpc).toHaveBeenLastCalledWith(DATABASE_FUNCTIONS.inventoryImportPreview, {
      p_import_job_id: JOB_ID,
      p_after_row_number: 100,
      p_limit: 100,
    });
  });

  it("streams every lightweight error-report page without rich preview candidates", async () => {
    const total = 650;
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const after = Number(args.p_after_row_number);
      const limit = Number(args.p_limit);
      const end = Math.min(total, after + limit);
      return {
        data: {
          after_row_number: after,
          previous_after_row_number: after === 0 ? null : Math.max(0, after - limit),
          items: Array.from({ length: end - after }, (_, index) =>
            errorReportRow(after + index + 1),
          ),
          has_more: end < total,
          next_after_row_number: end < total ? end : null,
        },
        error: null,
      };
    });
    const client = { rpc } as CollectionRpcClient;
    const first = await loadInventoryImportErrorReportPageWithClient(client, JOB_ID, 0);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first error-report page.");
    const report = await new Response(
      createInventoryImportErrorStream({
        firstPage: first.data,
        loadPage: (afterRowNumber) =>
          loadInventoryImportErrorReportPageWithClient(client, JOB_ID, afterRowNumber),
      }),
    ).text();

    expect(report.trim().split("\r\n")).toHaveLength(total + 1);
    expect(report).toContain(
      "Set, collector number, and language did not match an active printing.",
    );
    expect(report).not.toContain("database detail");
    expect(report).not.toContain("diagnostic");
    expect(report).not.toContain("candidates");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, DATABASE_FUNCTIONS.inventoryImportErrorReport, {
      p_import_job_id: JOB_ID,
      p_after_row_number: 500,
      p_limit: 500,
    });
  });

  it("rejects an error-report first page that does not start at cursor zero", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        after_row_number: 7,
        previous_after_row_number: 0,
        items: [errorReportRow(8)],
        has_more: false,
        next_after_row_number: null,
      },
      error: null,
    });
    const first = await loadInventoryImportErrorReportPageWithClient(
      { rpc } as CollectionRpcClient,
      JOB_ID,
      0,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected parsed fixture page.");

    await expect(
      new Response(
        createInventoryImportErrorStream({
          firstPage: first.data,
          loadPage: vi.fn(),
        }),
      ).text(),
    ).rejects.toThrow("Invalid inventory import error page.");
  });

  it("preserves the server cursor for a sparse previous preview page", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...previewEnvelope(0, 0, 100),
        after_row_number: 250,
        previous_after_row_number: 17,
        items: [stagedRow(400)],
        has_more: false,
        next_after_row_number: null,
      },
      error: null,
    });

    const page = await loadInventoryImportPreviewWithClient(
      { rpc } as CollectionRpcClient,
      JOB_ID,
      250,
    );

    expect(page).toMatchObject({
      ok: true,
      data: {
        afterRowNumber: 250,
        previousAfterRowNumber: 17,
      },
    });
  });
});

describe("collection status pagination", () => {
  it("filters archived collections before applying the 40-row page bound", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      collection_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
      workspace_id: COLLECTION_ID,
      name: `Collection ${String(index).padStart(3, "0")}`,
      slug: `collection-${index}`,
      status: index % 2 === 0 ? "active" : "archived",
      created_at: "2026-07-26T12:00:00Z",
      updated_at: "2026-07-26T12:00:00Z",
      quantity_total: 0,
      unique_printings: 0,
      estimated_value: null,
      price_providers: [],
      unpriced_quantity: 0,
      currency: "USD",
      permissions: {
        can_edit: true,
        can_archive: index % 2 === 0,
        can_delete: false,
      },
    }));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const filtered = rows.filter((row) => args.p_status === null || row.status === args.p_status);
      return {
        data: {
          workspace_id: COLLECTION_ID,
          permissions: { can_create: true },
          items: filtered.slice(0, Number(args.p_limit)),
          next_cursor: filtered.length > Number(args.p_limit) ? "next_page" : null,
          has_more: filtered.length > Number(args.p_limit),
        },
        error: null,
      };
    });

    const page = await loadCollectionListWithClient(
      { rpc } as CollectionRpcClient,
      COLLECTION_ID,
      true,
      null,
      null,
      "archived",
    );

    expect(page.ok && page.data.items).toHaveLength(40);
    expect(page.ok && page.data.items.every((item) => item.status === "archived")).toBe(true);
    expect(rpc).toHaveBeenCalledWith(DATABASE_FUNCTIONS.collectionList, {
      p_workspace_id: COLLECTION_ID,
      p_include_archived: true,
      p_after: null,
      p_limit: 40,
      p_status: "archived",
    });
  });
});

describe("filtered collection analytics", () => {
  it("passes every inventory filter to the query-aware database aggregate", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: analyticsEnvelope({
        query: "black lotus",
        set_code: "lea",
        finish: "nonfoil",
        condition: "near_mint",
      }),
      error: null,
    });

    const result = await loadCollectionAnalyticsWithClient(
      { rpc } as CollectionRpcClient,
      COLLECTION_ID,
      "USD",
      {
        query: "Black Lotus",
        setCode: "LEA",
        finish: "nonfoil",
        condition: "near_mint",
        sort: "value_desc",
        cursor: "ignored_cursor",
        view: "analytical",
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        filters: {
          query: "black lotus",
          setCode: "lea",
          finish: "nonfoil",
          condition: "near_mint",
        },
        quantityTotal: 1,
        estimatedValue: "25000.0000",
      },
    });
    expect(rpc).toHaveBeenCalledWith(DATABASE_FUNCTIONS.collectionAnalytics, {
      p_collection_id: COLLECTION_ID,
      p_query: "Black Lotus",
      p_set_code: "LEA",
      p_finish: "nonfoil",
      p_condition: "near_mint",
      p_currency: "USD",
    });
  });

  it("rejects analytics responses that omit the server-confirmed filter scope", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: analyticsEnvelope({}),
      error: null,
    });

    const result = await loadCollectionAnalyticsWithClient(
      { rpc } as CollectionRpcClient,
      COLLECTION_ID,
      "USD",
      {
        query: "",
        setCode: "",
        finish: "",
        condition: "",
        sort: "name",
        cursor: null,
        view: "analytical",
      },
    );

    expect(result).toMatchObject({ ok: false, reason: "invalid_response" });
  });
});

describe("collection export pagination", () => {
  function exportItem(index: number) {
    return {
      scryfall_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
      scryfall_oracle_id: null,
      display_name: `Export ${index}`,
      set_code: "TST",
      collector_number: String(index),
      language: "en",
      finish: "nonfoil",
      condition: "near_mint",
      quantity: 1,
      current_price: null,
    };
  }

  it("loads every export cursor without an arbitrary page ceiling", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(1)],
          next_cursor: "cursor_one",
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(2)],
          next_cursor: "cursor_two",
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(3)],
          next_cursor: null,
          has_more: false,
        },
        error: null,
      });

    const client = { rpc } as CollectionRpcClient;
    const first = await loadInventoryExportPageWithClient(client, COLLECTION_ID, null);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first export page.");
    const csv = await new Response(
      createInventoryExportStream({
        collectionId: COLLECTION_ID,
        firstPage: first.data,
        loadPage: (cursor) => loadInventoryExportPageWithClient(client, COLLECTION_ID, cursor),
      }),
    ).text();

    expect(csv).toContain("Export 1");
    expect(csv).toContain("Export 2");
    expect(csv).toContain("Export 3");
    expect(csv.trim().split("\r\n")).toHaveLength(4);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("fails safely when export cursors form a multi-page cycle", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(1)],
          next_cursor: "cursor_a",
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(2)],
          next_cursor: "cursor_b",
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          collection_id: COLLECTION_ID,
          items: [exportItem(3)],
          next_cursor: "cursor_a",
          has_more: true,
        },
        error: null,
      });
    const client = { rpc } as CollectionRpcClient;
    const first = await loadInventoryExportPageWithClient(client, COLLECTION_ID, null);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first export page.");
    const response = new Response(
      createInventoryExportStream({
        collectionId: COLLECTION_ID,
        firstPage: first.data,
        loadPage: (cursor) => loadInventoryExportPageWithClient(client, COLLECTION_ID, cursor),
      }),
    );

    await expect(response.text()).rejects.toThrow("Collection export cursor did not advance.");
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe("collection read error classification", () => {
  it("uses the canonical not-found message when PostgreSQL reports P0002", async () => {
    const result = await loadCollectionDetailWithClient(
      {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "P0002",
            message: "talence_collection_not_found",
          },
        }),
      } as CollectionRpcClient,
      COLLECTION_ID,
      "USD",
      null,
    );

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
    expect(JSON.stringify(result)).not.toContain("talence_collection_not_found");
  });

  it("classifies canonical denied messages without exposing them", async () => {
    const result = await loadCollectionDetailWithClient(
      {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "P0001",
            message: "talence_collection_access_denied",
          },
        }),
      } as CollectionRpcClient,
      COLLECTION_ID,
      "USD",
      null,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "permission_denied",
    });
    expect(JSON.stringify(result)).not.toContain("talence_collection_access_denied");
  });
});

describe("transaction line pagination", () => {
  it("loads a bounded exact line page for a large transaction", async () => {
    const transactionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const rpc = vi.fn().mockResolvedValue({
      data: {
        transaction_id: transactionId,
        collection_id: COLLECTION_ID,
        line_count: 5_000,
        after_line_number: 0,
        items: Array.from({ length: 100 }, (_, index) => ({
          line_number: index + 1,
          printing_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          display_name: `Line ${index + 1}`,
          set_code: "TST",
          collector_number: String(index + 1),
          language: "en",
          finish: "nonfoil",
          condition: "near_mint",
          quantity_delta: 1,
          quantity_before: 0,
          quantity_after: 1,
        })),
        next_after_line_number: 100,
        has_more: true,
      },
      error: null,
    });

    const page = await loadCollectionTransactionLinesWithClient(
      { rpc } as CollectionRpcClient,
      COLLECTION_ID,
      transactionId,
    );

    expect(page).toMatchObject({
      ok: true,
      data: {
        lineCount: 5_000,
        lines: { length: 100 },
        nextAfterLineNumber: 100,
        hasMore: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith(DATABASE_FUNCTIONS.collectionTransactionLines, {
      p_transaction_id: transactionId,
      p_after_line_number: 0,
      p_limit: 100,
    });
  });
});
