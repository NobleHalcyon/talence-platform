import "server-only";

import { randomUUID } from "node:crypto";

import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_FUNCTIONS, DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { catalogSyncEnabled, staticCatalogPreviewEnabled } from "./config";
import { ALL_CATALOG_LANGUAGES, DEFAULT_CATALOG_LANGUAGE } from "./query";
import {
  parseAdminCatalogStatus,
  parseCatalogCardDetail,
  parseCatalogPrintingDetail,
  parseCatalogSearchResult,
  parseCatalogSetDetail,
  parseCatalogStatus,
} from "./parse";
import {
  previewCatalogCardDetail,
  previewCatalogPrintingDetail,
  previewCatalogSearch,
  previewCatalogSetDetail,
  previewCatalogStatus,
} from "./preview";
import {
  type AdminCatalogStatus,
  type CatalogCardDetail,
  type CatalogLoadResult,
  type CatalogPrintingDetail,
  type CatalogRpcClient,
  type CatalogSearchQuery,
  type CatalogSearchResult,
  type CatalogSetDetail,
  type CatalogStatus,
  type CatalogView,
} from "./types";

type Parser<T> = (value: unknown) => T | null;

function asCatalogRpcClient(client: unknown): CatalogRpcClient {
  return client as CatalogRpcClient;
}

function warnCatalogFailure(code: string, requestId: string): void {
  writeSecurityLog("warn", "catalog.read.failed", {
    code,
    request_id: requestId,
  });
}

async function rpcLoad<T>(
  client: CatalogRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  parser: Parser<T>,
  nullable = false,
): Promise<CatalogLoadResult<T | null>> {
  const requestId = randomUUID();
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) {
      warnCatalogFailure(result.error.code ?? "rpc_error", requestId);
      return { ok: false, reason: "request_failed", requestId };
    }
    if (result.data === null && nullable) {
      return { ok: true, data: null, preview: false };
    }

    const parsed = parser(result.data);
    if (!parsed) {
      warnCatalogFailure("invalid_response", requestId);
      return { ok: false, reason: "invalid_response", requestId };
    }
    return { ok: true, data: parsed, preview: false };
  } catch {
    warnCatalogFailure("rpc_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
}

function configurationFailure<T>(): CatalogLoadResult<T> {
  return {
    ok: false,
    reason: "configuration_required",
    requestId: randomUUID(),
  };
}

async function catalogServerClient(): Promise<
  { ok: true; client: CatalogRpcClient | null } | { ok: false; requestId: string }
> {
  const requestId = randomUUID();
  try {
    const client = await createServerSupabaseClient();
    return {
      ok: true,
      client: client ? asCatalogRpcClient(client) : null,
    };
  } catch {
    warnCatalogFailure("client_unavailable", requestId);
    return { ok: false, requestId };
  }
}

function nullable(value: string): string | null {
  return value || null;
}

function hasPrice(query: CatalogSearchQuery): boolean | null {
  if (query.priceAvailability === "available") {
    return true;
  }
  if (query.priceAvailability === "unavailable") {
    return false;
  }
  return null;
}

export function catalogSearchRpcArgs(query: CatalogSearchQuery): Record<string, unknown> {
  return {
    p_query: nullable(query.query),
    p_game_code: "mtg",
    p_set_code: nullable(query.setCode),
    p_language:
      query.language === ALL_CATALOG_LANGUAGES
        ? null
        : (nullable(query.language) ?? DEFAULT_CATALOG_LANGUAGE),
    p_rarity: nullable(query.rarity),
    p_finish: nullable(query.finish),
    p_colors: query.colors.length ? query.colors : null,
    p_color_identity: query.colorIdentity.length ? query.colorIdentity : null,
    p_type_line: nullable(query.typeLine),
    p_has_price: hasPrice(query),
    p_currency: nullable(query.currency),
    p_min_mana_value: query.manaValueMin,
    p_max_mana_value: query.manaValueMax,
    p_released_from: nullable(query.releasedFrom),
    p_released_to: nullable(query.releasedTo),
    p_include_digital: query.includeDigital,
    p_include_nondefault: query.includeNondefault,
    p_sort: query.sort,
    p_after: query.cursor,
    p_limit: 24,
  };
}

export async function searchCatalogWithClient(
  client: CatalogRpcClient,
  query: CatalogSearchQuery,
): Promise<CatalogLoadResult<CatalogSearchResult>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.catalogSearch,
    catalogSearchRpcArgs(query),
    parseCatalogSearchResult,
  ) as Promise<CatalogLoadResult<CatalogSearchResult>>;
}

