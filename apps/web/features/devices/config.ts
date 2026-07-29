const TRUE = "true";

export function staticDevicePreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW === TRUE
  );
}

export function deviceInventoryWritesEnabled(): boolean {
  return process.env.FEATURE_DEVICE_INVENTORY_WRITES_ENABLED === TRUE;
}

export function snapshotDownloadsEnabled(): boolean {
  return process.env.FEATURE_SNAPSHOT_DOWNLOADS_ENABLED === TRUE;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export interface DeviceApiLimits {
  heartbeatBodyBytes: number;
  inventoryBodyBytes: number;
  runBodyBytes: number;
  signedUrlSeconds: number;
  inventoryPageDefault: number;
  inventoryPageMaximum: number;
}

export function getDeviceApiLimits(): DeviceApiLimits {
  return {
    heartbeatBodyBytes: boundedInteger(
      process.env.TALENCE_DEVICE_HEARTBEAT_MAX_BODY_BYTES,
      16 * 1024,
      1_024,
      64 * 1024,
    ),
    inventoryBodyBytes: boundedInteger(
      process.env.TALENCE_DEVICE_INVENTORY_MAX_BODY_BYTES,
      256 * 1024,
      32 * 1024,
      1024 * 1024,
    ),
    runBodyBytes: boundedInteger(
      process.env.TALENCE_DEVICE_RUN_MAX_BODY_BYTES,
      32 * 1024,
      4 * 1024,
      128 * 1024,
    ),
    signedUrlSeconds: boundedInteger(
      process.env.TALENCE_SNAPSHOT_SIGNED_URL_SECONDS,
      600,
      60,
      3_600,
    ),
    inventoryPageDefault: 50,
    inventoryPageMaximum: 200,
  };
}

export function getCatalogSnapshotBucket(): string {
  const configured = process.env.TALENCE_CATALOG_SNAPSHOT_BUCKET?.trim();
  return configured && /^[a-z0-9][a-z0-9_-]{2,62}$/.test(configured)
    ? configured
    : "catalog-snapshots";
}
