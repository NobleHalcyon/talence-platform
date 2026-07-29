import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeLogFields, writeSecurityLog } from "@/lib/observability/security-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitized structured logging", () => {
  it("uses an explicit safe-field allowlist and bounds log-safe values", () => {
    expect(
      sanitizeLogFields({
        code: "quota_exceeded",
        request_id: "60000000-0000-4000-8000-000000000001",
        duration_ms: 42,
        replayed: false,
        email: "private@example.test",
        provider_payload: '{"token":"must-never-appear"}',
        session: "managed-session-secret",
        token: "must-never-appear",
        token_hash: "must-never-appear",
        route: "/api/v1/device/me\nforged",
      }),
    ).toEqual({
      code: "quota_exceeded",
      request_id: "60000000-0000-4000-8000-000000000001",
      duration_ms: 42,
      replayed: false,
    });
  });

  it("writes one JSON record without secrets, bodies, cookies, or arbitrary fields", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    writeSecurityLog("warn", "device.request.failed", {
      code: "rate_limited",
      request_id: "60000000-0000-4000-8000-000000000001",
      status: 429,
      credential: "raw-device-secret",
      signed_url: "https://example.test/signed?token=secret",
    });

    expect(warning).toHaveBeenCalledOnce();
    const serialized = warning.mock.calls[0]?.[0];
    expect(typeof serialized).toBe("string");
    const record = JSON.parse(String(serialized)) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "warn",
      event: "device.request.failed",
      code: "rate_limited",
      request_id: "60000000-0000-4000-8000-000000000001",
      status: 429,
    });
    expect(serialized).not.toContain("raw-device-secret");
    expect(serialized).not.toContain("private@example.test");
    expect(serialized).not.toContain("signed");
    expect(serialized).not.toContain("token");
  });
});
