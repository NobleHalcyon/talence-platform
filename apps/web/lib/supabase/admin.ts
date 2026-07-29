import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getTrustedSupabaseConfig } from "./trusted-config";

export function createAdminSupabaseClient(): SupabaseClient<Database> | null {
  const config = getTrustedSupabaseConfig();
  if (!config) {
    return null;
  }

  return createClient<Database>(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
