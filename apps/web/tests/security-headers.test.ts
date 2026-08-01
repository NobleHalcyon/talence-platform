import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  contentSecurityPolicy,
  requestCorrelationId,
} from "@/lib/security/headers";

describe("web security headers", () => {
  it("builds a nonce-based production CSP for Scryfall, Turnstile, and the configured Supabase origin", () => {
    const policy = contentSecurityPolicy({
      nonce: "fixtureNonce123",
      production: true,
      supabaseUrl: "https://project-ref.supabase.co",
    });

    expect(policy).toContain("script-src 'self' 'nonce-fixtureNonce123' 'strict-dynamic'");
    expect(policy).toContain(
      "script-src-elem 'self' 'nonce-fixtureNonce123' https://challenges.cloudflare.com",
    );
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("img-src 'self' blob: data: https://cards.scryfall.io");
    expect(policy).toContain("https://project-ref.supabase.co");
    expect(policy).toContain("wss://project-ref.supabase.co");
    expect(policy).toContain("frame-src https://challenges.cloudflare.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows only a development eval exception and ignores malformed service origins", () => {
    const policy = contentSecurityPolicy({
      nonce: "developmentNonce",
      production: false,
      supabaseUrl: "https://user:secret@example.test/path",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("example.test");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("sets the complete response baseline and production-only HSTS", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      contentSecurityPolicy: "default-src 'self'",
      production: true,
      requestId: "60000000-0000-4000-8000-000000000001",
    });

    expect(headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("x-request-id")).toBe("60000000-0000-4000-8000-000000000001");
  });

  it("accepts only canonical UUID correlation IDs", () => {
    const fallback = () => "60000000-0000-4000-8000-000000000099";
    expect(requestCorrelationId("60000000-0000-4000-8000-000000000001", fallback)).toBe(
      "60000000-0000-4000-8000-000000000001",
    );
    expect(requestCorrelationId("attacker-controlled-log-value", fallback)).toBe(
      "60000000-0000-4000-8000-000000000099",
    );
  });
});
