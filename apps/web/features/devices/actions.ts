"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppContextState } from "@/lib/auth/app-context";
import { validateUuid } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { staticDevicePreviewEnabled } from "./config";
import { generateDeviceCredential, getDeviceCredentialPepper } from "./credentials";
import {
  parseCredentialRevocation,
  parseDeviceMutation,
  parseGrantReplacement,
  parseIssuedCredential,
} from "./parse";
import { PREVIEW_DEVICE_ID } from "./preview-constants";
import {
  DEVICE_GRANT_PERMISSIONS,
  DEVICE_TYPES,
  type DeviceCredentialActionState,
  type DeviceGrantPermission,
  type DeviceRecord,
  type DeviceRpcClient,
} from "./types";

const DEVICES_PATH = "/app/devices";
const MANAGER_ROLES = new Set(["owner", "admin"]);
const TYPES = new Set<string>(DEVICE_TYPES);
const GRANTS = new Set<string>(DEVICE_GRANT_PERMISSIONS);

interface MutationContext {
  actorUserId: string | null;
  adminClient: DeviceRpcClient | null;
  client: DeviceRpcClient | null;
  preview: boolean;
  workspaceId: string | null;
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value: string, maximum: number, required = false): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    (required && !normalized) ||
    normalized.length > maximum ||
    /[\u0000-\u001f]/.test(normalized)
  ) {
    return null;
  }
  return normalized || null;
}

function optionalText(
  formData: FormData,
  name: string,
  maximum: number,
): {
  valid: boolean;
  value: string | null;
} {
  const raw = formString(formData, name);
  const value = normalizedText(raw, maximum);
  return {
    valid: !raw || value !== null,
    value,
  };
}

function uuid(value: string): string | null {
  const parsed = validateUuid(value);
  return parsed.ok ? parsed.value : null;
}

function withStatus(path: string, status: string, requestId?: string): string {
  const url = new URL(path, "https://talence.invalid");
  url.searchParams.set("status", status);
  if (requestId) url.searchParams.set("request_id", requestId);
  return `${url.pathname}${url.search}`;
}

function devicePath(deviceId: string): string {
  return `${DEVICES_PATH}/${deviceId}`;
}

function actionError(
  code: string,
  requestId: string,
  message: string,
): DeviceCredentialActionState {
  return { status: "error", code, requestId, message };
}

function mutationCode(error: { code?: string; message?: string } | null): string {
  const source = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (source.includes("permission") || source.includes("42501")) return "permission_denied";
  if (source.includes("stale") || source.includes("expected_updated")) return "stale_device";
  if (source.includes("revoked")) return "device_revoked";
  if (source.includes("serial")) return "serial_conflict";
  return "mutation_failed";
}

async function authorizedMutation(requireAdminClient = false): Promise<MutationContext | null> {
  try {
    const state = await getAppContextState();
    if (state.status === "unconfigured" && staticDevicePreviewEnabled()) {
      return {
        actorUserId: null,
        adminClient: null,
        client: null,
        preview: true,
        workspaceId: null,
      };
    }
    if (state.status !== "ready" || !MANAGER_ROLES.has(state.context.workspace.role)) {
      return null;
    }
    const client = await createServerSupabaseClient();
    const adminClient = requireAdminClient ? createAdminSupabaseClient() : null;
    if (!client || (requireAdminClient && !adminClient)) return null;
    return {
      actorUserId: state.context.userId,
      adminClient: adminClient as unknown as DeviceRpcClient | null,
      client: client as unknown as DeviceRpcClient,
      preview: false,
      workspaceId: state.context.workspace.id,
    };
  } catch {
    return null;
  }
}

