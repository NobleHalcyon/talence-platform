import { describe, expect, it, vi } from "vitest";

import {
  addDeckEntryWithClient,
  createDeckWithClient,
  duplicateDeckWithClient,
  lifecycleDeckWithClient,
  removeDeckEntryWithClient,
  replaceDeckEntriesWithClient,
  replaceDeckSourcesWithClient,
  resolveDeckImportWithClient,
  updateDeckEntryWithClient,
  updateDeckWithClient,
} from "@/features/decks/actions";
import { loadDeckListWithClient, searchDeckCatalogWithClient } from "@/features/decks/data";
import type { DeckRpcClient } from "@/features/decks/types";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000003001";
const DECK_ID = "00000000-0000-4000-8000-000000007001";
const ENTRY_ID = "00000000-0000-4000-8000-000000007101";
const CARD_ID = "00000000-0000-4000-8000-000000000003";
const COLLECTION_ID = "00000000-0000-4000-8000-000000004001";
const FORMAT_VERSION_ID = "00000000-0000-4000-8000-000000007007";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PRINTING_ID = "00000000-0000-4000-8000-000000000103";
const CATALOG_VERSION = "mtg-20260726T120000Z";

function client(rpc = vi.fn()): DeckRpcClient {
  return { rpc };
}

function mutationEnvelope(revision: number) {
  return {
    deck: {
      deck_id: DECK_ID,
      workspace_id: WORKSPACE_ID,
      game_id: GAME_ID,
      name: "Contract deck",
      slug: "contract-deck",
      description: null,
      notes: null,
      tags: [],
      format_code: "commander",
      format_version_id: FORMAT_VERSION_ID,
      rules_version: 3,
      rules_version_key: "commander-2026-07-26.3",
      cover_printing_id: null,
      status: "active",
      current_revision: revision,
      created_at: "2026-07-26T12:00:00Z",
      updated_at: "2026-07-26T13:00:00Z",
      archived_at: null,
      deleted_at: null,
    },
    revision: {
      revision_id: "00000000-0000-4000-8000-000000007900",
      revision,
      content_hash: "a".repeat(64),
      rules_version_id: FORMAT_VERSION_ID,
      catalog_version: CATALOG_VERSION,
    },
  };
}

