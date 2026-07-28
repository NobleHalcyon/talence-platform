export interface SnapshotSignedUrlBinding {
  bucket: string;
  objectPath: string;
  projectUrl: string;
}

function encodedObjectPath(bucket: string, objectPath: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `/storage/v1/object/sign/${encodedBucket}/${encodedPath}`;
}

export function isSafeSnapshotSignedUrl(
  value: string,
  binding: SnapshotSignedUrlBinding,
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  let url: URL;
  let project: URL;
  try {
    url = new URL(value);
    project = new URL(binding.projectUrl);
  } catch {
    return false;
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.origin !== project.origin ||
    url.pathname !== encodedObjectPath(binding.bucket, binding.objectPath) ||
    !url.searchParams.get("token")
  ) {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (nodeEnvironment === "production" || url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}
