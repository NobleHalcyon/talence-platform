"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_FUNCTIONS, DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { catalogSyncEnabled } from "./config";
import { safeCatalogReturnPath } from "./query";
import type { CatalogRpcClient, CatalogView } from "./types";

const ADMIN_CATALOG_PATH = "/app/admin/catalog";

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function adminCatalogHref(status: string, requestId: string): string {
  const params = new URLSearchParams({ request_id: requestId, status });
  return `${ADMIN_CATALOG_PATH}?${params}`;
}

function warnCatalogMutation(code: string, requestId: string): void {
  writeSecurityLog("warn", "catalog.operation.failed", {
    code,
    request_id: requestId,
  });
}

async function readyContext() {
  try {
    const state = await getAppContextState();
    return state.status === "ready" ? state.context : null;
  } catch {
    return null;
  }
}

export async function persistCatalogViewAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const requestedView = formString(formData, "view");
  const view: CatalogView | null =
    requestedView === "table" || requestedView === "grid" ? requestedView : null;
  const returnTo = safeCatalogReturnPath(formString(formData, "returnTo"));
  const context = await readyContext();

  if (!view || !context) {
    warnCatalogMutation("catalog_view_denied", requestId);
    redirect(returnTo);
  }

  try {
    const client = await createServerSupabaseClient();
    if (!client) {
      throw new Error("client_unavailable");
    }
    const result = await client
      .from(DATABASE_TABLES.userPreferences)
      .update({ catalog_view: view })
      .eq("user_id", context.userId)
      .select("user_id")
      .maybeSingle();
    if (result.error || result.data?.user_id !== context.userId) {
      throw new Error("catalog_view_update_failed");
    }
  } catch {
    warnCatalogMutation("catalog_view_update_failed", requestId);
  }

  revalidatePath("/app/catalog");
  redirect(returnTo);
}

export async function queueCatalogSyncWithClient(
  client: CatalogRpcClient,
  actorUserId: string,
  force: boolean,
): Promise<{ ok: true; importRunId: string } | { ok: false }> {
  try {
    const result = await client.rpc(DATABASE_FUNCTIONS.adminQueueCatalogSync, {
      p_actor_user_id: actorUserId,
      p_force: force,
      p_trigger_type: "manual",
    });
    if (result.error || typeof result.data !== "object" || result.data === null) {
      return { ok: false };
    }
    const importRunId =
      "import_run_id" in result.data && typeof result.data.import_run_id === "string"
        ? result.data.import_run_id
        : null;
    return importRunId ? { ok: true, importRunId } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function queueCatalogSyncAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const context = await readyContext();
  if (!context?.isPlatformAdmin) {
    redirect(adminCatalogHref("access_denied", requestId));
  }
  if (!catalogSyncEnabled()) {
    redirect(adminCatalogHref("sync_disabled", requestId));
  }

  try {
    const client = createAdminSupabaseClient();
    const result = await queueCatalogSyncWithClient(
      client as unknown as CatalogRpcClient,
      context.userId,
      formData.get("force") === "on",
    );
    if (!result.ok) {
      throw new Error("queue_failed");
    }
  } catch {
    warnCatalogMutation("catalog_sync_queue_failed", requestId);
    redirect(adminCatalogHref("sync_failed", requestId));
  }

  revalidatePath(ADMIN_CATALOG_PATH);
  redirect(adminCatalogHref("sync_queued", requestId));
}
