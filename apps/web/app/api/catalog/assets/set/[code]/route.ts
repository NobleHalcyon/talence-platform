import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_SVG_BYTES = 128 * 1024;

function safeScryfallSetUri(value: string | null): URL | null {
  if (!value) return null;
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" &&
      uri.hostname === "svgs.scryfall.io" &&
      uri.pathname.startsWith("/sets/") &&
      uri.pathname.endsWith(".svg")
      ? uri
      : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const code = (await context.params).code.toLowerCase();
  if (!CODE_PATTERN.test(code)) return new NextResponse(null, { status: 404 });
  const client = await createServerSupabaseClient();
  if (!client) return new NextResponse(null, { status: 503 });
  const result = await client
    .from("catalog_sets")
    .select("icon_svg_uri")
    .ilike("code", code)
    .maybeSingle();
  const source = result.error ? null : safeScryfallSetUri(result.data?.icon_svg_uri ?? null);
  if (!source)
    return NextResponse.redirect(new URL("/brand/talence-emblem-gold.svg", _request.url));
  const upstream = await fetch(source, { next: { revalidate: 2_592_000 } });
  if (!upstream.ok) return new NextResponse(null, { status: 502 });
  const body = await upstream.arrayBuffer();
  const text = new TextDecoder().decode(body);
  if (body.byteLength > MAX_SVG_BYTES || !/^\s*<svg[\s>]/i.test(text)) {
    return new NextResponse(null, { status: 502 });
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
