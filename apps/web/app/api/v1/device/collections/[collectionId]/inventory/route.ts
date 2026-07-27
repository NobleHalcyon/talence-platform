import { Buffer } from "node:buffer";

import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { parseInventoryPageData } from "@/features/devices/api-parse";
import { parseInventoryPageQuery, requireUuid } from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { deviceApiSuccess } from "@/features/devices/api-response";
import { getDeviceApiLimits } from "@/features/devices/config";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  route: { params: Promise<{ collectionId: string }> },
): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    const { collectionId: rawCollectionId } = await route.params;
    const collectionId = requireUuid(rawCollectionId, "collection_id");
    const url = new URL(request.url);
    const limits = getDeviceApiLimits();
    const query = parseInventoryPageQuery(
      url,
      limits.inventoryPageDefault,
      limits.inventoryPageMaximum,
    );
    const value = await callDeviceRpc(
      authenticated.client,
      DATABASE_FUNCTIONS.deviceApiInventoryPage,
      {
        p_device_id: authenticated.deviceId,
        p_credential_id: authenticated.credentialId,
        p_request_id: context.requestId,
        p_collection_id: collectionId,
        p_after: query.cursor,
        p_limit: query.limit,
        p_request_bytes: Buffer.byteLength(url.search, "utf8"),
      },
    );
    const page = parseInventoryPageData(value, collectionId);
    if (!page || page.data.length > query.limit) throw invalidDeviceRpcResponse();
    return deviceApiSuccess(context, page.data, 200, {
      next_cursor: page.nextCursor,
    });
  });
}