describe("deck RPC contracts", () => {
  it.each([
    ["active", false, "active"],
    ["archived", true, "archived"],
    ["all", true, null],
  ] as const)(
    "binds the %s list tab into pagination scope",
    async (filter, includeArchived, status) => {
      const rpc = vi.fn().mockResolvedValue({
        data: {
          workspace_id: WORKSPACE_ID,
          permissions: { can_create: true },
          items: [],
          next_cursor: null,
          has_more: false,
        },
        error: null,
      });

      await expect(
        loadDeckListWithClient(client(rpc), WORKSPACE_ID, filter, "abcdEF12_-"),
      ).resolves.toMatchObject({ ok: true, data: { items: [], hasMore: false } });
      expect(rpc).toHaveBeenCalledWith("deck_list", {
        p_workspace_id: WORKSPACE_ID,
        p_include_archived: includeArchived,
        p_status: status,
        p_after: "abcdEF12_-",
        p_limit: 40,
      });
    },
  );

  it("uses the bounded empty catalog query as an initial browse request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deck_id: DECK_ID,
        query: "",
        format_version_id: FORMAT_VERSION_ID,
        revision: 7,
        items: [],
        catalog_version: "mtg-20260726T120000Z",
        next_cursor: null,
        has_more: false,
      },
      error: null,
    });

    await expect(
      searchDeckCatalogWithClient(
        client(rpc),
        DECK_ID,
        "commander",
        FORMAT_VERSION_ID,
        7,
        CATALOG_VERSION,
        "USD",
        "",
        null,
      ),
    ).resolves.toMatchObject({ ok: true, data: { query: "", items: [] } });
    expect(rpc).toHaveBeenCalledWith("deck_catalog_search", {
      p_deck_id: DECK_ID,
      p_query: null,
      p_after: null,
      p_limit: 30,
    });
  });

  it("rejects catalog results evaluated against a different deck revision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deck_id: DECK_ID,
        query: "bolt",
        format_version_id: FORMAT_VERSION_ID,
        revision: 8,
        items: [],
        catalog_version: "mtg-20260726T120000Z",
        next_cursor: null,
        has_more: false,
      },
      error: null,
    });

    await expect(
      searchDeckCatalogWithClient(
        client(rpc),
        DECK_ID,
        "commander",
        FORMAT_VERSION_ID,
        7,
        CATALOG_VERSION,
        "USD",
        "bolt",
        null,
      ),
    ).resolves.toMatchObject({ ok: false, reason: "invalid_response" });
  });

  it("sends revision, zone, finish, and notes through one entry mutation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...mutationEnvelope(8),
        entry: {
          entry_id: ENTRY_ID,
          deck_id: DECK_ID,
          card_id: CARD_ID,
          zone: "sideboard",
          quantity: 2,
          preferred_printing_id: PRINTING_ID,
          preferred_finish: "foil",
          sort_order: 10,
          notes: "Exact preference",
          created_at: "2026-07-26T12:00:00Z",
          updated_at: "2026-07-26T13:00:00Z",
        },
      },
      error: null,
    });

    await expect(
      addDeckEntryWithClient(client(rpc), {
        deckId: DECK_ID,
        cardId: CARD_ID,
        zone: "sideboard",
        quantity: 2,
        expectedRevision: 7,
        preferredPrintingId: PRINTING_ID,
        preferredFinish: "foil",
        notes: "Exact preference",
      }),
    ).resolves.toEqual({ ok: true, data: { entryId: ENTRY_ID } });
    expect(rpc).toHaveBeenCalledWith("deck_entry_add", {
      p_deck_id: DECK_ID,
      p_card_id: CARD_ID,
      p_zone: "sideboard",
      p_quantity: 2,
      p_expected_revision: 7,
      p_preferred_printing_id: PRINTING_ID,
      p_preferred_finish: "foil",
      p_notes: "Exact preference",
    });
  });

  it("replaces collection sources and reviewed entries with explicit optimistic revisions", async () => {
    const sourceRpc = vi.fn().mockResolvedValue({
      data: {
        ...mutationEnvelope(9),
        collection_ids: [COLLECTION_ID],
      },
      error: null,
    });
    await expect(
      replaceDeckSourcesWithClient(client(sourceRpc), DECK_ID, [COLLECTION_ID], 8),
    ).resolves.toEqual({ ok: true, data: { deckId: DECK_ID } });
    expect(sourceRpc).toHaveBeenCalledWith("deck_sources_replace", {
      p_deck_id: DECK_ID,
      p_collection_ids: [COLLECTION_ID],
      p_expected_revision: 8,
    });

    const entryRpc = vi.fn().mockResolvedValue({
      data: {
        ...mutationEnvelope(10),
        entry_count: 1,
      },
      error: null,
    });
    await expect(
      replaceDeckEntriesWithClient(
        client(entryRpc),
        DECK_ID,
        [
          {
            cardId: CARD_ID,
            zone: "mainboard",
            quantity: 4,
            preferredPrintingId: null,
            preferredFinish: null,
            notes: null,
          },
        ],
        9,
      ),
    ).resolves.toEqual({ ok: true, data: { deckId: DECK_ID } });
    expect(entryRpc).toHaveBeenCalledWith("deck_entries_replace", {
      p_deck_id: DECK_ID,
      p_entries: [
        {
          card_id: CARD_ID,
          zone: "mainboard",
          quantity: 4,
          preferred_printing_id: null,
          preferred_finish: null,
          notes: null,
        },
      ],
      p_expected_revision: 9,
    });
  });

  it("fails mutations closed on empty or mismatched response envelopes", async () => {
    await expect(
      replaceDeckSourcesWithClient(
        client(vi.fn().mockResolvedValue({ data: {}, error: null })),
        DECK_ID,
        [COLLECTION_ID],
        8,
      ),
    ).resolves.toMatchObject({ ok: false, code: "invalid_response" });

    await expect(
      replaceDeckEntriesWithClient(
        client(
          vi.fn().mockResolvedValue({
            data: {
              ...mutationEnvelope(11),
              entry_count: 1,
            },
            error: null,
          }),
        ),
        DECK_ID,
        [
          {
            cardId: CARD_ID,
            zone: "mainboard",
            quantity: 4,
            preferredPrintingId: null,
            preferredFinish: null,
            notes: null,
          },
        ],
        9,
      ),
    ).resolves.toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("never synthesizes successful mutation IDs from an empty response", async () => {
    const emptyClient = () => client(vi.fn().mockResolvedValue({ data: {}, error: null }));
    const fields = {
      name: "Contract deck",
      formatCode: "commander",
      formatVersionId: FORMAT_VERSION_ID,
      description: null,
      notes: null,
      tags: [],
      coverPrintingId: null,
    };

    const results = await Promise.all([
      createDeckWithClient(emptyClient(), {
        workspaceId: WORKSPACE_ID,
        fields: { ...fields, formatVersionId: null },
        collectionIds: [COLLECTION_ID],
      }),
      updateDeckWithClient(emptyClient(), DECK_ID, fields, 7),
      duplicateDeckWithClient(emptyClient(), DECK_ID, 7, "Contract deck copy"),
      lifecycleDeckWithClient(emptyClient(), "archive", DECK_ID, 7),
      updateDeckEntryWithClient(emptyClient(), {
        deckId: DECK_ID,
        entryId: ENTRY_ID,
        quantity: 2,
        zone: "mainboard",
        preferredPrintingId: null,
        preferredFinish: null,
        notes: null,
        expectedRevision: 7,
      }),
      removeDeckEntryWithClient(emptyClient(), DECK_ID, ENTRY_ID, 7),
    ]);

    expect(results).toHaveLength(6);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, code: "invalid_response" });
    }
  });

  it("resolves exact oracle names in one bounded batch without raw deck text", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deck_id: DECK_ID,
        catalog_version: "mtg-20260726T120000Z",
        limits: {
          max_lines: 2_000,
          max_input_bytes: 524_288,
          max_ambiguous_lines_with_candidates: 250,
          max_candidates_per_ambiguous_line: 5,
          max_suggestion_lines: 50,
          max_suggestions_per_line: 3,
        },
        items: [
          {
            line_id: "line-1",
            input_name: "Lightning Bolt",
            normalized_name: "lightning bolt",
            status: "exact",
            candidate_count: 1,
            candidates: [
              {
                card_id: CARD_ID,
                name: "Lightning Bolt",
                mana_cost: "{R}",
                type_line: "Instant",
                color_identity: ["R"],
              },
            ],
            candidates_truncated: false,
            suggestions_omitted: false,
          },
        ],
        counts: { exact: 1, ambiguous: 0, unresolved: 0 },
      },
      error: null,
    });

    await expect(
      resolveDeckImportWithClient(client(rpc), DECK_ID, [
        { lineId: "line-1", name: "Lightning Bolt" },
      ]),
    ).resolves.toMatchObject({
      ok: true,
      data: { counts: { exact: 1, ambiguous: 0, unresolved: 0 } },
    });
    expect(rpc).toHaveBeenCalledWith("deck_import_resolve", {
      p_deck_id: DECK_ID,
      p_names: [{ line_id: "line-1", name: "Lightning Bolt" }],
    });
  });
});
