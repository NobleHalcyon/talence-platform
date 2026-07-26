import type { JwtPayload } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "./server";

export type VerifiedAuthState =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; claims: JwtPayload };

export async function getVerifiedAuthState(): Promise<VerifiedAuthState> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { status: "unconfigured" };
  }

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error || !claims?.sub) {
      return { status: "unauthenticated" };
    }

    return { status: "authenticated", claims };
  } catch {
    return { status: "unauthenticated" };
  }
}
