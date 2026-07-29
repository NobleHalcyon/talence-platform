import {
  PREVIEW_ARCHIVED_COLLECTION_ID,
  PREVIEW_COLLECTION_ID,
  PREVIEW_TRADE_COLLECTION_ID,
  PREVIEW_WORKSPACE_ID,
} from "@/features/collections/preview-constants";

import { PREVIEW_DEVICE_ID, PREVIEW_SUSPENDED_DEVICE_ID } from "./preview-constants";
import type { DeviceCredentialSummary, DeviceDetail, DeviceListPage, DeviceRecord } from "./types";

const ACTIVE_DEVICE: DeviceRecord = {
  id: PREVIEW_DEVICE_ID,
  workspaceId: PREVIEW_WORKSPACE_ID,
  name: "Workshop Sorter",
  type: "talence_sorter",
  manufacturer: "Talence Labs",
  model: "Private beta rig",
  serialNumber: "TL-PREVIEW-001",
  status: "active",
  lastSeenAt: "2026-07-27T14:02:00.000Z",
  lastClientVersion: "talence-robot/0.5.0",
  lastFirmwareVersion: "controller/0.3.1",
  installedCatalogVersion: "mtg-20260727T120000Z-a1b2c3d4-s1",
  lastCatalogSnapshotId: "00000000-0000-4000-8000-000000009001",
  suspendedAt: null,
  revokedAt: null,
  createdByUserId: "00000000-0000-4000-8000-000000001001",
  createdAt: "2026-07-26T18:00:00.000Z",
  updatedAt: "2026-07-27T14:02:00.000Z",
  deletedAt: null,
};

const SUSPENDED_DEVICE: DeviceRecord = {
  ...ACTIVE_DEVICE,
  id: PREVIEW_SUSPENDED_DEVICE_ID,
  name: "Intake Scanner",
  type: "scanner",
  manufacturer: null,
  model: null,
  serialNumber: null,
  status: "suspended",
  lastSeenAt: null,
  lastClientVersion: null,
  lastFirmwareVersion: null,
  installedCatalogVersion: null,
  lastCatalogSnapshotId: null,
  suspendedAt: "2026-07-27T11:00:00.000Z",
  createdAt: "2026-07-27T09:15:00.000Z",
  updatedAt: "2026-07-27T11:00:00.000Z",
};

const CREDENTIALS: DeviceCredentialSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000008001",
    prefix: "abcdef123456",
    createdAt: "2026-07-26T18:00:00.000Z",
    expiresAt: null,
    lastUsedAt: "2026-07-27T14:02:00.000Z",
    revokedAt: null,
    isActive: true,
  },
  {
    id: "00000000-0000-4000-8000-000000008002",
    prefix: "oldkey654321",
    createdAt: "2026-07-26T12:00:00.000Z",
    expiresAt: null,
    lastUsedAt: "2026-07-26T17:58:00.000Z",
    revokedAt: "2026-07-26T18:00:00.000Z",
    isActive: false,
  },
];

export function previewDeviceList(status: string | null = null): DeviceListPage {
  const items = [ACTIVE_DEVICE, SUSPENDED_DEVICE].filter(
    (device) => !status || status === "all" || device.status === status,
  );
  return {
    workspaceId: PREVIEW_WORKSPACE_ID,
    items,
    permissions: {
      canManage: true,
      canRegister: true,
      canDelete: true,
    },
    nextCursor: null,
    hasMore: false,
  };
}

export function previewDeviceDetail(deviceId = PREVIEW_DEVICE_ID): DeviceDetail | null {
  const device =
    deviceId === PREVIEW_DEVICE_ID
      ? ACTIVE_DEVICE
      : deviceId === PREVIEW_SUSPENDED_DEVICE_ID
        ? SUSPENDED_DEVICE
        : null;
  if (!device) return null;
  return {
    device,
    credentials: device.id === PREVIEW_DEVICE_ID ? CREDENTIALS : [],
    grants:
      device.id === PREVIEW_DEVICE_ID
        ? [
            {
              collectionId: PREVIEW_COLLECTION_ID,
              collectionName: "Main Collection",
              collectionStatus: "active",
              permissions: ["inventory_read", "inventory_write", "run_summary_write"],
            },
            {
              collectionId: PREVIEW_TRADE_COLLECTION_ID,
              collectionName: "Trade Binder",
              collectionStatus: "active",
              permissions: ["inventory_read"],
            },
          ]
        : [],
    availableCollections: [
      { id: PREVIEW_COLLECTION_ID, name: "Main Collection", status: "active" },
      { id: PREVIEW_TRADE_COLLECTION_ID, name: "Trade Binder", status: "active" },
      {
        id: PREVIEW_ARCHIVED_COLLECTION_ID,
        name: "Archived Intake",
        status: "archived",
      },
    ],
    permissions: {
      canManage: true,
      canRegister: true,
      canDelete: device.status === "revoked",
    },
  };
}
