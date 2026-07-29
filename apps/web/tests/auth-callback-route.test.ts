import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/auth/callback/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

function callbackClient() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getClaims: vi.fn(),
      signOut: vi.fn(),
      verifyOtp: vi.fn(),
    },
    rpc: vi.fn(),
  };
}

function redirectLocation(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  return new URL(location!);
}

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizes a verified invite callback independently of its allowlisted next value", async () => {
    const client = callbackClient();
    const tokenHash = "a".repeat(56);
    client.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    client.rpc.mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const response = await GET(
      new NextRequest(
        `https://talence.example/auth/callback?token_hash=${tokenHash}&type=invite&next=/app`,
      ),
    );

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: "invite",
    });
    expect(client.rpc).toHaveBeenCalledWith("finalize_admitted_user");
    expect(redirectLocation(response).pathname).toBe("/app");
  });

  it("normalizes a thrown verification failure instead of returning a route error", async () => {
    const client = callbackClient();
    const tokenHash = "b".repeat(56);
    client.auth.verifyOtp.mockRejectedValue(new Error("raw provider failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const response = await GET(
      new NextRequest(`https://talence.example/auth/callback?token_hash=${tokenHash}&type=invite`),
    );
    const location = redirectLocation(response);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("status")).toBe("callback_failed");
    expect(client.auth.getClaims).not.toHaveBeenCalled();
  });

  it("fails closed and attempts local cleanup when admission finalization throws", async () => {
    const client = callbackClient();
    const tokenHash = "c".repeat(56);
    client.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    client.rpc.mockRejectedValue(new Error("raw database failure"));
    client.auth.signOut.mockRejectedValue(new Error("raw cleanup failure"));
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const response = await GET(
      new NextRequest(`https://talence.example/auth/callback?token_hash=${tokenHash}&type=invite`),
    );
    const location = redirectLocation(response);

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("status")).toBe("invitation_failed");
  });

  it("maps invalid, expired, and reused provider tokens to the same bounded response", async () => {
    for (const providerError of ["invalid", "expired", "reused"]) {
      const client = callbackClient();
      client.auth.verifyOtp.mockResolvedValue({
        data: {},
        error: { message: `raw ${providerError} token detail` },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

      const response = await GET(
        new NextRequest(
          `https://talence.example/auth/callback?token_hash=${providerError.repeat(16)}&type=recovery`,
        ),
      );
      const location = redirectLocation(response);

      expect(location.pathname).toBe("/login");
      expect(location.searchParams.toString()).toBe("status=callback_failed");
      expect(client.auth.getClaims).not.toHaveBeenCalled();
    }
  });

  it("rejects missing and malformed credentials before contacting managed Auth", async () => {
    const client = callbackClient();
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    for (const query of ["type=invite", "token_hash=short&type=invite"]) {
      const response = await GET(new NextRequest(`https://talence.example/auth/callback?${query}`));
      const location = redirectLocation(response);

      expect(location.pathname).toBe("/login");
      expect(location.searchParams.toString()).toBe("status=callback_code_missing");
    }
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
