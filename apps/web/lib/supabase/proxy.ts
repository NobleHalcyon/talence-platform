import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  try {
    // getClaims verifies the JWT and refreshes it when needed. Never trust
    // getSession() as the server-side protection boundary.
    await supabase.auth.getClaims();
  } catch {
    // Fail closed in protected layouts. The Proxy still returns a clean
    // response so anonymous/static surfaces remain available.
  }

  return response;
}
