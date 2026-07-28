import "server-only";

import { randomUUID } from "node:crypto";

import type { CollectionView } from "./types";

import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_FUNCTIONS, DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticCollectionPreviewEnabled } from "./config";
import {
  parseCollectionAnalytics,
  parseCollectionDetail,
  parseCollectionInventoryResult,
  parseCollectionListPage,
  parseInventoryExportPage,
  parseInventoryHistoryPage,
  parseInventoryTransactionLinesPage,
  parseInventoryImportErrorReportPage,
  parseInventoryImportPreview,
  type InventoryExportPage,
} from "./parse";
import {
  PREVIEW_COLLECTION_ID,
  PREVIEW_WORKSPACE_ID,
  previewCollectionAnalytics,
  previewCollectionDetail,
  previewCollectionHistory,
  previewCollectionInventory,
  previewCollectionList,
} from "./preview";
import type {
  CollectionAnalytics,
  CollectionDetail,
  CollectionInventoryPage,
  CollectionInventoryQuery,
  CollectionListPage,
  CollectionLoadFailureReason,
  CollectionLoadResult,
  CollectionRpcClient,
  InventoryHistoryPage,
  InventoryExportRow,
  InventoryImportErrorReportPage,
  InventoryImportPreview,
  InventoryTransactionLinesPage,
} from "./types";

type Parser<T> = (value: unknown) => T | null;

interface CollectionScope {
  workspaceId: string;
  defaultCollectionId: string | null;
  currency: string;
  preview: boolean;
}

function asRpcClient(value: unknown): CollectionRpcClient {
  return value as CollectionRpcClient;
}

function warnCollectionFailure(code: string, requestId: string): void {
  writeSecurityLog("warn", "collection.read.failed", {
    code,
    request_id: requestId,
  });
}

function errorReason(
  code: string | undefined,
  message: string | undefined,
): CollectionLoadFailureReason {
  const combined = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (
    code === "42501" ||
    combined.includes("permission") ||
    combined.includes("denied") ||
    combined.includes("forbidden") ||
    combined.includes("access")
  ) {
    return "permission_denied";
  }
  if (combined.includes("not_found")) return "not_found";
  return "request_failed";
}

async function rpcLoad<T>(
  client: CollectionRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  parser: Parser<T>,
): Promise<CollectionLoadResult<T>> {
  const requestId = randomUUID();
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) {
      warnCollectionFailure(result.error.code ?? "rpc_error", requestId);
      return {
        ok: false,
        reason: errorReason(result.error.code, result.error.message),
        requestId,
      };
    }
    const parsed = parser(result.data);
    if (!parsed) {
      warnCollectionFailure("invalid_response", requestId);
      return { ok: false, reason: "invalid_response", requestId };
    }
    return { ok: true, data: parsed, preview: false };
  } catch {
    warnCollectionFailure("rpc_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
}

async function currentScope(): Promise<
  { ok: true; scope: CollectionScope } | { ok: false; result: CollectionLoadResult<never> }
> {
  const requestId = randomUUID();
  try {
    const state = await getAppContextState();
    if (state.status === "ready") {
      return {
        ok: true,
        scope: {
          workspaceId: state.context.workspace.id,
          defaultCollectionId: state.context.profile.default_collection_id,
          currency: state.context.profile.preferred_currency,
          preview: false,
        },
      };
    }
    if (state.status === "unconfigured" && staticCollectionPreviewEnabled()) {
      return {
        ok: true,
        scope: {
          workspaceId: PREVIEW_WORKSPACE_ID,
          defaultCollectionId: PREVIEW_COLLECTION_ID,
          currency: "USD",
          preview: true,
        },
      };
    }
    return {
      ok: false,
      result: {
        ok: false,
        reason: state.status === "unconfigured" ? "configuration_required" : "permission_denied",
        requestId,
      },
    };
  } catch {
    return {
      ok: false,
      result: { ok: false, reason: "request_failed", requestId },
    };
  }
}

async function userClient(): Promise<CollectionRpcClient | null> {
  const client = await createServerSupabaseClient();
  return client ? asRpcClient(client) : null;
}

export async function loadCollectionListWithClient(
  client: CollectionRpcClient,
  workspaceId: string,
  includeArchived: boolean,
  defaultCollectionId: string | null,
  cursor: string | null = null,
  status: "active" | "archived" | null = null,
  limit = 40,
): Promise<CollectionLoadResult<CollectionListPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionList,
    {
      p_workspace_id: workspaceId,
      p_include_archived: includeArchived,
      p_after: cursor,
      p_limit: limit,
      p_status: status,
    },
    (value) => parseCollectionListPage(value, defaultCollectionId),
  );
}

