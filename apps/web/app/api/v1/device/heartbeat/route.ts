import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { heartbeatRpcArgs, parseHeartbeatData } from "@/features/devices/api-parse";
import { readBoundedJsonWithSize, requireNoQuery } from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { deviceApiSuccess } from "@/features/devices/api-response";
import { parseHeartbeatRequest } from "@/features/devices/api-validation";
import { getDeviceApiLimits } from "@/features/devices/config";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    requireNoQuery(request);
    const raw = await readBoundedJsonWithSize(request, getDeviceApiLimits().heartbeatBodyBytes);
    const body = parseHeartbeatRequest(raw.value);
    const value = await callDeviceRpc(authenticated.client, DATABASE_FUNCTIONS.deviceApiHeartbeat, {
      p_device_id: authenticated.deviceId,
      p_credential_id: authenticated.credentialId,
      p_request_id: context.requestId,
      p_request_bytes: raw.byteLength,
      ...heartbeatRpcArgs(body),
    });
    const data = parseHeartbeatData(value);
    if (!data) throw invalidDeviceRpcResponse();
    return deviceApiSuccess(context, data);
  });
}
