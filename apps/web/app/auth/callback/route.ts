import { NextResponse, type NextRequest } from "next/server";

import { parseCallbackIntent } from "@/lib/auth/callback";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CallbackSupabaseClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

function redirectWithStatus(request: NextRequest, pathname: string, status: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("status", status);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

async function signOutLocally(client: CallbackSupabaseClient): Promise<void> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Admission remains database-authoritative. A cleanup failure must not
    // replace the bounded callback response with an unhandled provider error.
  }
}

export async function GET(request: NextRequest) {
  const intent = parseCallbackIntent(request.nextUrl.searchParams);
  let supabase: CallbackSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return redirectWithStatus(request, "/login", "callback_failed");
  }

  if (!supabase) {
    return redirectWithStatus(request, intent.destination, "configuration_required");
  }

  if (!intent.code && !(intent.tokenHash && intent.type)) {
    return redirectWithStatus(request, "/login", "callback_code_missing");
  }

  let verification;
  try {
    verification = intent.code
      ? await supabase.auth.exchangeCodeForSession(intent.code)
      : await supabase.auth.verifyOtp({
          token_hash: intent.tokenHash!,
          type: intent.type!,
        });
  } catch {
    return redirectWithStatus(request, "/login", "callback_failed");
  }

  if (verification.error) {
    return redirectWithStatus(request, "/login", "callback_failed");
  }

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    return redirectWithStatus(request, "/login", "session_unverified");
  }
  const { data, error: claimsError } = claimsResult;
  if (claimsError || !data?.claims?.sub) {
    return redirectWithStatus(request, "/login", "session_unverified");
  }

  // `next` controls only an allowlisted navigation destination. Admission is
  // tied to the callback flow that Supabase successfully verified.
  if (intent.type === "invite") {
    let finalizationError: unknown;
    try {
      const result = await supabase.rpc(DATABASE_FUNCTIONS.finalizeAdmittedUser);
      finalizationError = result.error;
    } catch {
      finalizationError = true;
    }
    if (finalizationError) {
      await signOutLocally(supabase);
      return redirectWithStatus(request, "/login", "invitation_failed");
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = intent.destination;
  url.search = "";
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
