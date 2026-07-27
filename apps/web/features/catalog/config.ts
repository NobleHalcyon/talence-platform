export function catalogSyncEnabled(): boolean {
  return process.env.FEATURE_CATALOG_SYNC_ENABLED === "true";
}

export function staticCatalogPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW === "true"
  );
}
