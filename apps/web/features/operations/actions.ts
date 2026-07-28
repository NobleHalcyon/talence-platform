"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const OPERATIONS_PATH = "/app/admin/operations";
const KINDS = new Set(["application", "device", "external"]);
const KEY_PATTERN = /^[a-z][a-z0-9_.-]{2,79}$/;
const POSTGRES_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function returnStatus(status: string, requestId: string): never {
  const query = new URLSearchParams({ request_id: requestId, status });
  redirect(`${OPERATIONS_PATH}?${query}`);
}

export async function toggleOperationalControlAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const kind = formString(formData, "kind");
  const key = formString(formData, "key");
  const enabledText = formString(formData, "enabled");
  const expectedUpdatedAt = formString(formData, "expectedUpdatedAt");
  const expected = new Date(expectedUpdatedAt);
  const enabled = enabledText === "true" ? true : enabledText === "false" ? false : null;

  if (
    !KINDS.has(kind) ||
    !KEY_PATTERN.test(key) ||
    enabled === null ||
    expectedUpdatedAt.length > 40 ||
    !POSTGRES_TIMESTAMP_PATTERN.test(expectedUpdatedAt) ||
    Number.isNaN(expected.getTime())
  ) {
    return returnStatus("control_invalid", requestId);
  }

  try {
    const [state, client] = await Promise.all([getAppContextState(), createServerSupabaseClient()]);
    if (state.status !== "ready" || !state.context.isPlatformAdmin || !client) {
      return returnStatus("control_denied", requestId);
    }
    const result = await client.rpc(DATABASE_FUNCTIONS.adminOperationalControlToggle, {
      p_control_kind: kind,
      p_control_key: key,
      p_enabled: enabled,
      p_expected_updated_at: expectedUpdatedAt,
      p_correlation_id: requestId,
    });
    if (result.error) {
      const source = `${result.error.code ?? ""} ${result.error.message ?? ""}`.toLowerCase();
      writeSecurityLog("warn", "operations.control.toggle_failed", {
        code: source.includes("stale") ? "stale" : "rpc_rejected",
        request_id: requestId,
        user_id: state.context.userId,
      });
      return returnStatus(source.includes("stale") ? "control_stale" : "control_failed", requestId);
    }
  } catch {
    writeSecurityLog("warn", "operations.control.toggle_failed", {
      code: "rpc_unavailable",
      request_id: requestId,
    });
    return returnStatus("control_failed", requestId);
  }

  revalidatePath(OPERATIONS_PATH);
  returnStatus(enabled ? "control_enabled" : "control_disabled", requestId);
}
