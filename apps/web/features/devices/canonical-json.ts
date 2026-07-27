import { createHash } from "node:crypto";

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON accepts finite numbers only.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => serialize(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${serialize(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Value is not canonical JSON.");
}

export function canonicalJson(value: unknown): string {
  return serialize(value);
}

export function canonicalJsonSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
