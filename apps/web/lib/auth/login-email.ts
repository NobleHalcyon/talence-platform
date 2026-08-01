import "server-only";

import type { LoginIdentifier } from "@/lib/auth/validation";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const UNKNOWN_LOGIN_EMAIL = "unknown-login@invalid.example";

export type LoginEmailResolution =
  | {
      status: "resolved";
      email: string;
    }
  | {
      status: "unconfigured";
    }
  | {
      status: "unavailable";
    };

/**
 * Translates a normalized login handle to the managed Supabase Auth email.
 *
 * The mapping is deliberately server-only and available in the database only
 * to service_role. A missing handle still yields a syntactically valid,
 * non-routable email so the provider owns the final generic credential failure.
 */
export async function resolveLoginEmail(
  identifier: LoginIdentifier,
): Promise<LoginEmailResolution> {
  if (identifier.kind === "email") {
    return { status: "resolved", email: identifier.value };
  }

  let admin;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { status: "unavailable" };
  }

  if (!admin) {
    return { status: "unconfigured" };
  }

  try {
    const result = await admin.rpc(DATABASE_FUNCTIONS.serverResolveLoginEmail, {
      p_handle: identifier.value,
    });

    if (result.error) {
      return { status: "unavailable" };
    }

    return {
      status: "resolved",
      email: typeof result.data === "string" && result.data ? result.data : UNKNOWN_LOGIN_EMAIL,
    };
  } catch {
    return { status: "unavailable" };
  }
}
