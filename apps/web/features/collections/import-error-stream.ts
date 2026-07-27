import { serializeImportErrorReportHeader, serializeImportErrorReportRow } from "./csv";
import type { CollectionLoadResult, InventoryImportErrorReportPage } from "./types";

export type InventoryImportErrorPageLoader = (
  afterRowNumber: number,
) => Promise<CollectionLoadResult<InventoryImportErrorReportPage>>;

function validPage(page: InventoryImportErrorReportPage, expectedAfterRowNumber: number): boolean {
  return (
    page.afterRowNumber === expectedAfterRowNumber &&
    page.hasMore === (page.nextAfterRowNumber !== null) &&
    (!page.hasMore || page.rows.length > 0)
  );
}

/**
 * Streams the lightweight error-report contract without retaining rich import
 * preview candidates or the full report in application memory.
 */
export function createInventoryImportErrorStream({
  firstPage,
  loadPage,
  signal,
}: {
  firstPage: InventoryImportErrorReportPage;
  loadPage: InventoryImportErrorPageLoader;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const seenAfterRowNumbers = new Set<number>([firstPage.afterRowNumber]);
  let page = firstPage;
  let expectedAfterRowNumber = 0;
  let rowIndex = 0;
  let headerSent = false;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      if (signal?.aborted) {
        closed = true;
        controller.close();
        return;
      }
      if (!validPage(page, expectedAfterRowNumber)) {
        closed = true;
        controller.error(new Error("Invalid inventory import error page."));
        return;
      }
      if (!headerSent) {
        headerSent = true;
        controller.enqueue(encoder.encode(`${serializeImportErrorReportHeader()}\r\n`));
        return;
      }

      while (rowIndex >= page.rows.length) {
        if (!page.hasMore || page.nextAfterRowNumber === null) {
          closed = true;
          controller.close();
          return;
        }
        const nextAfterRowNumber = page.nextAfterRowNumber;
        if (seenAfterRowNumbers.has(nextAfterRowNumber)) {
          closed = true;
          controller.error(new Error("Inventory import error cursor did not advance."));
          return;
        }
        seenAfterRowNumbers.add(nextAfterRowNumber);
        const next = await loadPage(nextAfterRowNumber);
        if (!next.ok || !validPage(next.data, nextAfterRowNumber)) {
          closed = true;
          controller.error(new Error("Inventory import error page unavailable."));
          return;
        }
        page = next.data;
        expectedAfterRowNumber = nextAfterRowNumber;
        rowIndex = 0;
        if (signal?.aborted) {
          closed = true;
          controller.close();
          return;
        }
      }

      const row = page.rows[rowIndex]!;
      rowIndex += 1;
      controller.enqueue(encoder.encode(`${serializeImportErrorReportRow(row)}\r\n`));
    },
    cancel() {
      closed = true;
    },
  });
}
