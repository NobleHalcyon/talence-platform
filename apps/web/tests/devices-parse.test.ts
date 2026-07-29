import { describe, expect, it } from "vitest";

import {
  parseDeviceDetail,
  parseDeviceList,
  parseIssuedCredential,
} from "@/features/devices/parse";
import { previewDeviceDetail, previewDeviceList } from "@/features/devices/preview";
import { PREVIEW_DEVICE_ID } from "@/features/devices/preview-constants";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000003001";

function databaseDevice(device: ReturnType<typeof previewDeviceList>["items"][number]) {
  return {
    device_id: device.id,
    workspace_id: device.workspaceId,
    name: device.name,
    type: device.type,
    manufacturer: device.manufacturer,
    model: device.model,
    serial_number: device.serialNumber,
    status: device.status,
    last_seen_at: device.lastSeenAt,
    last_catalog_snapshot_id: device.lastCatalogSnapshotId,
    last_catalog_snapshot_version: device.installedCatalogVersion,
    last_client_version: device.lastClientVersion,
    last_firmware_version: device.lastFirmwareVersion,
    suspended_at: device.suspendedAt,
    revoked_at: device.revokedAt,
    deleted_at: device.deletedAt,
    created_by_user_id: device.createdByUserId,
    created_at: device.createdAt,
    updated_at: device.updatedAt,
  };
}

function databaseDetail() {
  const detail = previewDeviceDetail(PREVIEW_DEVICE_ID)!;
  return {
    device: databaseDevice(detail.device),
    credentials: detail.credentials.map((credential) => ({
      credential_id: credential.id,
      prefix: credential.prefix,
      created_at: credential.createdAt,
      expires_at: credential.expiresAt,
      last_used_at: credential.lastUsedAt,
      revoked_at: credential.revokedAt,
      is_active: credential.isActive,
    })),
    grants: detail.grants.map((grant) => ({
      collection_id: grant.collectionId,
      collection_name: grant.collectionName,
      collection_status: grant.collectionStatus,
      permissions: grant.permissions,
    })),
    available_collections: detail.availableCollections.map((collection) => ({
      collection_id: collection.id,
      name: collection.name,
      status: collection.status,
    })),
    permissions: {
      can_manage: detail.permissions.canManage,
      can_register: detail.permissions.canRegister,
      can_delete: detail.permissions.canDelete,
    },
  };
}

describe("strict device administration parsing", () => {
  it("parses a bounded workspace list and binds every item to the requested workspace", () => {
    const preview = previewDeviceList("all");
    const value = {
      workspace_id: WORKSPACE_ID,
      permissions: { can_manage: true, can_register: true, can_delete: true },
      items: preview.items.map(databaseDevice),
      next_cursor: null,
      has_more: false,
    };
    const parsed = parseDeviceList(value, WORKSPACE_ID);
    expect(parsed?.workspaceId).toBe(WORKSPACE_ID);
    expect(parsed?.items[0]?.id).toBe(PREVIEW_DEVICE_ID);
    expect(
      parseDeviceList(
        {
          ...value,
          items: [{ ...value.items[0], workspace_id: PREVIEW_DEVICE_ID }],
        },
        WORKSPACE_ID,
      ),
    ).toBeNull();
    expect(parseDeviceList({ ...value, has_more: true }, WORKSPACE_ID)).toBeNull();
  });

  it("fails closed on impossible lifecycle timestamps and catalog identity pairs", () => {
    const value = databaseDevice(previewDeviceList("active").items[0]!);
    expect(
      parseDeviceList(
        {
          workspace_id: WORKSPACE_ID,
          permissions: { can_manage: true, can_register: true, can_delete: true },
          items: [{ ...value, suspended_at: "2026-07-27T12:00:00Z" }],
          next_cursor: null,
          has_more: false,
        },
        WORKSPACE_ID,
      ),
    ).toBeNull();
    expect(
      parseDeviceList(
        {
          workspace_id: WORKSPACE_ID,
          permissions: { can_manage: true, can_register: true, can_delete: true },
          items: [{ ...value, last_catalog_snapshot_id: null }],
          next_cursor: null,
          has_more: false,
        },
        WORKSPACE_ID,
      ),
    ).toBeNull();
  });

  it("parses credential metadata and grouped grants without a digest or raw credential", () => {
    const value = databaseDetail();
    const parsed = parseDeviceDetail(value, PREVIEW_DEVICE_ID, WORKSPACE_ID);
    expect(parsed?.device.id).toBe(PREVIEW_DEVICE_ID);
    expect(parsed?.credentials[0]).toMatchObject({
      prefix: "abcdef123456",
      isActive: true,
    });
    expect(parsed?.grants[0]?.collectionName).toBe("Main Collection");
    expect(JSON.stringify(parsed)).not.toContain("secret_digest");
    expect(
      parseDeviceDetail(
        {
          ...value,
          credentials: [
            ...value.credentials,
            { ...value.credentials[0], credential_id: value.credentials[1]!.credential_id },
          ],
        },
        PREVIEW_DEVICE_ID,
        WORKSPACE_ID,
      ),
    ).toBeNull();
  });

  it("binds issued credential metadata to the generated prefix and registered device", () => {
    const detail = databaseDetail();
    const credential = {
      ...detail.credentials[0],
      credential_id: "12345678-1234-4234-8234-123456789012",
      prefix: "123456abcdef",
      last_used_at: null,
    };
    const response = { device: detail.device, credential };
    expect(
      parseIssuedCredential(response, {
        workspaceId: WORKSPACE_ID,
        name: "Workshop Sorter",
        type: "talence_sorter",
        prefix: "123456abcdef",
      }),
    ).toMatchObject({
      deviceId: PREVIEW_DEVICE_ID,
      credentialId: credential.credential_id,
      prefix: "123456abcdef",
    });
    expect(
      parseIssuedCredential(response, {
        workspaceId: WORKSPACE_ID,
        name: "Workshop Sorter",
        type: "talence_sorter",
        prefix: "ffffffffffff",
      }),
    ).toBeNull();
  });
});