export async function loadCollectionList(
  includeArchived: boolean,
  cursor: string | null = null,
  status: "active" | "archived" | null = null,
  limit = 40,
): Promise<CollectionLoadResult<CollectionListPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const page = previewCollectionList(includeArchived, scoped.scope.defaultCollectionId);
    return {
      ok: true,
      data:
        status === null
          ? page
          : {
              ...page,
              items: page.items.filter((item) => item.status === status),
              nextCursor: null,
              hasMore: false,
            },
      preview: true,
    };
  }
  const client = await userClient();
  if (!client) {
    return {
      ok: false,
      reason: "configuration_required",
      requestId: randomUUID(),
    };
  }
  return loadCollectionListWithClient(
    client,
    scoped.scope.workspaceId,
    includeArchived,
    scoped.scope.defaultCollectionId,
    cursor,
    status,
    limit,
  );
}

export async function loadCollectionDetailWithClient(
  client: CollectionRpcClient,
  collectionId: string,
  currency: string,
  defaultCollectionId: string | null,
): Promise<CollectionLoadResult<CollectionDetail>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionDetail,
    { p_collection_id: collectionId, p_currency: currency },
    (value) => parseCollectionDetail(value, defaultCollectionId),
  );
}

export async function loadCollectionDetail(
  collectionId: string,
): Promise<CollectionLoadResult<CollectionDetail>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const data = previewCollectionDetail(collectionId, scoped.scope.defaultCollectionId);
    return data
      ? { ok: true, data, preview: true }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  return loadCollectionDetailWithClient(
    client,
    collectionId,
    scoped.scope.currency,
    scoped.scope.defaultCollectionId,
  );
}

export async function loadCollectionInventoryWithClient(
  client: CollectionRpcClient,
  collectionId: string,
  currency: string,
  query: CollectionInventoryQuery,
): Promise<
  CollectionLoadResult<
    ReturnType<typeof parseCollectionInventoryResult> extends infer T ? Exclude<T, null> : never
  >
> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionInventoryPage,
    {
      p_collection_id: collectionId,
      p_query: query.query || null,
      p_set_code: query.setCode || null,
      p_finish: query.finish || null,
      p_condition: query.condition || null,
      p_sort: query.sort,
      p_after: query.cursor,
      p_limit: 50,
      p_currency: currency,
    },
    parseCollectionInventoryResult,
  );
}

export async function loadCollectionInventoryPage(
  collectionId: string,
  query: CollectionInventoryQuery,
): Promise<CollectionLoadResult<CollectionInventoryPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const detail = previewCollectionDetail(collectionId, scoped.scope.defaultCollectionId);
    const inventory = previewCollectionInventory(collectionId, query);
    if (!detail || !inventory) {
      return { ok: false, reason: "not_found", requestId: randomUUID() };
    }
    return {
      ok: true,
      preview: true,
      data: {
        collection: detail.collection,
        balances: inventory.balances,
        summary: detail.summary,
        nextCursor: inventory.nextCursor,
        resultCount: inventory.resultCount,
        totalCount: inventory.resultCount,
      },
    };
  }

  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  const [detail, inventory] = await Promise.all([
    loadCollectionDetailWithClient(
      client,
      collectionId,
      scoped.scope.currency,
      scoped.scope.defaultCollectionId,
    ),
    loadCollectionInventoryWithClient(client, collectionId, scoped.scope.currency, query),
  ]);
  if (!detail.ok) return detail;
  if (!inventory.ok) return inventory;
  return {
    ok: true,
    preview: false,
    data: {
      collection: detail.data.collection,
      balances: inventory.data.balances,
      summary: detail.data.summary,
      nextCursor: inventory.data.nextCursor,
      resultCount: inventory.data.resultCount,
      totalCount: null,
    },
  };
}

export async function loadCollectionAnalyticsWithClient(
  client: CollectionRpcClient,
  collectionId: string,
  currency: string,
  query: CollectionInventoryQuery,
): Promise<CollectionLoadResult<CollectionAnalytics>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionAnalytics,
    {
      p_collection_id: collectionId,
      p_query: query.query || null,
      p_set_code: query.setCode || null,
      p_finish: query.finish || null,
      p_condition: query.condition || null,
      p_currency: currency,
    },
    parseCollectionAnalytics,
  );
}

