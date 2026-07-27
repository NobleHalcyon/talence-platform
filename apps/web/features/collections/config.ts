export function staticCollectionPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW === "true"
  );
}
