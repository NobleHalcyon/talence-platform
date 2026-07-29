import { DeviceApiError } from "./api-response";

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function concatenate(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export interface BoundedJsonBody {
  byteLength: number;
  value: unknown;
}

export async function readBoundedJsonWithSize(
  request: Request,
  maximumBytes: number,
): Promise<BoundedJsonBody> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new DeviceApiError(
      415,
      "content_type_unsupported",
      "Content-Type must be application/json with UTF-8 encoding.",
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new DeviceApiError(400, "content_length_invalid", "Content-Length is invalid.");
    }
    if (Number(declaredLength) > maximumBytes) {
      throw new DeviceApiError(413, "payload_too_large", "The request body exceeds its limit.", {
        maximum_bytes: maximumBytes,
      });
    }
  }

  if (!request.body) {
    throw new DeviceApiError(400, "body_required", "A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new DeviceApiError(413, "payload_too_large", "The request body exceeds its limit.", {
          maximum_bytes: maximumBytes,
        });
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (byteLength === 0) {
    throw new DeviceApiError(400, "body_required", "A JSON request body is required.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(concatenate(chunks, byteLength));
  } catch {
    throw new DeviceApiError(400, "body_encoding_invalid", "The request body must be valid UTF-8.");
  }

  try {
    return { value: JSON.parse(text) as unknown, byteLength };
  } catch {
    throw new DeviceApiError(400, "json_invalid", "The request body is not valid JSON.");
  }
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  return (await readBoundedJsonWithSize(request, maximumBytes)).value;
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new DeviceApiError(
      400,
      "idempotency_key_invalid",
      "Idempotency-Key must contain 8 to 200 visible ASCII characters.",
    );
  }
  return value;
}

export function requireUuid(value: string, subject: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new DeviceApiError(400, `${subject}_invalid`, `${subject} must be a UUID.`);
  }
  return normalized;
}

export function requireNoQuery(request: Request): void {
  if (new URL(request.url).search.length > 0) {
    throw new DeviceApiError(400, "query_invalid", "This endpoint does not accept query fields.");
  }
}

export interface InventoryPageQuery {
  cursor: string | null;
  limit: number;
}

export function parseInventoryPageQuery(
  url: URL,
  defaultLimit: number,
  maximumLimit: number,
): InventoryPageQuery {
  for (const key of url.searchParams.keys()) {
    if (key !== "cursor" && key !== "limit") {
      throw new DeviceApiError(
        400,
        "query_invalid",
        "The inventory query contains an unknown field.",
      );
    }
  }
  const cursor = url.searchParams.get("cursor");
  if (
    (cursor !== null &&
      (cursor.length < 1 || cursor.length > 1_024 || /[\u0000-\u001f]/.test(cursor))) ||
    url.searchParams.getAll("cursor").length > 1
  ) {
    throw new DeviceApiError(400, "cursor_invalid", "The inventory cursor is invalid.");
  }
  const rawLimit = url.searchParams.get("limit");
  if (url.searchParams.getAll("limit").length > 1) {
    throw new DeviceApiError(400, "limit_invalid", "The inventory limit is invalid.");
  }
  if (rawLimit === null) return { cursor, limit: defaultLimit };
  if (!/^\d+$/.test(rawLimit)) {
    throw new DeviceApiError(400, "limit_invalid", "The inventory limit is invalid.");
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new DeviceApiError(
      400,
      "limit_invalid",
      `The inventory limit must be 1-${maximumLimit}.`,
    );
  }
  return { cursor, limit };
}

export interface ManifestQuery {
  clientVersion: string;
  currentVersion: string | null;
  supportedSchemaVersions: number[];
}

export function parseManifestQuery(url: URL): ManifestQuery {
  const allowed = new Set(["current_version", "client_version", "supported_schema_versions"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new DeviceApiError(
        400,
        "query_invalid",
        "The manifest query contains an unknown field.",
      );
    }
  }
  const currentVersion = url.searchParams.get("current_version");
  const clientVersion = url.searchParams.get("client_version") ?? "";
  const schemas = url.searchParams.get("supported_schema_versions") ?? "";
  const normalizedCurrentVersion = currentVersion?.trim() || null;
  const normalizedClientVersion = clientVersion.trim();
  if (
    url.searchParams.getAll("current_version").length > 1 ||
    (normalizedCurrentVersion !== null &&
      (normalizedCurrentVersion.length > 160 || /[\u0000-\u001f]/.test(normalizedCurrentVersion)))
  ) {
    throw new DeviceApiError(400, "current_version_invalid", "current_version is invalid.");
  }
  if (
    url.searchParams.getAll("client_version").length !== 1 ||
    normalizedClientVersion.length < 1 ||
    normalizedClientVersion.length > 80 ||
    /[\u0000-\u001f]/.test(normalizedClientVersion)
  ) {
    throw new DeviceApiError(400, "client_version_invalid", "client_version is invalid.");
  }
  if (
    url.searchParams.getAll("supported_schema_versions").length !== 1 ||
    !/^\d+(,\d+)*$/.test(schemas)
  ) {
    throw new DeviceApiError(
      400,
      "snapshot_schema_versions_invalid",
      "supported_schema_versions must be a comma-separated list of positive integers.",
    );
  }
  const supportedSchemaVersions = [...new Set(schemas.split(",").map(Number))];
  if (
    supportedSchemaVersions.length > 16 ||
    supportedSchemaVersions.some(
      (version) => !Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647,
    )
  ) {
    throw new DeviceApiError(
      400,
      "snapshot_schema_versions_invalid",
      "supported_schema_versions is outside the supported bounds.",
    );
  }
  return {
    currentVersion: normalizedCurrentVersion,
    clientVersion: normalizedClientVersion,
    supportedSchemaVersions,
  };
}
