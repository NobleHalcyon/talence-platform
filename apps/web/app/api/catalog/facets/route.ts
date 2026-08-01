import { NextResponse } from "next/server";

import { FACET_FIELDS, parseFacetPage } from "@/features/filters/facets";
import type { FilterField } from "@/features/filters/model";
import { DATABASE_FUNCTIONS } from "@/lib/database/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CatalogRpcClient } from "@/features/catalog/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const field = url.searchParams.get("field") as FilterField | "format" | null;
  const facet = field === "format" ? "format" : field ? FACET_FIELDS[field] : null;
  const query = url.searchParams.get("q")?.trim().slice(0, 100) || null;
  const after = url.searchParams.get("after")?.trim().slice(0, 200) || null;
  const requestedLimit = Number(url.searchParams.get("limit") ?? 40);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 40;
  if (!facet) return NextResponse.json({ error: "unsupported_facet" }, { status: 400 });

  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "configuration_required" }, { status: 503 });
  const result = await (client as unknown as CatalogRpcClient).rpc(
    DATABASE_FUNCTIONS.catalogFilterFacets,
    {
      p_field: facet,
      p_query: query,
      p_limit: limit,
      p_after: after,
    },
  );
  const page = result.error ? null : parseFacetPage(result.data);
  return page
    ? NextResponse.json(page, { headers: { "Cache-Control": "private, max-age=30" } })
    : NextResponse.json({ error: "facet_unavailable" }, { status: 502 });
}