async function rpc(
  client: DeviceRpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> {
  try {
    return await client.rpc(functionName, args);
  } catch {
    return { data: null, error: { code: "request_failed" } };
  }
}

function previewPepper(): Uint8Array {
  return new Uint8Array(32).fill(0x54);
}

export async function registerDeviceAction(
  _previous: DeviceCredentialActionState,
  formData: FormData,
): Promise<DeviceCredentialActionState> {
  const requestId = randomUUID();
  const workspaceId = uuid(formString(formData, "workspaceId"));
  const name = normalizedText(formString(formData, "name"), 120, true);
  const rawType = formString(formData, "type");
  const type = TYPES.has(rawType) ? (rawType as DeviceRecord["type"]) : null;
  const manufacturer = optionalText(formData, "manufacturer", 120);
  const model = optionalText(formData, "model", 120);
  const serialNumber = optionalText(formData, "serialNumber", 160);
  if (
    !workspaceId ||
    !name ||
    !type ||
    !manufacturer.valid ||
    !model.valid ||
    !serialNumber.valid
  ) {
    return actionError("invalid_device", requestId, "Review the bounded device fields.");
  }
  const context = await authorizedMutation(true);
  if (!context || (!context.preview && workspaceId !== context.workspaceId)) {
    return actionError(
      "permission_denied",
      requestId,
      "Only an active workspace owner or administrator may register devices.",
    );
  }
  const pepper = context.preview ? previewPepper() : getDeviceCredentialPepper();
  if (!pepper) {
    return actionError(
      "configuration_required",
      requestId,
      "Trusted device credential configuration is unavailable.",
    );
  }
  const generated = generateDeviceCredential(pepper);
  if (context.preview) {
    return {
      status: "issued",
      deviceId: PREVIEW_DEVICE_ID,
      deviceName: name,
      credential: generated.raw,
      prefix: generated.prefix,
    };
  }
  const result = await rpc(context.adminClient!, DATABASE_FUNCTIONS.deviceRegister, {
    p_actor_user_id: context.actorUserId,
    p_workspace_id: workspaceId,
    p_name: name,
    p_type: type,
    p_manufacturer: manufacturer.value,
    p_model: model.value,
    p_serial_number: serialNumber.value,
    p_credential_prefix: generated.prefix,
    p_credential_digest: generated.digest,
    p_credential_expires_at: null,
  });
  if (result.error) {
    return actionError(
      mutationCode(result.error),
      requestId,
      "The device could not be registered.",
    );
  }
  const issued = parseIssuedCredential(result.data, {
    workspaceId,
    name,
    type,
    prefix: generated.prefix,
  });
  if (!issued) {
    return actionError("invalid_response", requestId, "The registration response was invalid.");
  }
  revalidatePath(DEVICES_PATH);
  return {
    status: "issued",
    deviceId: issued.deviceId,
    deviceName: name,
    credential: generated.raw,
    prefix: generated.prefix,
  };
}

export async function rotateDeviceCredentialAction(
  _previous: DeviceCredentialActionState,
  formData: FormData,
): Promise<DeviceCredentialActionState> {
  const requestId = randomUUID();
  const deviceId = uuid(formString(formData, "deviceId"));
  const context = await authorizedMutation(true);
  if (!deviceId || !context) {
    return actionError(
      "permission_denied",
      requestId,
      "Only an active workspace owner or administrator may rotate credentials.",
    );
  }
  const pepper = context.preview ? previewPepper() : getDeviceCredentialPepper();
  if (!pepper) {
    return actionError(
      "configuration_required",
      requestId,
      "Trusted device credential configuration is unavailable.",
    );
  }
  const generated = generateDeviceCredential(pepper);
  if (context.preview) {
    return {
      status: "issued",
      deviceId,
      deviceName: "Preview device",
      credential: generated.raw,
      prefix: generated.prefix,
    };
  }
  const result = await rpc(context.adminClient!, DATABASE_FUNCTIONS.deviceRotateCredential, {
    p_actor_user_id: context.actorUserId,
    p_device_id: deviceId,
    p_credential_prefix: generated.prefix,
    p_credential_digest: generated.digest,
    p_credential_expires_at: null,
  });
  if (result.error) {
    return actionError(
      mutationCode(result.error),
      requestId,
      "The credential could not be rotated.",
    );
  }
  const issued = parseIssuedCredential(result.data, {
    deviceId,
    prefix: generated.prefix,
  });
  if (!issued) {
    return actionError("invalid_response", requestId, "The rotation response was invalid.");
  }
  revalidatePath(devicePath(deviceId));
  revalidatePath(DEVICES_PATH);
  return {
    status: "issued",
    deviceId,
    deviceName: "Device",
    credential: generated.raw,
    prefix: generated.prefix,
  };
}

export async function updateDeviceAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deviceId = uuid(formString(formData, "deviceId"));
  const expectedUpdatedAt = formString(formData, "expectedUpdatedAt");
  const name = normalizedText(formString(formData, "name"), 120, true);
  const rawType = formString(formData, "type");
  const type = TYPES.has(rawType) ? rawType : null;
  const manufacturer = optionalText(formData, "manufacturer", 120);
  const model = optionalText(formData, "model", 120);
  const serialNumber = optionalText(formData, "serialNumber", 160);
  const context = await authorizedMutation();
  if (
    !deviceId ||
    !expectedUpdatedAt ||
    !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
    !name ||
    !type ||
    !manufacturer.valid ||
    !model.valid ||
    !serialNumber.valid ||
    !context
  ) {
    redirect(
      withStatus(deviceId ? devicePath(deviceId) : DEVICES_PATH, "permission_denied", requestId),
    );
  }
  if (!context.preview) {
    const result = await rpc(context.client!, DATABASE_FUNCTIONS.deviceUpdate, {
      p_device_id: deviceId,
      p_name: name,
      p_type: type,
      p_manufacturer: manufacturer.value,
      p_model: model.value,
      p_serial_number: serialNumber.value,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (result.error) {
      redirect(withStatus(devicePath(deviceId), mutationCode(result.error), requestId));
    }
    const parsed = parseDeviceMutation(result.data, deviceId, context.workspaceId!);
    if (
      !parsed ||
      parsed.name !== name ||
      parsed.type !== type ||
      parsed.manufacturer !== manufacturer.value ||
      parsed.model !== model.value ||
      parsed.serialNumber !== serialNumber.value
    ) {
      redirect(withStatus(devicePath(deviceId), "mutation_failed", requestId));
    }
  }
  revalidatePath(devicePath(deviceId));
  revalidatePath(DEVICES_PATH);
  redirect(withStatus(devicePath(deviceId), "device_updated"));
}

export async function deviceLifecycleAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deviceId = uuid(formString(formData, "deviceId"));
  const expectedUpdatedAt = formString(formData, "expectedUpdatedAt");
  const operation = formString(formData, "operation");
  const context = await authorizedMutation();
  if (
    !deviceId ||
    !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
    !["activate", "suspend", "revoke", "delete"].includes(operation) ||
    !context
  ) {
    redirect(
      withStatus(deviceId ? devicePath(deviceId) : DEVICES_PATH, "permission_denied", requestId),
    );
  }
  if (!context.preview) {
    const functionName =
      operation === "revoke"
        ? DATABASE_FUNCTIONS.deviceRevoke
        : operation === "delete"
          ? DATABASE_FUNCTIONS.deviceDelete
          : DATABASE_FUNCTIONS.deviceSetStatus;
    const args: Record<string, unknown> = {
      p_device_id: deviceId,
      p_expected_updated_at: expectedUpdatedAt,
    };
    if (operation === "activate" || operation === "suspend") {
      args.p_status = operation === "activate" ? "active" : "suspended";
    }
    const result = await rpc(context.client!, functionName, args);
    if (result.error) {
      redirect(withStatus(devicePath(deviceId), mutationCode(result.error), requestId));
    }
    const parsed = parseDeviceMutation(result.data, deviceId, context.workspaceId!);
    const expectedStatus =
      operation === "activate" ? "active" : operation === "suspend" ? "suspended" : "revoked";
    if (
      !parsed ||
      parsed.status !== expectedStatus ||
      (operation === "delete" && !parsed.deletedAt)
    ) {
      redirect(withStatus(devicePath(deviceId), "mutation_failed", requestId));
    }
  }
  revalidatePath(devicePath(deviceId));
  revalidatePath(DEVICES_PATH);
  const status = {
    activate: "device_activated",
    suspend: "device_suspended",
    revoke: "device_revoked",
    delete: "device_deleted",
  }[operation]!;
  redirect(withStatus(operation === "delete" ? DEVICES_PATH : devicePath(deviceId), status));
}

export async function replaceDeviceGrantsAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deviceId = uuid(formString(formData, "deviceId"));
  const rawValues = formData
    .getAll("grant")
    .filter((value): value is string => typeof value === "string");
  const grouped = new Map<string, Set<DeviceGrantPermission>>();
  let invalid = rawValues.length > 300;
  for (const raw of rawValues) {
    const [rawCollectionId, permission, ...extra] = raw.split("|");
    const collectionId = uuid(rawCollectionId ?? "");
    if (!collectionId || !permission || extra.length > 0 || !GRANTS.has(permission)) {
      invalid = true;
      continue;
    }
    const permissions = grouped.get(collectionId) ?? new Set<DeviceGrantPermission>();
    permissions.add(permission as DeviceGrantPermission);
    grouped.set(collectionId, permissions);
  }
  const grants = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([collection_id, permissions]) => ({
      collection_id,
      permissions: [...permissions].sort() as DeviceGrantPermission[],
    }));
  invalid ||= grants.length > 100;
  const context = await authorizedMutation();
  if (!deviceId || invalid || !context) {
    redirect(
      withStatus(deviceId ? devicePath(deviceId) : DEVICES_PATH, "permission_denied", requestId),
    );
  }
  if (!context.preview) {
    const result = await rpc(context.client!, DATABASE_FUNCTIONS.deviceGrantsReplace, {
      p_device_id: deviceId,
      p_grants: grants,
    });
    if (result.error) {
      redirect(withStatus(devicePath(deviceId), mutationCode(result.error), requestId));
    }
    if (!parseGrantReplacement(result.data, deviceId, grants)) {
      redirect(withStatus(devicePath(deviceId), "mutation_failed", requestId));
    }
  }
  revalidatePath(devicePath(deviceId));
  redirect(withStatus(devicePath(deviceId), "grants_updated"));
}

export async function revokeDeviceCredentialAction(formData: FormData): Promise<never> {
  const requestId = randomUUID();
  const deviceId = uuid(formString(formData, "deviceId"));
  const credentialId = uuid(formString(formData, "credentialId"));
  const context = await authorizedMutation();
  if (!deviceId || !credentialId || !context) {
    redirect(
      withStatus(deviceId ? devicePath(deviceId) : DEVICES_PATH, "permission_denied", requestId),
    );
  }
  if (!context.preview) {
    const result = await rpc(context.client!, DATABASE_FUNCTIONS.deviceCredentialRevoke, {
      p_device_id: deviceId,
      p_credential_id: credentialId,
    });
    if (result.error) {
      redirect(withStatus(devicePath(deviceId), mutationCode(result.error), requestId));
    }
    if (!parseCredentialRevocation(result.data, credentialId)) {
      redirect(withStatus(devicePath(deviceId), "mutation_failed", requestId));
    }
  }
  revalidatePath(devicePath(deviceId));
  redirect(withStatus(devicePath(deviceId), "credential_revoked"));
}
