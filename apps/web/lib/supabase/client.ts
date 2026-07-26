"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "./config";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null | undefined;

export function getBrowserSupabaseClient(): SupabaseClient<Database> | null {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const config = getPublicSupabaseConfig();
  browserClient = config ? createBrowserClient<Database>(config.url, config.publishableKey) : null;

  return browserClient;
}
