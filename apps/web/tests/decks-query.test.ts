import { describe, expect, it } from "vitest";

import {
  deckEditorHref,
  parseDeckCursor,
  parseDeckEditorSurface,
  parseDeckPrintingCursor,
  parseDeckPrintingEntryId,
  parseDeckSearchCursor,
  parseDeckSearchQuery,
  parseDeckStatusFilter,
  safeDeckReturnPath,
} from "@/features/decks/query";

const DECK_ID = "00000000-0000-4000-8000-000000007001";
const ENTRY_ID = "00000000-0000-4000-8000-000000007101";

describe("deck URL contracts", () => {
  it("normalizes status and compact editor surfaces", () => {
    expect(parseDeckStatusFilter({})).toBe("active");
    expect(parseDeckStatusFilter({ status_filter: "archived" })).toBe("archived");
    expect(parseDeckStatusFilter({ status_filter: "all" })).toBe("all");
    expect(parseDeckStatusFilter({ status_filter: "deleted" })).toBe("active");
    expect(parseDeckEditorSurface({ surface: "analysis" })).toBe("analysis");
    expect(parseDeckEditorSurface({ surface: "settings" })).toBe("deck");
  });

  it("drops one-character or overlong catalog searches before the RPC", () => {
    expect(parseDeckSearchQuery({ q: " x " })).toBe("");
    expect(parseDeckSearchQuery({ q: " lightning   bolt " })).toBe("lightning bolt");
    expect(parseDeckSearchQuery({ q: "x".repeat(500) })).toHaveLength(120);
  });

  it("accepts only database-compatible base64url cursors", () => {
    expect(parseDeckCursor({ cursor: "abcdEF12_-" })).toBe("abcdEF12_-");
    expect(parseDeckSearchCursor({ catalog_cursor: "abcdEF12_-" })).toBe("abcdEF12_-");
    expect(parseDeckPrintingCursor({ printing_cursor: "abcdEF12_-" })).toBe("abcdEF12_-");
    expect(parseDeckCursor({ cursor: "short" })).toBeNull();
    expect(parseDeckCursor({ cursor: "abcd EF12" })).toBeNull();
    expect(parseDeckCursor({ cursor: "a".repeat(2049) })).toBeNull();
  });

  it("validates picker entry IDs and serializes shareable editor state", () => {
    expect(parseDeckPrintingEntryId({ printing_for: ENTRY_ID })).toBe(ENTRY_ID);
    expect(parseDeckPrintingEntryId({ printing_for: "entry" })).toBeNull();
    expect(
      deckEditorHref(DECK_ID, {
        surface: "catalog",
        query: "black lotus",
        catalogCursor: "abcdEF12_-",
        printingFor: ENTRY_ID,
      }),
    ).toBe(
      `/app/decks/${DECK_ID}?surface=catalog&q=black+lotus&catalog_cursor=abcdEF12_-&printing_for=${ENTRY_ID}`,
    );
  });

  it("keeps mutation return paths local to the private deck surface", () => {
    expect(
      safeDeckReturnPath(`/app/decks/${DECK_ID}/import?status=review`, `/app/decks/${DECK_ID}`),
    ).toBe(`/app/decks/${DECK_ID}/import?status=review`);
    expect(safeDeckReturnPath("//evil.example/app/decks", `/app/decks/${DECK_ID}`)).toBe(
      `/app/decks/${DECK_ID}`,
    );
    expect(safeDeckReturnPath("https://evil.example/app/decks", `/app/decks/${DECK_ID}`)).toBe(
      `/app/decks/${DECK_ID}`,
    );
  });
});
