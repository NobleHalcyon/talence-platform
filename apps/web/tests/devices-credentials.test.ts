import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  digestDeviceCredential,
  generateDeviceCredential,
  parseDeviceCredential,
  verifyDeviceCredential,
} from "@/features/devices/credentials";

const PEPPER = Buffer.alloc(32, 0x5a);

describe("device credentials", () => {
  it("generates a DB-safe prefix and exactly 256 bits of base64url secret material", () => {
    const generated = generateDeviceCredential(PEPPER);
    const match = /^tlc_dev_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/.exec(generated.raw);

    expect(match?.[1]).toBe(generated.prefix);
    expect(Buffer.from(match?.[2] ?? "", "base64url")).toHaveLength(32);
    expect(generated.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.digest).not.toContain(match?.[2] ?? "");
  });

  it("stores the HMAC-SHA-256 of the full canonical credential and verifies in constant-time code", () => {
    const raw = `tlc_dev_abcdef123456_${Buffer.alloc(32, 0x3c).toString("base64url")}`;
    const expected = createHmac("sha256", PEPPER).update(raw, "utf8").digest("hex");

    expect(digestDeviceCredential(raw, PEPPER)).toBe(expected);
    expect(verifyDeviceCredential(raw, expected, PEPPER)).toEqual({
      prefix: "abcdef123456",
    });
    expect(
      verifyDeviceCredential(raw.replace(/.$/, raw.endsWith("A") ? "B" : "A"), expected, PEPPER),
    ).toBeNull();
  });

  it("rejects noncanonical prefixes, malformed secrets, digests, and weak peppers", () => {
    const secret = Buffer.alloc(32, 0x44).toString("base64url");
    expect(parseDeviceCredential(`tlc_dev_ABCDEF123456_${secret}`)).toBeNull();
    expect(parseDeviceCredential(`tlc_dev_abcdef12345-_${secret}`)).toBeNull();
    expect(parseDeviceCredential("tlc_dev_abcdef123456_short")).toBeNull();
    expect(verifyDeviceCredential(`tlc_dev_abcdef123456_${secret}`, "bad", PEPPER)).toBeNull();
    expect(() => generateDeviceCredential("weak")).toThrow(/at least 32 bytes/);
  });
});
