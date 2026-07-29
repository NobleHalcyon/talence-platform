import "server-only";

import { getPublicSupabaseConfig, type PublicSupabaseConfig } from "./config";

export interface TrustedSupabaseConfig extends PublicSupabaseConfig {
  secretKey: string;
}

export function getTrustedSupabaseConfig(): TrustedSupabaseConfig | null {
  const publicConfig = getPublicSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!publicConfig || !secretKey) {
    return null;
  }

  return { ...publicConfig, secretKey };
}
