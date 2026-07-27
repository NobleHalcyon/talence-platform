import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { parseRunSummaryData } from "@/features/devices/api-parse";
import {
  readBoundedJsonWithSize,
  requireIdempotencyKey,
  requireNoQuery,
} from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { deviceApiSuccess } from "@/features/devices/api-response";
import { parseRunSummaryRequest } from "@/features/devices/api-validation";
import { getDeviceApiLimits } from "@/features/devices/config";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    requireNoQuery(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const raw = await readBoundedJsonWithSize(request, getDeviceApiLimits().runBodyBytes);
    const body = parseRunSummaryRequest(raw.value);
    const value = await callDeviceRpc(
      authenticated.client,
      DATABASE_FUNCTIONS.deviceApiCreateRunSummary,
      {
        p_device_id: authenticated.deviceId,
        p_credential_id: authenticated.credentialId,
        p_request_id: context.requestId,
        p_idempotency_key: idempotencyKey,
        p_external_run_id: body.external_run_id,
        p_collection_id: body.collection_id,
        p_status: body.status,
        p_catalog_snapshot_version: body.catalog_snapshot_version,
        p_started_at: body.started_at,
        p_completed_at: body.completed_at,
        p_counts: body.counts,
        p_diagnostic_code: body.diagnostic_code ?? null,
        p_metadata: body.metadata ?? {},
        p_request_bytes: raw.byteLength,
      },
    );
    const data = parseRunSummaryData(value, body.external_run_id);
    if (!data) throw invalidDeviceRpcResponse();
    return deviceApiSuccess(context, data, data.replayed ? 200 : 201);
  });
}
