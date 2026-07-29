import { describe, expect, it } from "vitest";

import { parseCallbackIntent } from "@/lib/auth/callback";

describe("auth callback intent", () => {
  it("accepts the server-readable invite token hash flow", () => {
    const tokenHash = "a".repeat(56);
    const intent = parseCallbackIntent(
      new URLSearchParams({
        token_hash: tokenHash,
        type: "invite",
      }),
    );

    expect(intent).toEqual({
      code: null,
      destination: "/invite/complete",
      tokenHash,
      type: "invite",
    });
  });

  it("routes recovery tokens only to the managed password reset page", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        next: "/app",
        token_hash: "b".repeat(56),
        type: "recovery",
      }),
    );

    expect(intent.destination).toBe("/reset-password");
  });

  it("rejects open redirects and unapproved email action types", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        next: "https://attacker.example",
        token_hash: "c".repeat(56),
        type: "signup",
      }),
    );

    expect(intent.destination).toBe("/invite/complete");
    expect(intent.type).toBeNull();
  });

  it("rejects malformed, oversized, and ambiguous callback credentials", () => {
    expect(
      parseCallbackIntent(
        new URLSearchParams({
          token_hash: "contains whitespace",
          type: "invite",
        }),
      ).tokenHash,
    ).toBeNull();
    expect(
      parseCallbackIntent(
        new URLSearchParams({
          token_hash: "a".repeat(513),
          type: "recovery",
        }),
      ).tokenHash,
    ).toBeNull();

    const ambiguous = parseCallbackIntent(
      new URLSearchParams({
        code: "authorization-code-value",
        token_hash: "d".repeat(56),
        type: "invite",
      }),
    );
    expect(ambiguous.code).toBeNull();
    expect(ambiguous.tokenHash).toBeNull();
  });

  it("does not let an invite callback navigate to the recovery form", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        next: "/reset-password",
        token_hash: "e".repeat(56),
        type: "invite",
      }),
    );

    expect(intent.destination).toBe("/invite/complete");
  });
});
