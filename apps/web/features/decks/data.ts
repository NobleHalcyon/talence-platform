import "server-only";

import { randomUUID } from "node:crypto";

import type { DeckZone } from "@talence/domain";

import { loadCollectionList } from "@/features/collections/data";
import type { CollectionListPage, CollectionLoadResult } from "@/features/collections/types";
import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticDeckPreviewEnabled } from "./config";
import {
  parseDeckCatalogSearchPage,
  parseDeckCardPrintingsPage,
  parseDeckDetail,
  parseDeckExport,
  parseDeckFormatsResponse,
  parseDeckListPage,
  type DeckExportPayload,
} from "./parse";
import {
  previewDeckCatalogSearch,
  previewDeckCardPrintings,
  previewDeckDetail,
  previewDeckFormats,
  previewDeckList,
} from "./preview";
import type {
  DeckCatalogSearchPage,
  DeckCardPrintingsPage,
  DeckDetail,
  DeckFormat,
  DeckListPage,
  DeckLoadFailureReason,
  DeckLoadResult,
  DeckRpcClient,
  DeckStatusFilter,
} from "./types";

interface DeckScope {
  workspaceId: string;
  currency: string;
  preview: boolean;
}

type Parser<T> = (value: unknown) => T | null;

export const DECK_SOURCE_COLLECTION_PAGE_SIZE = 100;
/**
 * Source selection is deliberately fail-closed above this bounded workspace
 * universe so server rendering cannot perform an unbounded page drain.
 */
export const DECK_SOURCE_COLLECTION_CAP = 500;

type CollectionPageLoader = (
  includeArchived: boolean,
  cursor: string | null,
  status: "active" | "archived" | null,
  limit: number,
) => Promise<CollectionLoadResult<CollectionListPage>>;

function invalidCollectionUniverse(): CollectionLoadResult<CollectionListPage> {
  return {
    ok: false,
    reason: "invalid_response",
    requestId: randomUUID(),
  };
}

