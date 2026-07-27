import { serializeInventoryExportHeader, serializeInventoryExportRow } from "./csv";
import type { InventoryExportPage } from "./parse";
import type { CollectionLoadResult } from "./types";

export type InventoryExportPageLoader = (
  cursor: string,
) => Promise<CollectionLoadResult<InventoryExportPage>>;

function validPage(page: InventoryExportPage, collectionId: string): boolean {
  return (
    page.collectionId === collectionId &&
    page.hasMore === Boolean(page.nextCursor) &&
    (!page.hasMore || page.items.length > 0)
  );
}

/**
 * Streams one encoded CSV record at a time while retaining at most one
 * database page in memory. Later page failures terminate the private response
 * instead of returning a silently truncated export.
 */
export function createInventoryExportStream({
  collectionId,
  firstPage,
  loadPage,
  signal,
}: {
  collectionId: string;
  firstPage: InventoryExportPage;
  loadPage: InventoryExportPageLoader;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const seenCursors = new Set<string>();
  let page = firstPage;
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
      if (!validPage(page, collectionId)) {
        closed = true;
        controller.error(new Error("Invalid collection export page."));
        return;
      }
      if (!headerSent) {
        headerSent = true;
        controller.enqueue(encoder.encode(`${serializeInventoryExportHeader()}\r\n`));
        return;
      }

      while (rowIndex >= page.items.length) {
        if (!page.hasMore || !page.nextCursor) {
          closed = true;
          controller.close();
          return;
        }
        if (seenCursors.has(page.nextCursor)) {
          closed = true;
          controller.error(new Error("Collection export cursor did not advance."));
          return;
        }
        seenCursors.add(page.nextCursor);
        const next = await loadPage(page.nextCursor);
        if (!next.ok || !validPage(next.data, collectionId)) {
          closed = true;
          controller.error(new Error("Collection export page unavailable."));
          return;
        }
        page = next.data;
        rowIndex = 0;
        if (signal?.aborted) {
          closed = true;
          controller.close();
          return;
        }
      }

      const row = page.items[rowIndex]!;
      rowIndex += 1;
      controller.enqueue(encoder.encode(`${serializeInventoryExportRow(row)}\r\n`));
    },
    cancel() {
      closed = true;
    },
  });
}
