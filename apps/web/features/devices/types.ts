import type { components } from "@talence/contracts";

export const DEVICE_TYPES = ["talence_sorter", "scanner", "kiosk", "third_party"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_STATUSES = ["active", "suspended", "revoked"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_GRANT_PERMISSIONS = [
  "inventory_read",
  "inventory_write",
  "run_summary_write",
] as const;
export type DeviceGrantPermission = (typeof DEVICE_GRANT_PERMISSIONS)[number];

export type DeviceApiComponents = components["schemas"];
export type DeviceMeResponse = DeviceApiComponents["DeviceMeResponse"];
export type HeartbeatRequest = DeviceApiComponents["HeartbeatRequest"];
export type InventoryBatchRequest = DeviceApiComponents["InventoryBatchRequest"];
export type InventoryBatchResponse = DeviceApiComponents["InventoryBatchResponse"];
export type InventoryPageResponse = DeviceApiComponents["InventoryPageResponse"];
export type RunSummaryRequest = DeviceApiComponents["RunSummaryRequest"];
export type RunSummaryResponse = DeviceApiComponents["RunSummaryResponse"];
export type ErrorResponse = DeviceApiComponents["ErrorResponse"];

export interface DeviceGrant {
  collectionId: string;
  collectionName: string;
  collectionStatus: "active" | "archived";
  permissions: DeviceGrantPermission[];
}

export interface DeviceRecord {
  id: string;
  workspaceId: string;
  name: string;
  type: DeviceType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  lastClientVersion: string | null;
  lastFirmwareVersion: string | null;
  installedCatalogVersion: string | null;
  lastCatalogSnapshotId: string | null;
  suspendedAt: string | null;
  revokedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DeviceCredentialSummary {
  id: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
}

export interface DevicePermissions {
  canManage: boolean;
  canRegister: boolean;
  canDelete: boolean;
}

export interface DeviceListPage {
  workspaceId: string;
  items: DeviceRecord[];
  permissions: DevicePermissions;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DeviceDetail {
  device: DeviceRecord;
  credentials: DeviceCredentialSummary[];
  grants: DeviceGrant[];
  availableCollections: Array<{
    id: string;
    name: string;
    status: "active" | "archived";
  }>;
  permissions: DevicePermissions;
}

export type DeviceLoadFailureReason =
  | "configuration_required"
  | "invalid_response"
  | "not_found"
  | "permission_denied"
  | "request_failed";

export type DeviceLoadResult<T> =
  | { ok: true; data: T; preview: boolean }
  | { ok: false; reason: DeviceLoadFailureReason; requestId: string };

export interface DeviceRpcError {
  code?: string;
  message?: string;
  details?: unknown;
  hint?: unknown;
}

export interface DeviceRpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: DeviceRpcError | null }>;
}

export interface DeviceStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): PromiseLike<{ data: { signedUrl?: string } | null; error: DeviceRpcError | null }>;
    };
  };
}

export interface IssuedDeviceCredential {
  credential: string;
  credentialId: string;
  deviceId: string;
  prefix: string;
}

export type DeviceCredentialActionState =
  | { status: "idle" }
  | {
      status: "issued";
      deviceId: string;
      deviceName: string;
      credential: string;
      prefix: string;
    }
  | {
      status: "error";
      code: string;
      requestId: string;
      message: string;
    };
