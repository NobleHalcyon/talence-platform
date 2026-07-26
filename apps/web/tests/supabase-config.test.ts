import { afterEach, describe, expect, it } from "vitest";

import { getApplicationOrigin, getPublicSupabaseConfig } from "@/lib/supabase/config";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalAppOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }

  if (originalPublishableKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
  }

  if (originalAnonKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  }

  if (originalAppOrigin === undefined) {
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_APP_ORIGIN = originalAppOrigin;
  }

  if (originalVercelUrl === undefined) {
    delete process.env.VERCEL_URL;
  } else {
    process.env.VERCEL_URL = originalVercelUrl;
  }
});

describe("Supabase public configuration", () => {
  it("degrades safely when environment variables are absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(getPublicSupabaseConfig()).toBeNull();
  });

  it("accepts a browser-safe publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    expect(getPublicSupabaseConfig()).toEqual({
      url: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("rejects insecure non-local origins", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";

    expect(getPublicSupabaseConfig()).toBeNull();
  });

  it("permits the local Supabase CLI loopback origin", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-public-key";

    expect(getPublicSupabaseConfig()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "local-public-key",
    });
  });

  it("normalizes host-only and qualified Vercel application origins", () => {
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    process.env.VERCEL_URL = "preview.example.vercel.app";
    expect(getApplicationOrigin()).toBe("https://preview.example.vercel.app");

    process.env.VERCEL_URL = "https://preview.example.vercel.app";
    expect(getApplicationOrigin()).toBe("https://preview.example.vercel.app");
  });
});
