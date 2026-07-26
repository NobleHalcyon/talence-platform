import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedDestinations = new Set(["/invite/complete", "/reset-password", "/app"]);

function destinationFrom(request: NextRequest): string {
  const requested = request.nextUrl.searchParams.get("next");
  return requested && allowedDestinations.has(requested) ? requested : "/invite/complete";
}

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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = destinationFrom(request);
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return redirectWithStatus(request, destination, "configuration_required");
  }

  if (!code) {
    return redirectWithStatus(request, "/login", "callback_code_missing");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectWithStatus(request, "/login", "callback_failed");
  }

  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data?.claims?.sub) {
    return redirectWithStatus(request, "/login", "session_unverified");
  }

  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
