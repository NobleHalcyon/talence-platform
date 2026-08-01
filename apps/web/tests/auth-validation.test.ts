import { describe, expect, it } from "vitest";

import {
  normalizeEmail,
  normalizeHandle,
  normalizeLoginIdentifier,
  parseCredentials,
  parseDateExpiration,
  parseProfileCompletion,
  readCaptchaToken,
} from "@/lib/auth/validation";

describe("managed-auth input validation", () => {
  it("normalizes email and handles without accepting unsafe forms", () => {
    expect(normalizeEmail("  Collector@Example.COM ")).toEqual({
      ok: true,
      value: "collector@example.com",
    });
    expect(normalizeEmail("not-an-email")).toEqual({ ok: false, code: "email_invalid" });
    expect(normalizeHandle("  Arcane_Tool-7 ")).toEqual({
      ok: true,
      value: "arcane_tool-7",
    });
    expect(normalizeHandle("../admin")).toEqual({ ok: false, code: "handle_invalid" });
  });

  it("reads the Turnstile token without treating it as identity", () => {
    const formData = new FormData();
    formData.set("cf-turnstile-response", "bounded-token");

    expect(readCaptchaToken(formData)).toBe("bounded-token");
  });

  it("normalizes either admitted login identifier without conflating their shapes", () => {
    expect(normalizeLoginIdentifier(" Collector@Example.COM ")).toEqual({
      ok: true,
      value: { kind: "email", value: "collector@example.com" },
    });
    expect(normalizeLoginIdentifier(" Arcane_User ")).toEqual({
      ok: true,
      value: { kind: "handle", value: "arcane_user" },
    });
    expect(normalizeLoginIdentifier("../admin")).toEqual({
      ok: false,
      code: "handle_invalid",
    });
  });

  it("parses credentials but never offers account creation input", () => {
    const formData = new FormData();
    formData.set("identifier", "invited@example.com");
    formData.set("password", " correct horse battery staple ");

    expect(parseCredentials(formData)).toEqual({
      ok: true,
      value: {
        identifier: { kind: "email", value: "invited@example.com" },
        password: " correct horse battery staple ",
        captchaToken: undefined,
      },
    });
  });

  it("parses a username while preserving password whitespace", () => {
    const formData = new FormData();
    formData.set("identifier", " Invited_Collector ");
    formData.set("password", " password with intentional spaces ");

    expect(parseCredentials(formData)).toEqual({
      ok: true,
      value: {
        identifier: { kind: "handle", value: "invited_collector" },
        password: " password with intentional spaces ",
        captchaToken: undefined,
      },
    });
  });

  it("preserves password whitespace during invitation completion", () => {
    const formData = new FormData();
    formData.set("displayName", "Invited Collector");
    formData.set("handle", "invited_collector");
    formData.set("password", " password with spaces ");
    formData.set("passwordConfirmation", " password with spaces ");

    expect(parseProfileCompletion(formData)).toMatchObject({
      ok: true,
      value: { password: " password with spaces " },
    });
  });

  it("requires matching managed passwords for invitation completion", () => {
    const formData = new FormData();
    formData.set("displayName", "Invited Collector");
    formData.set("handle", "invited_collector");
    formData.set("password", "long-enough-password");
    formData.set("passwordConfirmation", "different-password");

    expect(parseProfileCompletion(formData)).toEqual({
      ok: false,
      code: "password_mismatch",
    });
  });

  it("bounds invitation expiration to the operational window", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");

    expect(parseDateExpiration("2026-08-02", now)).toEqual({
      ok: true,
      value: "2026-08-02T23:59:59.999Z",
    });
    expect(parseDateExpiration("2026-07-25", now)).toEqual({
      ok: false,
      code: "expiration_invalid",
    });
    expect(parseDateExpiration("2026-09-30", now)).toEqual({
      ok: false,
      code: "expiration_invalid",
    });
  });
});