export async function searchCatalog(
  query: CatalogSearchQuery,
): Promise<CatalogLoadResult<CatalogSearchResult>> {
  const clientState = await catalogServerClient();
  if (!clientState.ok) {
    return { ok: false, reason: "request_failed", requestId: clientState.requestId };
  }
  if (!clientState.client) {
    return staticCatalogPreviewEnabled()
      ? { ok: true, data: previewCatalogSearch(query), preview: true }
      : configurationFailure();
  }
  const requestId = randomUUID();
  let workspaceId: string;
  try {
    const context = await getAppContextState();
    if (context.status !== "ready") {
      return { ok: false, reason: "request_failed", requestId };
    }
    workspaceId = context.context.workspace.id;
  } catch {
    warnCatalogFailure("quota_context_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
  try {
    const reservation = await clientState.client.rpc(
      DATABASE_FUNCTIONS.consumeApplicationFeatureQuota,
      {
        p_feature_key: "catalog_search",
        p_workspace_id: workspaceId,
        p_units: 24,
        p_correlation_id: requestId,
      },
    );
    if (reservation.error) {
      const source =
        `${reservation.error.code ?? ""} ${reservation.error.message ?? ""}`.toLowerCase();
      warnCatalogFailure(
        source.includes("quota_exceeded")
          ? "catalog_search_rate_limited"
          : source.includes("feature_disabled")
            ? "catalog_search_disabled"
            : "catalog_search_quota_unavailable",
        requestId,
      );
      return { ok: false, reason: "request_failed", requestId };
    }
  } catch {
    warnCatalogFailure("catalog_search_quota_unavailable", requestId);
    return { ok: false, reason: "request_failed", requestId };
  }
  return searchCatalogWithClient(clientState.client, query);
}

export async function loadCatalogCardWithClient(
  client: CatalogRpcClient,
  cardId: string,
): Promise<CatalogLoadResult<CatalogCardDetail | null>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.catalogCardDetail,
    { p_card_id: cardId },
    parseCatalogCardDetail,
    true,
  );
}

export async function loadCatalogCard(
  cardId: string,
): Promise<CatalogLoadResult<CatalogCardDetail | null>> {
  const clientState = await catalogServerClient();
  if (!clientState.ok) {
    return { ok: false, reason: "request_failed", requestId: clientState.requestId };
  }
  if (!clientState.client) {
    return staticCatalogPreviewEnabled()
      ? { ok: true, data: previewCatalogCardDetail(cardId), preview: true }
      : configurationFailure();
  }
  return loadCatalogCardWithClient(clientState.client, cardId);
}

export async function loadCatalogPrintingWithClient(
  client: CatalogRpcClient,
  printingId: string,
): Promise<CatalogLoadResult<CatalogPrintingDetail | null>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.catalogPrintingDetail,
    { p_printing_id: printingId },
    parseCatalogPrintingDetail,
    true,
  );
}

export async function loadCatalogPrinting(
  printingId: string,
): Promise<CatalogLoadResult<CatalogPrintingDetail | null>> {
  const clientState = await catalogServerClient();
  if (!clientState.ok) {
    return { ok: false, reason: "request_failed", requestId: clientState.requestId };
  }
  if (!clientState.client) {
    return staticCatalogPreviewEnabled()
      ? { ok: true, data: previewCatalogPrintingDetail(printingId), preview: true }
      : configurationFailure();
  }
  return loadCatalogPrintingWithClient(clientState.client, printingId);
}

export async function loadCatalogSetWithClient(
  client: CatalogRpcClient,
  setCode: string,
): Promise<CatalogLoadResult<CatalogSetDetail | null>> {
  return rpcLoad(
    client,
    DATABASE_FUNCTIONS.catalogSetDetail,
    { p_set_code: setCode },
    parseCatalogSetDetail,
    true,
  );
}

export async function loadCatalogSet(
  setCode: string,
): Promise<CatalogLoadResult<CatalogSetDetail | null>> {
  const clientState = await catalogServerClient();
  if (!clientState.ok) {
    return { ok: false, reason: "request_failed", requestId: clientState.requestId };
  }
  if (!clientState.client) {
    return staticCatalogPreviewEnabled()
      ? { ok: true, data: previewCatalogSetDetail(setCode), preview: true }
      : configurationFailure();
  }
  return loadCatalogSetWithClient(clientState.client, setCode);
}

export async function loadCatalogStatusWithClient(
  client: CatalogRpcClient,
): Promise<CatalogLoadResult<CatalogStatus>> {
  return rpcLoad(client, DATABASE_FUNCTIONS.catalogStatus, {}, parseCatalogStatus) as Promise<
    CatalogLoadResult<CatalogStatus>
  >;
}

export async function loadCatalogStatus(): Promise<CatalogLoadResult<CatalogStatus>> {
  const clientState = await catalogServerClient();
  if (!clientState.ok) {
    return { ok: false, reason: "request_failed", requestId: clientState.requestId };
  }
  if (!clientState.client) {
    return staticCatalogPreviewEnabled()
      ? { ok: true, data: previewCatalogStatus(), preview: true }
      : configurationFailure();
  }
  return loadCatalogStatusWithClient(clientState.client);
}

export async function loadAdminCatalogStatusWithClient(
  client: CatalogRpcClient,
  actorUserId: string,
): Promise<CatalogLoadResult<AdminCatalogStatus>> {
  const result = (await rpcLoad(
    client,
    DATABASE_FUNCTIONS.adminCatalogStatus,
    { p_actor_user_id: actorUserId },
    parseAdminCatalogStatus,
  )) as CatalogLoadResult<AdminCatalogStatus>;

  return result.ok
    ? {
        ...result,
        data: {
          ...result.data,
          syncEnabled: catalogSyncEnabled() && result.data.syncEnabled,
        },
      }
    : result;
}

export async function loadAdminCatalogStatus(
  actorUserId: string,
): Promise<CatalogLoadResult<AdminCatalogStatus>> {
  try {
    const client = createAdminSupabaseClient();
    return loadAdminCatalogStatusWithClient(asCatalogRpcClient(client), actorUserId);
  } catch {
    return configurationFailure();
  }
}

export async function loadCatalogViewPreference(): Promise<CatalogView> {
  const client = await createServerSupabaseClient();
  if (!client) {
    return "table";
  }

  try {
    const result = await client
      .from(DATABASE_TABLES.userPreferences)
      .select("catalog_view")
      .maybeSingle();
    return !result.error && result.data?.catalog_view === "grid" ? "grid" : "table";
  } catch {
    return "table";
  }
}
