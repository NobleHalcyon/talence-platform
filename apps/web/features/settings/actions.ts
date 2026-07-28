"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { statusHref } from "@/lib/auth/safe-status";
import { normalizeDisplayName, normalizeHandle, validateUuid } from "@/lib/auth/validation";
import { DATABASE_TABLES } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CURRENCIES = new Set(["EUR", "TIX", "USD"]);
const COLLECTION_VIEWS = new Set(["analytical", "gallery", "structured"]);
const DECK_VIEWS = new Set(["list", "visual"]);

type AttemptResult<T> = { ok: true; value: T } | { ok: false };
type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

async function attempt<T>(operation: () => PromiseLike<T>): Promise<AttemptResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return { ok: false };
  }
}

function warnSettingsFailure(code: string, requestId: string): void {
  writeSecurityLog("warn", "settings.operation.failed", {
    code,
    request_id: requestId,
  });
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectSettings(status: string, requestId?: string): never {
  redirect(statusHref("/app/settings", status, requestId));
}

async function authorizedContext(requestId: string) {
  const contextAttempt = await attempt(() => getAppContextState());
  if (!contextAttempt.ok) {
    warnSettingsFailure("context_unavailable", requestId);
    return null;
  }

  const state = contextAttempt.value;
  if (state.status !== "ready") {
    return null;
  }
  return state.context;
}

async function serverClient(requestId: string): Promise<ServerSupabaseClient | null> {
  const clientAttempt = await attempt(() => createServerSupabaseClient());
  if (!clientAttempt.ok) {
    warnSettingsFailure("client_unavailable", requestId);
    return null;
  }
  return clientAttempt.value;
}

async function firstAccessibleCollection(
  supabase: ServerSupabaseClient,
  workspaceId: string,
  requestId: string,
): Promise<{ id: string }[] | null> {
  const queryAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.collections)
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("name")
      .order("id"),
  );
  if (!queryAttempt.ok) {
    warnSettingsFailure("collection_lookup_unavailable", requestId);
    return null;
  }

  const result = queryAttempt.value;
  if (result.error || !Array.isArray(result.data)) {
    return null;
  }
  return result.data.filter(
    (row): row is { id: string } =>
      typeof row === "object" && row !== null && "id" in row && typeof row.id === "string",
  );
}

export async function setActiveWorkspaceAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const workspaceId = validateUuid(formString(formData, "workspaceId"));
  const context = await authorizedContext(requestId);
  if (!workspaceId.ok || !context) {
    return redirectSettings("access_denied", requestId);
  }

  const accessible = context.workspaces.some(({ id }) => id === workspaceId.value);
  if (!accessible) {
    return redirectSettings("access_denied", requestId);
  }

  const supabase = await serverClient(requestId);
  if (!supabase) {
    return redirectSettings("settings_failed", requestId);
  }

  const collections = await firstAccessibleCollection(supabase, workspaceId.value, requestId);
  if (!collections) {
    return redirectSettings("settings_failed", requestId);
  }

  const updateAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.profiles)
      .update({
        default_collection_id: collections[0]?.id ?? null,
        default_workspace_id: workspaceId.value,
      })
      .eq("user_id", context.userId),
  );

  if (!updateAttempt.ok || updateAttempt.value.error) {
    warnSettingsFailure("workspace_update_failed", requestId);
    return redirectSettings("settings_failed", requestId);
  }

  revalidatePath("/app", "layout");
  redirect(statusHref("/app", "workspace_changed"));
}

export async function updateSettingsAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const context = await authorizedContext(requestId);
  if (!context) {
    redirect(statusHref("/login", "account_unavailable", requestId));
  }

  const displayName = normalizeDisplayName(formString(formData, "displayName"));
  const handle = normalizeHandle(formString(formData, "handle"));
  const workspaceId = validateUuid(formString(formData, "defaultWorkspaceId"));
  const collectionIdValue = formString(formData, "defaultCollectionId");
  const collectionId = collectionIdValue ? validateUuid(collectionIdValue) : null;
  const avatarPath = formString(formData, "avatarPath");
  const currency = formString(formData, "preferredCurrency").toUpperCase();
  const collectionView = formString(formData, "collectionView");
  const deckView = formString(formData, "deckView");

  if (
    !displayName.ok ||
    !handle.ok ||
    !workspaceId.ok ||
    (collectionId && !collectionId.ok) ||
    avatarPath.length > 512 ||
    avatarPath.includes("://") ||
    avatarPath.includes("..") ||
    !CURRENCIES.has(currency) ||
    !COLLECTION_VIEWS.has(collectionView) ||
    !DECK_VIEWS.has(deckView)
  ) {
    return redirectSettings("settings_failed", requestId);
  }

  if (!context.workspaces.some(({ id }) => id === workspaceId.value)) {
    return redirectSettings("access_denied", requestId);
  }

  const supabase = await serverClient(requestId);
  if (!supabase) {
    return redirectSettings("configuration_required", requestId);
  }

  const collections = await firstAccessibleCollection(supabase, workspaceId.value, requestId);
  if (!collections) {
    return redirectSettings("settings_failed", requestId);
  }
  const accessibleCollectionId = collectionId?.ok ? collectionId.value : null;
  if (accessibleCollectionId && !collections.some(({ id }) => id === accessibleCollectionId)) {
    return redirectSettings("access_denied", requestId);
  }

  const profileUpdateAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.profiles)
      .update({
        avatar_path: avatarPath || null,
        default_collection_id: accessibleCollectionId ?? collections[0]?.id ?? null,
        default_workspace_id: workspaceId.value,
        display_name: displayName.value,
        handle: handle.value,
        preferred_currency: currency,
      })
      .eq("user_id", context.userId),
  );

  if (!profileUpdateAttempt.ok || profileUpdateAttempt.value.error) {
    warnSettingsFailure("profile_update_failed", requestId);
    return redirectSettings("settings_failed", requestId);
  }

  const preferenceUpdateAttempt = await attempt(() =>
    supabase.from(DATABASE_TABLES.userPreferences).upsert(
      {
        collection_view: collectionView,
        deck_view: deckView,
        user_id: context.userId,
      },
      { onConflict: "user_id" },
    ),
  );

  if (!preferenceUpdateAttempt.ok || preferenceUpdateAttempt.value.error) {
    warnSettingsFailure("preference_update_failed", requestId);
    return redirectSettings("settings_failed", requestId);
  }

  revalidatePath("/app", "layout");
  redirectSettings("settings_updated");
}
