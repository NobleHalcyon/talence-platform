import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX_BYTES = 6;
const SECRET_BYTES = 32;
const DIGEST_BYTES = 32;
const PREFIX_PATTERN = /^[a-f0-9]{12}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface ParsedDeviceCredential {
  prefix: string;
}

export interface GeneratedDeviceCredential extends ParsedDeviceCredential {
  digest: string;
  raw: string;
}

function pepperBuffer(pepper: string | Uint8Array): Buffer {
  const value = typeof pepper === "string" ? Buffer.from(pepper, "utf8") : Buffer.from(pepper);
  if (value.byteLength < 32) {
    throw new Error("DEVICE_CREDENTIAL_PEPPER must contain at least 32 bytes.");
  }
  return value;
}

export function getDeviceCredentialPepper(): Buffer | null {
  const configured = process.env.DEVICE_CREDENTIAL_PEPPER;
  if (!configured) return null;
  try {
    return pepperBuffer(configured);
  } catch {
    return null;
  }
}

export function parseDeviceCredential(value: string): ParsedDeviceCredential | null {
  const match = /^tlc_dev_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match || !PREFIX_PATTERN.test(match[1]!) || !SECRET_PATTERN.test(match[2]!)) return null;
  return { prefix: match[1]! };
}

export function digestDeviceCredential(raw: string, pepper: string | Uint8Array): string {
  return createHmac("sha256", pepperBuffer(pepper)).update(raw, "utf8").digest("hex");
}

export function generateDeviceCredential(pepper: string | Uint8Array): GeneratedDeviceCredential {
  const prefix = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const raw = `tlc_dev_${prefix}_${secret}`;
  return {
    prefix,
    raw,
    digest: digestDeviceCredential(raw, pepper),
  };
}

export function verifyDeviceCredential(
  raw: string,
  expectedDigest: string,
  pepper: string | Uint8Array,
): ParsedDeviceCredential | null {
  const parsed = parseDeviceCredential(raw);
  if (!parsed || !DIGEST_PATTERN.test(expectedDigest)) return null;
  const actual = Buffer.from(digestDeviceCredential(raw, pepper), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  if (actual.byteLength !== DIGEST_BYTES || expected.byteLength !== DIGEST_BYTES) return null;
  return timingSafeEqual(actual, expected) ? parsed : null;
}