export async function loadCollectionAnalytics(
  collectionId: string,
  query: CollectionInventoryQuery,
): Promise<CollectionLoadResult<CollectionAnalytics>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const data = previewCollectionAnalytics(collectionId, query);
    return data
      ? { ok: true, data, preview: true }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  const requestId = randomUUID();
  try {
    const reservation = await client.rpc(DATABASE_FUNCTIONS.consumeApplicationFeatureQuota, {
      p_feature_key: "collection_analytics",
      p_workspace_id: scoped.scope.workspaceId,
      p_units: 5_000,
      p_correlation_id: requestId,
    });
    if (reservation.error) {
      const source =
        `${reservation.error.code ?? ""} ${reservation.error.message ?? ""}`.toLowerCase();
      warnCollectionFailure(
        source.includes("quota_exceeded")
          ? "collection_analytics_rate_limited"
          : source.includes("feature_disabled")
            ? "collection_analytics_disabled"
            : "collection_analytics_quota_unavailable",
        requestId,
      );
      return { ok: false, reason: "request_failed", requestId };
    }
  } catch {
    warnCollectionFailure("collection_analytics_quota_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
  return loadCollectionAnalyticsWithClient(client, collectionId, scoped.scope.currency, query);
}

export async function loadCollectionHistoryWithClient(
  client: CollectionRpcClient,
  detail: CollectionDetail,
  cursor: string | null = null,
): Promise<CollectionLoadResult<InventoryHistoryPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionTransactionHistory,
    { p_collection_id: detail.collection.id, p_after: cursor, p_limit: 50 },
    (value) => parseInventoryHistoryPage(value, detail.collection),
  );
}

export async function loadCollectionHistory(
  collectionId: string,
  cursor: string | null = null,
): Promise<CollectionLoadResult<InventoryHistoryPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const data = previewCollectionHistory(collectionId);
    return data
      ? { ok: true, data, preview: true }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  const detail = await loadCollectionDetailWithClient(
    client,
    collectionId,
    scoped.scope.currency,
    scoped.scope.defaultCollectionId,
  );
  return detail.ok ? loadCollectionHistoryWithClient(client, detail.data, cursor) : detail;
}

export async function loadCollectionTransactionLinesWithClient(
  client: CollectionRpcClient,
  collectionId: string,
  transactionId: string,
  afterLineNumber = 0,
): Promise<CollectionLoadResult<InventoryTransactionLinesPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionTransactionLines,
    {
      p_transaction_id: transactionId,
      p_after_line_number: afterLineNumber,
      p_limit: 100,
    },
    (value) => {
      const page = parseInventoryTransactionLinesPage(value);
      return page && page.collectionId === collectionId && page.transactionId === transactionId
        ? page
        : null;
    },
  );
}

export async function loadCollectionTransactionLines(
  collectionId: string,
  transactionId: string,
  afterLineNumber = 0,
): Promise<CollectionLoadResult<InventoryTransactionLinesPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const history = previewCollectionHistory(collectionId);
    const transaction = history?.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return { ok: false, reason: "not_found", requestId: randomUUID() };
    }
    const remaining = transaction.lines.filter((line) => line.lineNumber > afterLineNumber);
    const lines = remaining.slice(0, 100);
    const hasMore = remaining.length > lines.length;
    return {
      ok: true,
      preview: true,
      data: {
        transactionId,
        collectionId,
        lineCount: transaction.lineCount,
        afterLineNumber,
        lines,
        nextAfterLineNumber: hasMore ? (lines.at(-1)?.lineNumber ?? null) : null,
        hasMore,
      },
    };
  }
  const client = await userClient();
  if (!client) {
    return {
      ok: false,
      reason: "configuration_required",
      requestId: randomUUID(),
    };
  }
  return loadCollectionTransactionLinesWithClient(
    client,
    collectionId,
    transactionId,
    afterLineNumber,
  );
}

export async function loadInventoryImportPreviewWithClient(
  client: CollectionRpcClient,
  importJobId: string,
  afterRowNumber = 0,
  limit = 100,
): Promise<CollectionLoadResult<InventoryImportPreview>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.inventoryImportPreview,
    {
      p_import_job_id: importJobId,
      p_after_row_number: afterRowNumber,
      p_limit: limit,
    },
    parseInventoryImportPreview,
  );
}

export async function loadInventoryImportPreview(
  importJobId: string,
  afterRowNumber = 0,
  limit = 100,
): Promise<CollectionLoadResult<InventoryImportPreview>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    return { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  return loadInventoryImportPreviewWithClient(
    client,
    importJobId,
    afterRowNumber,
    Math.min(Math.max(limit, 1), 100),
  );
}

