import "server-only";

import { randomUUID } from "node:crypto";

import { getAppContextState } from "@/lib/auth/app-context";
import { validateUuid } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticDevicePreviewEnabled } from "./config";
import { parseDeviceDetail, parseDeviceList } from "./parse";
import { previewDeviceDetail, previewDeviceList } from "./preview";
import type {
  DeviceDetail,
  DeviceListPage,
  DeviceLoadFailureReason,
  DeviceLoadResult,
  DeviceRpcClient,
  DeviceStatus,
} from "./types";

function failure<T>(
  reason: DeviceLoadFailureReason,
  requestId = randomUUID(),
): DeviceLoadResult<T> {
  return { ok: false, reason, requestId };
}

function mapFailure(error: { code?: string; message?: string } | null): DeviceLoadFailureReason {
  const source = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (source.includes("permission") || source.includes("42501")) return "permission_denied";
  if (source.includes("not_found")) return "not_found";
  return "request_failed";
}

async function loadContext(): Promise<
  | {
      preview: false;
      workspaceId: string;
      client: DeviceRpcClient;
    }
  | {
      preview: true;
      workspaceId: null;
      client: null;
    }
  | null
> {
  try {
    const state = await getAppContextState();
    if (state.status === "unconfigured" && staticDevicePreviewEnabled()) {
      return { preview: true, workspaceId: null, client: null };
    }
    if (state.status !== "ready") return null;
    const client = await createServerSupabaseClient();
    if (!client) return null;
    return {
      preview: false,
      workspaceId: state.context.workspace.id,
      client: client as unknown as DeviceRpcClient,
    };
  } catch {
    return null;
  }
}

export async function loadDeviceList(
  status: DeviceStatus | "all",
  cursor: string | null,
): Promise<DeviceLoadResult<DeviceListPage>> {
  const requestId = randomUUID();
  const context = await loadContext();
  if (!context) return failure("permission_denied", requestId);
  if (context.preview) {
    return { ok: true, data: previewDeviceList(status), preview: true };
  }
  try {
    const result = await context.client.rpc(DATABASE_FUNCTIONS.deviceList, {
      p_workspace_id: context.workspaceId,
      p_status: status === "all" ? null : status,
      p_after: cursor,
      p_limit: 50,
    });
    if (result.error) return failure(mapFailure(result.error), requestId);
    const parsed = parseDeviceList(result.data, context.workspaceId, 50);
    return parsed
      ? { ok: true, data: parsed, preview: false }
      : failure("invalid_response", requestId);
  } catch {
    return failure("request_failed", requestId);
  }
}

export async function loadDeviceDetail(deviceId: string): Promise<DeviceLoadResult<DeviceDetail>> {
  const requestId = randomUUID();
  const validated = validateUuid(deviceId);
  if (!validated.ok) return failure("not_found", requestId);
  const context = await loadContext();
  if (!context) return failure("permission_denied", requestId);
  if (context.preview) {
    const detail = previewDeviceDetail(validated.value);
    return detail ? { ok: true, data: detail, preview: true } : failure("not_found", requestId);
  }
  try {
    const result = await context.client.rpc(DATABASE_FUNCTIONS.deviceDetail, {
      p_device_id: validated.value,
    });
    if (result.error) return failure(mapFailure(result.error), requestId);
    const parsed = parseDeviceDetail(result.data, validated.value, context.workspaceId);
    return parsed
      ? { ok: true, data: parsed, preview: false }
      : failure("invalid_response", requestId);
  } catch {
    return failure("request_failed", requestId);
  }
}
