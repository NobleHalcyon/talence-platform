import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { parseDeviceMeData } from "@/features/devices/api-parse";
import { requireNoQuery } from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { deviceApiSuccess } from "@/features/devices/api-response";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    context.deviceId = authenticated.deviceId;
    requireNoQuery(request);
    const value = await callDeviceRpc(authenticated.client, DATABASE_FUNCTIONS.deviceApiMe, {
      p_device_id: authenticated.deviceId,
      p_credential_id: authenticated.credentialId,
      p_request_id: context.requestId,
      p_request_bytes: 0,
    });
    const data = parseDeviceMeData(value, authenticated.deviceId);
    if (!data) throw invalidDeviceRpcResponse();
    return deviceApiSuccess(context, data);
  });
}
