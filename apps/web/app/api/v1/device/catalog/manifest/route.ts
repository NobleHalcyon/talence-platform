import { Buffer } from "node:buffer";

import { parseCatalogSnapshotManifest } from "@talence/contracts";

import { authenticateDeviceRequest } from "@/features/devices/api-auth";
import { handleDeviceApiRequest } from "@/features/devices/api-handler";
import { parseSnapshotManifestSource } from "@/features/devices/api-parse";
import { parseManifestQuery } from "@/features/devices/api-request";
import { invalidDeviceRpcResponse, callDeviceRpc } from "@/features/devices/api-rpc";
import { DeviceApiError, deviceApiSuccess } from "@/features/devices/api-response";
import { isSafeSnapshotSignedUrl } from "@/features/devices/signed-url";
import {
  getCatalogSnapshotBucket,
  getDeviceApiLimits,
  snapshotDownloadsEnabled,
} from "@/features/devices/config";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleDeviceApiRequest(request, async (context) => {
    const authenticated = await authenticateDeviceRequest(request, context.requestId);
    if (!snapshotDownloadsEnabled()) {
      throw new DeviceApiError(
        503,
        "snapshot_downloads_disabled",
        "Catalog snapshot downloads are temporarily disabled.",
      );
    }
    const url = new URL(request.url);
    const query = parseManifestQuery(url);
    const value = await callDeviceRpc(
      authenticated.client,
      DATABASE_FUNCTIONS.deviceApiCatalogManifest,
      {
        p_device_id: authenticated.deviceId,
        p_credential_id: authenticated.credentialId,
        p_request_id: context.requestId,
        p_current_version: query.currentVersion,
        p_client_version: query.clientVersion,
        p_supported_schema_versions: query.supportedSchemaVersions,
        p_request_bytes: Buffer.byteLength(url.search, "utf8"),
      },
    );
    const source = parseSnapshotManifestSource(value);
    if (
      !source ||
      source.storageBucket !== getCatalogSnapshotBucket() ||
      source.storagePath !== `mtg/${source.manifest.latest.version}/catalog.sqlite`
    ) {
      throw invalidDeviceRpcResponse();
    }

    let download: { url: string; expires_at: string } | null = null;
    if (!source.manifest.up_to_date) {
      const seconds = getDeviceApiLimits().signedUrlSeconds;
      const signed = await authenticated.client.storage
        .from(source.storageBucket)
        .createSignedUrl(source.storagePath, seconds);
      const signedUrl = signed.data?.signedUrl;
      if (signed.error || !signedUrl) {
        throw new DeviceApiError(
          503,
          "snapshot_signing_unavailable",
          "The catalog snapshot download could not be signed. Retry later.",
        );
      }
      if (!isSafeSnapshotSignedUrl(signedUrl)) {
        throw invalidDeviceRpcResponse();
      }
      download = {
        url: signedUrl,
        expires_at: new Date(Date.now() + seconds * 1_000).toISOString(),
      };
    }

    let data;
    try {
      data = parseCatalogSnapshotManifest({
        ...source.manifest,
        latest: {
          ...source.manifest.latest,
          download,
        },
      });
    } catch {
      throw invalidDeviceRpcResponse();
    }
    return deviceApiSuccess(context, data);
  });
}
