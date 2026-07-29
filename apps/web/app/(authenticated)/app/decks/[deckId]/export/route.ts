import { NextResponse } from "next/server";

import { loadDeckExport } from "@/features/decks/data";
import { validateUuid } from "@/lib/auth/validation";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, context: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await context.params;
  const validated = validateUuid(deckId);
  if (!validated.ok) {
    return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS });
  }
  const result = await loadDeckExport(validated.value);
  if (!result.ok) {
    const status =
      result.reason === "not_found" ? 404 : result.reason === "permission_denied" ? 403 : 503;
    return new NextResponse(status === 403 ? "Permission denied" : "Not found", {
      status,
      headers: PRIVATE_HEADERS,
    });
  }
  const json = new URL(request.url).searchParams.get("format") === "json";
  const body = json
    ? `${JSON.stringify(result.data.stableJson, null, 2)}\n`
    : result.data.plainText;
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="talence-deck-${validated.value}.${json ? "json" : "txt"}"`,
    },
  });
}
