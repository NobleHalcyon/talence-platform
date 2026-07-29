import { describe, expect, it, vi } from "vitest";

import { previewCollectionList } from "@/features/collections/preview";
import type { CollectionListPage } from "@/features/collections/types";
import {
  DECK_SOURCE_COLLECTION_CAP,
  DECK_SOURCE_COLLECTION_PAGE_SIZE,
  loadDeckSourceCollectionsWithLoader,
} from "@/features/decks/data";

const previewPage = previewCollectionList(false);
const template = previewPage.items[0]!;

function collection(index: number) {
  return {
    ...template,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Collection ${String(index).padStart(4, "0")}`,
    slug: `collection-${index}`,
    isDefault: false,
  };
}

function page(start: number, count: number, nextCursor: string | null): CollectionListPage {
  return {
    workspaceId: previewPage.workspaceId,
    permissions: previewPage.permissions,
    items: Array.from({ length: count }, (_, index) => collection(start + index)),
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

describe("complete deck source collection loading", () => {
  it("drains every bounded page before presenting source choices", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        preview: false,
        data: page(1, 100, "page_cursor_0002"),
      })
      .mockResolvedValueOnce({
        ok: true,
        preview: false,
        data: page(101, 37, null),
      });

    await expect(loadDeckSourceCollectionsWithLoader(loader, true)).resolves.toMatchObject({
      ok: true,
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({ name: "Collection 0001" }),
          expect.objectContaining({ name: "Collection 0137" }),
        ]),
        hasMore: false,
        nextCursor: null,
      },
    });
    expect(loader).toHaveBeenNthCalledWith(1, true, null, null, DECK_SOURCE_COLLECTION_PAGE_SIZE);
    expect(loader).toHaveBeenNthCalledWith(
      2,
      true,
      "page_cursor_0002",
      null,
      DECK_SOURCE_COLLECTION_PAGE_SIZE,
    );
  });

  it("fails closed when the workspace exceeds the safe source universe cap", async () => {
    let pageIndex = 0;
    const loader = vi.fn().mockImplementation(async () => {
      const current = pageIndex;
      pageIndex += 1;
      return {
        ok: true as const,
        preview: false,
        data: page(
          current * DECK_SOURCE_COLLECTION_PAGE_SIZE + 1,
          DECK_SOURCE_COLLECTION_PAGE_SIZE,
          `overflow_cursor_${current + 1}`,
        ),
      };
    });

    await expect(loadDeckSourceCollectionsWithLoader(loader, false)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_response",
      requestId: expect.any(String),
    });
    expect(loader).toHaveBeenCalledTimes(
      DECK_SOURCE_COLLECTION_CAP / DECK_SOURCE_COLLECTION_PAGE_SIZE,
    );
  });

  it("rejects repeated rows or cursors instead of returning an incomplete selector", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        preview: false,
        data: page(1, 2, "repeated_cursor"),
      })
      .mockResolvedValueOnce({
        ok: true,
        preview: false,
        data: page(2, 2, "repeated_cursor"),
      });

    await expect(loadDeckSourceCollectionsWithLoader(loader, true)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
  });
});