export async function loadDeckSourceCollectionsWithLoader(
  loader: CollectionPageLoader,
  includeArchived: boolean,
): Promise<CollectionLoadResult<CollectionListPage>> {
  let cursor: string | null = null;
  let firstPage: CollectionListPage | null = null;
  let preview = false;
  const items: CollectionListPage["items"] = [];
  const itemIds = new Set<string>();
  const cursors = new Set<string>();

  for (;;) {
    const result = await loader(includeArchived, cursor, null, DECK_SOURCE_COLLECTION_PAGE_SIZE);
    if (!result.ok) return result;
    const page = result.data;
    preview ||= result.preview;
    firstPage ??= page;
    if (
      page.workspaceId !== firstPage.workspaceId ||
      page.permissions.canCreate !== firstPage.permissions.canCreate ||
      page.hasMore !== Boolean(page.nextCursor) ||
      (page.hasMore && page.items.length === 0) ||
      items.length + page.items.length > DECK_SOURCE_COLLECTION_CAP
    ) {
      return invalidCollectionUniverse();
    }
    for (const item of page.items) {
      if (
        itemIds.has(item.id) ||
        item.workspaceId !== firstPage.workspaceId ||
        item.status === "deleted" ||
        (!includeArchived && item.status !== "active")
      ) {
        return invalidCollectionUniverse();
      }
      itemIds.add(item.id);
      items.push(item);
    }
    if (!page.hasMore) {
      return {
        ok: true,
        preview,
        data: {
          workspaceId: firstPage.workspaceId,
          permissions: firstPage.permissions,
          items,
          nextCursor: null,
          hasMore: false,
        },
      };
    }
    if (
      !page.nextCursor ||
      cursors.has(page.nextCursor) ||
      items.length >= DECK_SOURCE_COLLECTION_CAP
    ) {
      return invalidCollectionUniverse();
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function loadDeckSourceCollections(
  includeArchived: boolean,
): Promise<CollectionLoadResult<CollectionListPage>> {
  return loadDeckSourceCollectionsWithLoader(loadCollectionList, includeArchived);
}

function asRpcClient(value: unknown): DeckRpcClient {
  return value as DeckRpcClient;
}

function warnDeckFailure(code: string, requestId: string): void {
  writeSecurityLog("warn", "deck.read.failed", {
    code,
    request_id: requestId,
  });
}

function failureReason(code?: string, message?: string): DeckLoadFailureReason {
  const combined = `${code ?? ""} ${message ?? ""}`.toLocaleLowerCase("en-US");
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
  client: DeckRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  parser: Parser<T>,
): Promise<DeckLoadResult<T>> {
  const requestId = randomUUID();
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) {
      warnDeckFailure(result.error.code ?? "rpc_error", requestId);
      return {
        ok: false,
        reason: failureReason(result.error.code, result.error.message),
        requestId,
      };
    }
    const parsed = parser(result.data);
    if (!parsed) {
      warnDeckFailure("invalid_response", requestId);
      return { ok: false, reason: "invalid_response", requestId };
    }
    return { ok: true, data: parsed, preview: false };
  } catch {
    warnDeckFailure("rpc_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
}

async function currentScope(): Promise<
  { ok: true; scope: DeckScope } | { ok: false; result: DeckLoadResult<never> }
> {
  const requestId = randomUUID();
  try {
    const state = await getAppContextState();
    if (state.status === "ready") {
      return {
        ok: true,
        scope: {
          workspaceId: state.context.workspace.id,
          currency: state.context.profile.preferred_currency,
          preview: false,
        },
      };
    }
    if (state.status === "unconfigured" && staticDeckPreviewEnabled()) {
      return {
        ok: true,
        scope: {
          workspaceId: "00000000-0000-4000-8000-000000003001",
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

async function userClient(): Promise<DeckRpcClient | null> {
  const client = await createServerSupabaseClient();
  return client ? asRpcClient(client) : null;
}

export async function loadDeckFormatsWithClient(
  client: DeckRpcClient,
): Promise<DeckLoadResult<DeckFormat[]>> {
  return rpcLoad(client, DATABASE_FUNCTIONS.deckFormatsList, {}, parseDeckFormatsResponse);
}

export async function loadDeckFormats(): Promise<DeckLoadResult<DeckFormat[]>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    return { ok: true, data: previewDeckFormats(), preview: true };
  }
  const client = await userClient();
  return client
    ? loadDeckFormatsWithClient(client)
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}

export async function loadDeckListWithClient(
  client: DeckRpcClient,
  workspaceId: string,
  filter: DeckStatusFilter,
  cursor: string | null = null,
): Promise<DeckLoadResult<DeckListPage>> {
  const result = await rpcLoad(
    client,
    DATABASE_FUNCTIONS.deckList,
    {
      p_workspace_id: workspaceId,
      p_include_archived: filter !== "active",
      p_status: filter === "all" ? null : filter,
      p_after: cursor,
      p_limit: 40,
    },
    (value) => parseDeckListPage(value, { workspaceId, filter }),
  );
  return result;
}

export async function loadDeckList(
  filter: DeckStatusFilter,
  cursor: string | null = null,
): Promise<DeckLoadResult<DeckListPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    return { ok: true, data: previewDeckList(filter), preview: true };
  }
  const client = await userClient();
  return client
    ? loadDeckListWithClient(client, scoped.scope.workspaceId, filter, cursor)
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}

export async function loadDeckDetailWithClient(
  client: DeckRpcClient,
  deckId: string,
  currency: string,
): Promise<DeckLoadResult<DeckDetail>> {
  const formats = await loadDeckFormatsWithClient(client);
  if (!formats.ok) return formats;
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.deckDetail,
    { p_deck_id: deckId, p_currency: currency },
    (value) => parseDeckDetail(value, formats.data, { deckId, currency }),
  );
}

export async function loadDeckDetail(deckId: string): Promise<DeckLoadResult<DeckDetail>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const detail = previewDeckDetail(deckId);
    return detail
      ? { ok: true, data: detail, preview: true }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  return client
    ? loadDeckDetailWithClient(client, deckId, scoped.scope.currency)
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}

export async function searchDeckCatalogWithClient(
  client: DeckRpcClient,
  deckId: string,
  formatCode: string,
  formatVersionId: string,
  currentRevision: number,
  catalogVersion: string,
  currency: string,
  query: string,
  cursor: string | null,
): Promise<DeckLoadResult<DeckCatalogSearchPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.deckCatalogSearch,
    {
      p_deck_id: deckId,
      p_query: query || null,
      p_after: cursor,
      p_limit: 30,
    },
    (value) =>
      parseDeckCatalogSearchPage(value, {
        deckId,
        query,
        formatCode,
        formatVersionId,
        revision: currentRevision,
        catalogVersion,
        currency,
      }),
  );
}

