import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getPublicSupabaseConfig } from "./config";
import { serverAuthCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";

export async function createServerSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: serverAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        void headers;
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies. The Proxy refreshes
          // sessions before rendering; mutations and Route Handlers can write.
        }
      },
    },
  });
}
