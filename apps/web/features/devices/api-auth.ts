import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

import { DeviceApiError } from "./api-response";
import {
  getDeviceCredentialPepper,
  parseDeviceCredential,
  verifyDeviceCredential,
} from "./credentials";
import type { DeviceRpcClient, DeviceStorageClient } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type DeviceApiAdminClient = DeviceRpcClient & DeviceStorageClient;

export interface AuthenticatedDeviceRequest {
  client: DeviceApiAdminClient;
  credentialId: string;
  deviceId: string;
}

function unauthorized(): DeviceApiError {
  return new DeviceApiError(
    401,
    "device_credential_invalid",
    "The device credential is missing or invalid.",
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bearerCredential(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function authenticateDeviceWithClient(
  request: Request,
  client: DeviceApiAdminClient,
  pepper: Uint8Array,
  requestId: string,
): Promise<AuthenticatedDeviceRequest> {
  const raw = bearerCredential(request);
  const parsed = raw ? parseDeviceCredential(raw) : null;
  if (!raw || !parsed) throw unauthorized();

  let result: Awaited<ReturnType<DeviceRpcClient["rpc"]>>;
  try {
    result = await client.rpc(DATABASE_FUNCTIONS.deviceCredentialCandidate, {
      p_prefix: parsed.prefix,
    });
  } catch {
    throw new DeviceApiError(
      503,
      "device_auth_unavailable",
      "Device authentication is temporarily unavailable.",
    );
  }
  if (result.error) {
    throw new DeviceApiError(
      503,
      "device_auth_unavailable",
      "Device authentication is temporarily unavailable.",
    );
  }

  const candidate = record(result.data);
  const credentialId = candidate?.credential_id;
  const deviceId = candidate?.device_id;
  const prefix = candidate?.prefix;
  const digest = candidate?.secret_digest;
  const candidateShapeValid =
    typeof credentialId === "string" &&
    UUID_PATTERN.test(credentialId) &&
    typeof deviceId === "string" &&
    UUID_PATTERN.test(deviceId) &&
    prefix === parsed.prefix &&
    typeof digest === "string" &&
    DIGEST_PATTERN.test(digest);
  const digestForComparison =
    typeof digest === "string" && DIGEST_PATTERN.test(digest) ? digest : "0".repeat(64);
  const credentialVerified = verifyDeviceCredential(raw, digestForComparison, pepper) !== null;
  if (!candidateShapeValid || !credentialVerified) {
    throw unauthorized();
  }

  let touch: Awaited<ReturnType<DeviceRpcClient["rpc"]>>;
  try {
    touch = await client.rpc(DATABASE_FUNCTIONS.deviceAuthTouch, {
      p_device_id: deviceId,
      p_credential_id: credentialId,
      p_request_id: requestId,
    });
  } catch {
    throw new DeviceApiError(
      503,
      "device_auth_unavailable",
      "Device authentication is temporarily unavailable.",
    );
  }
  if (touch.error) {
    const source = `${touch.error.code ?? ""} ${touch.error.message ?? ""}`.toLowerCase();
    if (
      source.includes("device_auth_invalid") ||
      source.includes("device_revoked") ||
      source.includes("device_suspended") ||
      source.includes("credential_revoked")
    ) {
      throw unauthorized();
    }
    throw new DeviceApiError(
      503,
      "device_auth_unavailable",
      "Device authentication is temporarily unavailable.",
    );
  }

  return {
    client,
    credentialId: credentialId.toLowerCase(),
    deviceId: deviceId.toLowerCase(),
  };
}

export async function authenticateDeviceRequest(
  request: Request,
  requestId: string,
): Promise<AuthenticatedDeviceRequest> {
  const pepper = getDeviceCredentialPepper();
  const client = createAdminSupabaseClient();
  if (!pepper || !client) {
    throw new DeviceApiError(503, "device_api_unavailable", "The device API is not configured.");
  }
  return authenticateDeviceWithClient(
    request,
    client as unknown as DeviceApiAdminClient,
    pepper,
    requestId,
  );
}