export async function searchDeckCatalog(
  deckId: string,
  formatCode: string,
  formatVersionId: string,
  currentRevision: number,
  catalogVersion: string,
  query: string,
  cursor: string | null,
): Promise<DeckLoadResult<DeckCatalogSearchPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    return {
      ok: true,
      data: previewDeckCatalogSearch(
        query,
        formatCode,
        deckId,
        formatVersionId,
        currentRevision,
        catalogVersion,
      ),
      preview: true,
    };
  }
  const client = await userClient();
  return client
    ? searchDeckCatalogWithClient(
        client,
        deckId,
        formatCode,
        formatVersionId,
        currentRevision,
        catalogVersion,
        scoped.scope.currency,
        query,
        cursor,
      )
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}

export async function loadDeckCardPrintingsWithClient(
  client: DeckRpcClient,
  deckId: string,
  cardId: string,
  currency: string,
  expectedRevision: number,
  expectedCatalogVersion: string,
  cursor: string | null = null,
): Promise<DeckLoadResult<DeckCardPrintingsPage>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.deckCardPrintings,
    {
      p_deck_id: deckId,
      p_card_id: cardId,
      p_after: cursor,
      p_limit: 30,
      p_currency: currency,
    },
    (value) =>
      parseDeckCardPrintingsPage(value, {
        deckId,
        cardId,
        revision: expectedRevision,
        currency,
        catalogVersion: expectedCatalogVersion,
      }),
  );
}

export async function loadDeckCardPrintings(
  deckId: string,
  cardId: string,
  expectedRevision: number,
  expectedCatalogVersion: string,
  cursor: string | null = null,
): Promise<DeckLoadResult<DeckCardPrintingsPage>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const page = previewDeckCardPrintings(deckId, cardId);
    return page &&
      page.revision === expectedRevision &&
      page.catalogVersion === expectedCatalogVersion
      ? { ok: true, data: page, preview: true }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  return client
    ? loadDeckCardPrintingsWithClient(
        client,
        deckId,
        cardId,
        scoped.scope.currency,
        expectedRevision,
        expectedCatalogVersion,
        cursor,
      )
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}

export async function loadDeckExportWithClient(
  client: DeckRpcClient,
  deckId: string,
): Promise<DeckLoadResult<DeckExportPayload>> {
  return rpcLoad(client, DATABASE_FUNCTIONS.deckExport, { p_deck_id: deckId }, (value) =>
    parseDeckExport(value, deckId),
  );
}

function previewPlainText(detail: DeckDetail): string {
  const zoneOrder: DeckZone[] = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];
  const lines = [`# ${detail.deck.name}`, `# Format: ${detail.format.name}`];
  for (const zoneValue of zoneOrder) {
    const entries = detail.entries.filter((item) => item.zone === zoneValue);
    if (!entries.length) continue;
    lines.push("", `[${zoneValue}]`);
    for (const item of entries) lines.push(`${item.quantity} ${item.card.name}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function loadDeckExport(deckId: string): Promise<DeckLoadResult<DeckExportPayload>> {
  const scoped = await currentScope();
  if (!scoped.ok) return scoped.result;
  if (scoped.scope.preview) {
    const detail = previewDeckDetail(deckId);
    return detail
      ? {
          ok: true,
          data: {
            catalogVersion: detail.validation.catalogVersion,
            revision: detail.deck.currentRevision,
            plainText: previewPlainText(detail),
            stableJson: {
              schema_version: 1,
              deck: {
                deck_id: detail.deck.id,
                name: detail.deck.name,
                format_code: detail.deck.formatCode,
                format_version_id: detail.deck.formatVersionId,
                revision: detail.deck.currentRevision,
                catalog_version: detail.validation.catalogVersion,
              },
              entries: detail.entries.map((item) => ({
                card_id: item.card.cardId,
                name: item.card.name,
                zone: item.zone,
                quantity: item.quantity,
                preferred_printing_id: item.preferredPrintingId,
                preferred_finish: item.preferredFinish,
                notes: item.notes,
              })),
            },
          },
          preview: true,
        }
      : { ok: false, reason: "not_found", requestId: randomUUID() };
  }
  const client = await userClient();
  return client
    ? loadDeckExportWithClient(client, deckId)
    : { ok: false, reason: "configuration_required", requestId: randomUUID() };
}
