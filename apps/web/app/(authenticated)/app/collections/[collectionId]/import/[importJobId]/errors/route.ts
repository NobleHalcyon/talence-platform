import {
  loadInventoryImportPreview,
  openInventoryImportErrorReportPageReader,
} from "@/features/collections/data";
import { createInventoryImportErrorStream } from "@/features/collections/import-error-stream";
import { validateUuid } from "@/lib/auth/validation";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ collectionId: string; importJobId: string }>;
  },
) {
  const { collectionId, importJobId } = await params;
  const validatedCollection = validateUuid(collectionId);
  const validatedJob = validateUuid(importJobId);
  if (!validatedCollection.ok || !validatedJob.ok) {
    return new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });
  }

  const preview = await loadInventoryImportPreview(validatedJob.value, 0, 1);
  if (!preview.ok || preview.data.collectionId !== validatedCollection.value) {
    return new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });
  }

  const report = await openInventoryImportErrorReportPageReader(validatedJob.value);
  if (!report.ok) {
    return new Response(
      `The error report is temporarily unavailable. Request ID: ${report.requestId}`,
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  const stream = createInventoryImportErrorStream({
    firstPage: report.data.firstPage,
    loadPage: report.data.loadPage,
    signal: request.signal,
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="talence-import-${validatedJob.value}-errors.csv"`,
    },
  });
}
