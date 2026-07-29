import { describe, expect, it, vi } from "vitest";

import { serverAuthCookieOptions } from "@/lib/supabase/cookie-options";

describe("server Auth cookie options", () => {
  it("keeps managed session credentials unavailable to application JavaScript", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(serverAuthCookieOptions()).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    vi.unstubAllEnvs();
  });

  it("requires secure transport in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(serverAuthCookieOptions().secure).toBe(true);
    vi.unstubAllEnvs();
  });
});
