import { openCollectionExportPageReader } from "@/features/collections/data";
import { createInventoryExportStream } from "@/features/collections/export-stream";
import { validateUuid } from "@/lib/auth/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const validated = validateUuid(collectionId);
  if (!validated.ok) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const result = await openCollectionExportPageReader(validated.value);
  if (!result.ok) {
    const status =
      result.reason === "permission_denied" ? 403 : result.reason === "not_found" ? 404 : 503;
    return Response.json(
      { error: "collection_export_unavailable", request_id: result.requestId },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const stream = createInventoryExportStream({
    collectionId: validated.value,
    firstPage: result.data.firstPage,
    loadPage: result.data.loadPage,
    signal: request.signal,
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="talence-collection-${validated.value}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
