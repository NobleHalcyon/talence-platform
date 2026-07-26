import { describe, expect, it } from "vitest";

import { parseCallbackIntent } from "@/lib/auth/callback";

describe("auth callback intent", () => {
  it("accepts the server-readable invite token hash flow", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        token_hash: "hashed-token",
        type: "invite",
      }),
    );

    expect(intent).toEqual({
      code: null,
      destination: "/invite/complete",
      tokenHash: "hashed-token",
      type: "invite",
    });
  });

  it("routes recovery tokens only to the managed password reset page", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        token_hash: "hashed-token",
        type: "recovery",
      }),
    );

    expect(intent.destination).toBe("/reset-password");
  });

  it("rejects open redirects and unapproved email action types", () => {
    const intent = parseCallbackIntent(
      new URLSearchParams({
        next: "https://attacker.example",
        token_hash: "hashed-token",
        type: "signup",
      }),
    );

    expect(intent.destination).toBe("/invite/complete");
    expect(intent.type).toBeNull();
  });
});
