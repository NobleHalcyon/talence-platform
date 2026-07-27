export function isSafeSnapshotSignedUrl(
  value: string,
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (nodeEnvironment === "production" || url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}