export async function loadInventoryImportErrorReportPageWithClient(
  client: CollectionRpcClient,
  importJobId: string,
  afterRowNumber: number,
): Promise<CollectionLoadResult<InventoryImportErrorReportPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.inventoryImportErrorReport,
    {
      p_import_job_id: importJobId,
      p_after_row_number: afterRowNumber,
      p_limit: 500,
    },
    parseInventoryImportErrorReportPage,
  );
}

export interface InventoryImportErrorReportPageReader {
  firstPage: InventoryImportErrorReportPage;
  loadPage(afterRowNumber: number): Promise<CollectionLoadResult<InventoryImportErrorReportPage>>;
}

export async function openInventoryImportErrorReportPageReader(
  importJobId: string,
): Promise<CollectionLoadResult<InventoryImportErrorReportPageReader>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    return { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  if (!client) {
    return {
      ok: false,
      reason: "configuration_required",
      requestId: randomUUID(),
    };
  }
  const rpcClient = asRpcClient(client);
  const firstPage = await loadInventoryImportErrorReportPageWithClient(rpcClient, importJobId, 0);
  if (!firstPage.ok) return firstPage;
  if (firstPage.data.afterRowNumber !== 0) {
    return { ok: false, reason: "invalid_response", requestId: randomUUID() };
  }
  return {
    ok: true,
    preview: false,
    data: {
      firstPage: firstPage.data,
      loadPage: (afterRowNumber) =>
        loadInventoryImportErrorReportPageWithClient(rpcClient, importJobId, afterRowNumber),
    },
  };
}

export async function loadCollectionViewPreference(): Promise<CollectionView> {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return "structured";
    const result = await client
      .from(DATABASE_TABLES.userPreferences)
      .select("collection_view")
      .maybeSingle();
    const view = result.data?.collection_view;
    return !result.error && (view === "gallery" || view === "analytical") ? view : "structured";
  } catch {
    return "structured";
  }
}

export async function loadInventoryExportPageWithClient(
  client: CollectionRpcClient,
  collectionId: string,
  cursor: string | null,
): Promise<CollectionLoadResult<InventoryExportPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.collectionInventoryExport,
    { p_collection_id: collectionId, p_after: cursor, p_limit: 1_000 },
    parseInventoryExportPage,
  );
}

export interface CollectionExportPageReader {
  firstPage: InventoryExportPage;
  loadPage(cursor: string): Promise<CollectionLoadResult<InventoryExportPage>>;
}

function previewInventoryExportRows(collectionId: string): InventoryExportRow[] | null {
  const preview = previewCollectionInventory(collectionId);
  if (!preview) return null;
  return preview.balances.map((item) => ({
    scryfallId: item.printing.printingId,
    oracleId: item.printing.cardId,
    name: item.printing.name,
    setCode: item.printing.setCode,
    collectorNumber: item.printing.collectorNumber,
    language: item.printing.language,
    finish: item.finish,
    condition: item.condition,
    quantity: item.quantity,
    price: item.price.unit
      ? {
          provider: item.price.unit.provider,
          currency: item.price.unit.currency,
          amount: item.price.unit.amount,
          observedAt: item.price.unit.observedAt,
          ingestedAt: item.price.unit.ingestedAt,
          staleAfter: item.price.unit.staleAfter ?? null,
        }
      : null,
  }));
}

export async function openCollectionExportPageReader(
  collectionId: string,
): Promise<CollectionLoadResult<CollectionExportPageReader>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const items = previewInventoryExportRows(collectionId);
    if (!items) {
      return { ok: false, reason: "not_found", requestId: randomUUID() };
    }
    return {
      ok: true,
      preview: true,
      data: {
        firstPage: {
          collectionId,
          items,
          nextCursor: null,
          hasMore: false,
        },
        loadPage: async () => ({
          ok: false,
          reason: "request_failed",
          requestId: randomUUID(),
        }),
      },
    };
  }
  const client = await userClient();
  if (!client) {
    return { ok: false, reason: "configuration_required", requestId: randomUUID() };
  }
  const rpcClient = asRpcClient(client);
  const firstPage = await loadInventoryExportPageWithClient(rpcClient, collectionId, null);
  if (!firstPage.ok) return firstPage;
  if (
    firstPage.data.collectionId !== collectionId ||
    (firstPage.data.hasMore && firstPage.data.items.length === 0)
  ) {
    return { ok: false, reason: "invalid_response", requestId: randomUUID() };
  }
  return {
    ok: true,
    preview: false,
    data: {
      firstPage: firstPage.data,
      loadPage: (cursor) => loadInventoryExportPageWithClient(rpcClient, collectionId, cursor),
    },
  };
}
