import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import {
  applySecurityHeaders,
  contentSecurityPolicy,
  requestCorrelationId,
} from "@/lib/security/headers";
import { writeSecurityLog } from "@/lib/observability/security-log";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const startedAt = performance.now();
  const requestId = requestCorrelationId(request.headers.get("x-request-id"), randomUUID);
  const nonce = randomUUID().replaceAll("-", "");
  const policy = contentSecurityPolicy({
    nonce,
    production: process.env.NODE_ENV === "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("X-Nonce", nonce);
  requestHeaders.set("X-Request-Id", requestId);

  try {
    const response = await refreshSupabaseSession(request, requestHeaders);
    applySecurityHeaders(response.headers, {
      contentSecurityPolicy: policy,
      production: process.env.NODE_ENV === "production",
      requestId,
    });
    writeSecurityLog("info", "http.request.completed", {
      duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      request_id: requestId,
      result_code: "response",
      route: request.nextUrl.pathname,
      status: response.status,
    });
    return response;
  } catch (error) {
    writeSecurityLog("error", "http.request.failed", {
      code: error instanceof Error ? "request_pipeline_failed" : "unknown_failure",
      duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      request_id: requestId,
      route: request.nextUrl.pathname,
      status: 500,
    });
    throw error;
  }
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:avif|css|gif|ico|jpg|jpeg|js|png|svg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
