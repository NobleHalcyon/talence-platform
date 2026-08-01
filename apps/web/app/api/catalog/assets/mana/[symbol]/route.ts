import { NextResponse } from "next/server";

const SYMBOLS = new Set(["W", "U", "B", "R", "G", "C"]);
const MAX_SVG_BYTES = 128 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const symbol = (await context.params).symbol.toUpperCase();
  if (!SYMBOLS.has(symbol)) return new NextResponse(null, { status: 404 });
  const source = new URL(`https://svgs.scryfall.io/card-symbols/${symbol}.svg`);
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
