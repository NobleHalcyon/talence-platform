import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { parseInventoryBatchData } from "@/features/devices/api-parse";
import {
  readBoundedJsonWithSize,
  requireIdempotencyKey,
  requireNoQuery,
  requireUuid,
} from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { DeviceApiError, deviceApiSuccess } from "@/features/devices/api-response";
import { parseInventoryBatchRequest } from "@/features/devices/api-validation";
import { deviceInventoryWritesEnabled, getDeviceApiLimits } from "@/features/devices/config";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  route: { params: Promise<{ collectionId: string }> },
): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    requireNoQuery(request);
    if (!deviceInventoryWritesEnabled()) {
      throw new DeviceApiError(
        503,
        "device_inventory_writes_disabled",
        "Device inventory writes are temporarily disabled.",
      );
    }
    const { collectionId: rawCollectionId } = await route.params;
    const collectionId = requireUuid(rawCollectionId, "collection_id");
    const idempotencyKey = requireIdempotencyKey(request);
    const raw = await readBoundedJsonWithSize(request, getDeviceApiLimits().inventoryBodyBytes);
    const body = parseInventoryBatchRequest(raw.value);
    const value = await callDeviceRpc(
      authenticated.client,
      DATABASE_FUNCTIONS.applyDeviceInventoryBatch,
      {
        p_device_id: authenticated.deviceId,
        p_credential_id: authenticated.credentialId,
        p_request_id: context.requestId,
        p_collection_id: collectionId,
        p_idempotency_key: idempotencyKey,
        p_catalog_snapshot_version: body.catalog_snapshot_version,
        p_occurred_at: body.occurred_at,
        p_external_run_id: body.external_run_id ?? null,
        p_lines: body.lines,
        p_metadata: body.metadata ?? {},
        p_request_bytes: raw.byteLength,
      },
    );
    const data = parseInventoryBatchData(value, collectionId, body.lines);
    if (!data) throw invalidDeviceRpcResponse();
    return deviceApiSuccess(context, data, data.replayed ? 200 : 201);
  });
}
