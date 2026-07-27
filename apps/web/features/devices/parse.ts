import {
  DEVICE_GRANT_PERMISSIONS,
  DEVICE_STATUSES,
  DEVICE_TYPES,
  type DeviceCredentialSummary,
  type DeviceDetail,
  type DeviceGrant,
  type DeviceGrantPermission,
  type DeviceListPage,
  type DevicePermissions,
  type DeviceRecord,
  type IssuedDeviceCredential,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIX_PATTERN = /^[a-z0-9]{12,32}$/;
const TYPES = new Set<string>(DEVICE_TYPES);
const STATUSES = new Set<string>(DEVICE_STATUSES);
const PERMISSIONS = new Set<string>(DEVICE_GRANT_PERMISSIONS);
const COLLECTION_STATUSES = new Set(["active", "archived"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum ? value : null;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
  return value === null ? null : (text(value, maximum) ?? undefined);
}

function instant(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function nullableInstant(value: unknown): string | null | undefined {
  return value === null ? null : (instant(value) ?? undefined);
}

function nullableUuid(value: unknown): string | null | undefined {
  return value === null ? null : (uuid(value) ?? undefined);
}

function parsePermissions(value: unknown): DevicePermissions | null {
  const permissions = record(value);
  return permissions &&
    typeof permissions.can_manage === "boolean" &&
    typeof permissions.can_register === "boolean" &&
    typeof permissions.can_delete === "boolean"
    ? {
        canManage: permissions.can_manage,
        canRegister: permissions.can_register,
        canDelete: permissions.can_delete,
      }
    : null;
}

export function parseDeviceRecord(
  value: unknown,
  expected: { deviceId?: string; workspaceId?: string } = {},
): DeviceRecord | null {
  const item = record(value);
  const id = uuid(item?.device_id);
  const workspaceId = uuid(item?.workspace_id);
  const name = text(item?.name, 120);
  const type = typeof item?.type === "string" && TYPES.has(item.type) ? item.type : null;
  const manufacturer = nullableText(item?.manufacturer, 120);
  const model = nullableText(item?.model, 120);
  const serialNumber = nullableText(item?.serial_number, 160);
  const status = typeof item?.status === "string" && STATUSES.has(item.status) ? item.status : null;
  const lastSeenAt = nullableInstant(item?.last_seen_at);
  const lastCatalogSnapshotId = nullableUuid(item?.last_catalog_snapshot_id);
  const installedCatalogVersion = nullableText(item?.last_catalog_snapshot_version, 160);
  const lastClientVersion = nullableText(item?.last_client_version, 80);
  const lastFirmwareVersion = nullableText(item?.last_firmware_version, 80);
  const suspendedAt = nullableInstant(item?.suspended_at);
  const revokedAt = nullableInstant(item?.revoked_at);
  const deletedAt = nullableInstant(item?.deleted_at);
  const createdByUserId = uuid(item?.created_by_user_id);
  const createdAt = instant(item?.created_at);
  const updatedAt = instant(item?.updated_at);
  if (
    !item ||
    !id ||
    (expected.deviceId && id !== expected.deviceId) ||
    !workspaceId ||
    (expected.workspaceId && workspaceId !== expected.workspaceId) ||
    !name ||
    !type ||
    manufacturer === undefined ||
    model === undefined ||
    serialNumber === undefined ||
    !status ||
    lastSeenAt === undefined ||
    lastCatalogSnapshotId === undefined ||
    installedCatalogVersion === undefined ||
    lastClientVersion === undefined ||
    lastFirmwareVersion === undefined ||
    suspendedAt === undefined ||
    revokedAt === undefined ||
    deletedAt === undefined ||
    !createdByUserId ||
    !createdAt ||
    !updatedAt ||
    (status === "active" && (suspendedAt !== null || revokedAt !== null || deletedAt !== null)) ||
    (status === "suspended" && (!suspendedAt || revokedAt !== null || deletedAt !== null)) ||
    (status === "revoked" && !revokedAt) ||
    (deletedAt !== null && status !== "revoked") ||
    Boolean(lastCatalogSnapshotId) !== Boolean(installedCatalogVersion)
  ) {
    return null;
  }
  return {
    id,
    workspaceId,
    name,
    type: type as DeviceRecord["type"],
    manufacturer,
    model,
    serialNumber,
    status: status as DeviceRecord["status"],
    lastSeenAt,
    lastClientVersion,
    lastFirmwareVersion,
    installedCatalogVersion,
    lastCatalogSnapshotId,
    suspendedAt,
    revokedAt,
    createdByUserId,
    createdAt,
    updatedAt,
    deletedAt,
  };
}

function parseCredential(value: unknown): DeviceCredentialSummary | null {
  const item = record(value);
  const id = uuid(item?.credential_id);
  const prefix =
    typeof item?.prefix === "string" && PREFIX_PATTERN.test(item.prefix) ? item.prefix : null;
  const createdAt = instant(item?.created_at);
  const expiresAt = nullableInstant(item?.expires_at);
  const lastUsedAt = nullableInstant(item?.last_used_at);
  const revokedAt = nullableInstant(item?.revoked_at);
  if (
    !item ||
    !id ||
    !prefix ||
    !createdAt ||
    expiresAt === undefined ||
    lastUsedAt === undefined ||
    revokedAt === undefined ||
    typeof item.is_active !== "boolean" ||
    (revokedAt !== null && item.is_active)
  ) {
    return null;
  }
  return {
    id,
    prefix,
    createdAt,
    expiresAt,
    lastUsedAt,
    revokedAt,
    isActive: item.is_active,
  };
}

function parseGrant(value: unknown): DeviceGrant | null {
  const item = record(value);
  const collectionId = uuid(item?.collection_id);
  const collectionName = text(item?.collection_name, 120);
  const collectionStatus =
    typeof item?.collection_status === "string" && COLLECTION_STATUSES.has(item.collection_status)
      ? item.collection_status
      : null;
  if (
    !item ||
    !collectionId ||
    !collectionName ||
    !collectionStatus ||
    !Array.isArray(item.permissions) ||
    item.permissions.length > DEVICE_GRANT_PERMISSIONS.length
  ) {
    return null;
  }
  const permissions = item.permissions.filter(
    (permission): permission is DeviceGrantPermission =>
      typeof permission === "string" && PERMISSIONS.has(permission),
  );
  if (
    permissions.length !== item.permissions.length ||
    new Set(permissions).size !== permissions.length
  ) {
    return null;
  }
  return {
    collectionId,
    collectionName,
    collectionStatus: collectionStatus as DeviceGrant["collectionStatus"],
    permissions,
  };
}

export function parseDeviceList(
  value: unknown,
  expectedWorkspaceId: string,
  maximumItems = 50,
): DeviceListPage | null {
  const root = record(value);
  const workspaceId = uuid(root?.workspace_id);
  const permissions = parsePermissions(root?.permissions);
  const nextCursor =
    root?.next_cursor === null || typeof root?.next_cursor === "string"
      ? root.next_cursor
      : undefined;
  if (
    !root ||
    workspaceId !== expectedWorkspaceId ||
    !permissions ||
    !Array.isArray(root.items) ||
    root.items.length > maximumItems ||
    nextCursor === undefined ||
    typeof root.has_more !== "boolean" ||
    root.has_more !== Boolean(nextCursor)
  ) {
    return null;
  }
  const items: DeviceRecord[] = [];
  const ids = new Set<string>();
  for (const raw of root.items) {
    const item = parseDeviceRecord(raw, { workspaceId: expectedWorkspaceId });
    if (!item || ids.has(item.id) || item.deletedAt !== null) return null;
    ids.add(item.id);
    items.push(item);
  }
  return {
    workspaceId,
    permissions,
    items,
    nextCursor,
    hasMore: root.has_more,
  };
}

export function parseDeviceDetail(
  value: unknown,
  expectedDeviceId: string,
  expectedWorkspaceId: string,
): DeviceDetail | null {
  const root = record(value);
  const device = parseDeviceRecord(root?.device, {
    deviceId: expectedDeviceId,
    workspaceId: expectedWorkspaceId,
  });
  const permissions = parsePermissions(root?.permissions);
  if (
    !root ||
    !device ||
    !permissions ||
    !Array.isArray(root.credentials) ||
    root.credentials.length > 100 ||
    !Array.isArray(root.grants) ||
    root.grants.length > 500 ||
    !Array.isArray(root.available_collections) ||
    root.available_collections.length > 500
  ) {
    return null;
  }
  const credentials: DeviceCredentialSummary[] = [];
  const credentialIds = new Set<string>();
  const prefixes = new Set<string>();
  for (const raw of root.credentials) {
    const credential = parseCredential(raw);
    if (
      !credential ||
      credentialIds.has(credential.id) ||
      prefixes.has(credential.prefix) ||
      (device.status === "revoked" && credential.isActive)
    ) {
      return null;
    }
    credentialIds.add(credential.id);
    prefixes.add(credential.prefix);
    credentials.push(credential);
  }
  const availableCollections: DeviceDetail["availableCollections"] = [];
  const availableIds = new Set<string>();
  for (const raw of root.available_collections) {
    const item = record(raw);
    const id = uuid(item?.collection_id);
    const name = text(item?.name, 120);
    const status =
      typeof item?.status === "string" && COLLECTION_STATUSES.has(item.status) ? item.status : null;
    if (!item || !id || !name || !status || availableIds.has(id)) return null;
    availableIds.add(id);
    availableCollections.push({
      id,
      name,
      status: status as "active" | "archived",
    });
  }
  const grants: DeviceGrant[] = [];
  const grantIds = new Set<string>();
  for (const raw of root.grants) {
    const grant = parseGrant(raw);
    if (!grant || grantIds.has(grant.collectionId) || !availableIds.has(grant.collectionId)) {
      return null;
    }
    grantIds.add(grant.collectionId);
    grants.push(grant);
  }
  return { device, credentials, grants, availableCollections, permissions };
}

export function parseIssuedCredential(
  value: unknown,
  expected: {
    deviceId?: string;
    workspaceId?: string;
    name?: string;
    type?: DeviceRecord["type"];
    prefix: string;
  },
): IssuedDeviceCredential | null {
  const root = record(value);
  const parsedDevice = root?.device
    ? parseDeviceRecord(root.device, {
        deviceId: expected.deviceId,
        workspaceId: expected.workspaceId,
      })
    : null;
  const deviceId = uuid(root?.device_id) ?? parsedDevice?.id ?? null;
  const credential = parseCredential(root?.credential);
  if (
    !root ||
    !deviceId ||
    (expected.deviceId && deviceId !== expected.deviceId) ||
    (expected.workspaceId && !parsedDevice) ||
    (expected.name && parsedDevice?.name !== expected.name) ||
    (expected.type && parsedDevice?.type !== expected.type) ||
    !credential ||
    credential.prefix !== expected.prefix ||
    !credential.isActive
  ) {
    return null;
  }
  return {
    credential: "",
    credentialId: credential.id,
    deviceId,
    prefix: credential.prefix,
  };
}

export function parseCredentialRevocation(
  value: unknown,
  expectedCredentialId: string,
): DeviceCredentialSummary | null {
  const credential = parseCredential(record(value)?.credential);
  return credential &&
    credential.id === expectedCredentialId &&
    credential.revokedAt !== null &&
    !credential.isActive
    ? credential
    : null;
}

export function parseDeviceMutation(
  value: unknown,
  expectedDeviceId: string,
  expectedWorkspaceId: string,
): DeviceRecord | null {
  return parseDeviceRecord(record(value)?.device, {
    deviceId: expectedDeviceId,
    workspaceId: expectedWorkspaceId,
  });
}

export function parseGrantReplacement(
  value: unknown,
  expectedDeviceId: string,
  expectedGrants: Array<{ collection_id: string; permissions: DeviceGrantPermission[] }>,
): DeviceGrant[] | null {
  const root = record(value);
  if (uuid(root?.device_id) !== expectedDeviceId || !Array.isArray(root?.grants)) return null;
  const expected = new Map(
    expectedGrants.map((grant) => [grant.collection_id, [...grant.permissions].sort().join(",")]),
  );
  const grants: DeviceGrant[] = [];
  for (const raw of root.grants) {
    const grant = parseGrant(raw);
    if (!grant || expected.get(grant.collectionId) !== [...grant.permissions].sort().join(",")) {
      return null;
    }
    grants.push(grant);
  }
  return grants.length === expected.size ? grants : null;
}
