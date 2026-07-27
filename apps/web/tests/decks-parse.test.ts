import { describe, expect, it } from "vitest";

import {
  parseDeckCardPrintingsPage,
  parseDeckCatalogSearchPage,
  parseDeckDetail,
  parseDeckExport,
  parseDeckFormatsResponse,
  parseDeckImportResolution,
  parseDeckListPage,
  parseDeckMutation,
} from "@/features/decks/parse";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000003001";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const DECK_ID = "00000000-0000-4000-8000-000000007001";
const FORMAT_VERSION_ID = "00000000-0000-4000-8000-000000007007";
const CARD_ID = "00000000-0000-4000-8000-000000000003";
const SECOND_CARD_ID = "00000000-0000-4000-8000-000000000004";
const PRINTING_ID = "00000000-0000-4000-8000-000000000103";
const CATALOG_VERSION = "mtg-20260726T120000Z";
const ENTRY_ID = "00000000-0000-4000-8000-000000007101";
const REVISION_ID = "00000000-0000-4000-8000-000000007901";

function rules() {
  return {
    format_version_id: FORMAT_VERSION_ID,
    version: 3,
    version_key: "commander-2026-07-26.3",
    effective_at: "2026-07-26T00:00:00Z",
    minimum_mainboard: 0,
    maximum_mainboard: null,
    minimum_deck_size: 100,
    maximum_deck_size: 100,
    sideboard_max: 0,
    default_copy_limit: 1,
    minimum_commander: 1,
    maximum_commander: 2,
    companion_max: 1,
    companion_consumes_sideboard: false,
    enforce_color_identity: true,
    legality_format_code: "commander",
    restricted_copy_limit: 1,
    scope_note: "Versioned practical baseline, not exhaustive rules enforcement.",
  };
}

function realListFixture() {
  return {
    workspace_id: WORKSPACE_ID,
    permissions: { can_create: true },
    items: [
      {
        deck_id: DECK_ID,
        workspace_id: WORKSPACE_ID,
        game_id: GAME_ID,
        name: "Pinned control",
        slug: "pinned-control",
        description: null,
        notes: null,
        tags: ["control"],
        format_code: "commander",
        format_version_id: FORMAT_VERSION_ID,
        rules_version: 3,
        rules_version_key: "commander-2026-07-26.3",
        cover_printing_id: null,
        status: "archived",
        current_revision: 8,
        created_at: "2026-07-26T12:00:00Z",
        updated_at: "2026-07-26T13:00:00Z",
        archived_at: "2026-07-26T13:00:00Z",
        deleted_at: null,
        format_name: "Commander",
        entry_count: 5,
        source_count: 2,
        required_quantity: 100,
        maybeboard_quantity: 3,
        missing_quantity: 4,
        permissions: {
          can_edit: false,
          can_archive: false,
          can_restore: true,
          can_duplicate: true,
          can_delete: true,
        },
      },
    ],
    next_cursor: null,
    has_more: false,
  };
}

function printingFixture() {
  return {
    deck_id: DECK_ID,
    card_id: CARD_ID,
    catalog_version: CATALOG_VERSION,
    revision: 8,
    currency: "USD",
    items: [
      {
        printing_id: PRINTING_ID,
        card_id: CARD_ID,
        display_name: "Lightning Bolt",
        set_code: "STA",
        set_name: "Strixhaven Mystical Archive",
        collector_number: "105",
        language: "en",
        image_small_uri: null,
        image_normal_uri: null,
        active: true,
        finishes: [
          {
            finish: "nonfoil",
            owned_quantity: 2,
            price: {
              amount: "2.1500",
              currency: "USD",
              provider: "scryfall",
              finish: "nonfoil",
              observed_at: "2026-07-26T12:00:00Z",
              ingested_at: "2026-07-26T12:30:00Z",
              stale_after: "2026-07-27T12:00:00Z",
            },
          },
        ],
        price: null,
      },
    ],
    next_cursor: null,
    has_more: false,
  };
}

function detailFixture() {
  return {
    deck: {
      deck_id: DECK_ID,
      workspace_id: WORKSPACE_ID,
      game_id: GAME_ID,
      name: "Evidence deck",
      slug: "evidence-deck",
      description: null,
      notes: null,
      tags: [],
      format_code: "commander",
      format_version_id: FORMAT_VERSION_ID,
      rules_version: 3,
      rules_version_key: "commander-2026-07-26.3",
      cover_printing_id: null,
      status: "active",
      current_revision: 8,
      created_at: "2026-07-26T12:00:00Z",
      updated_at: "2026-07-26T13:00:00Z",
      archived_at: null,
      deleted_at: null,
      format: {
        code: "commander",
        name: "Commander",
        active: true,
        rules: rules(),
      },
      sources: [],
      entries: [
        {
          entry_id: ENTRY_ID,
          card_id: CARD_ID,
          card_name: "Lightning Bolt",
          mana_cost: "{R}",
          mana_value: 1,
          type_line: "Instant",
          oracle_text: "Lightning Bolt deals 3 damage to any target.",
          color_identity: ["R"],
          zone: "mainboard",
          quantity: 1,
          preferred_printing_id: null,
          preferred_finish: null,
          preferred_printing: null,
          sort_order: 0,
          notes: null,
          created_at: "2026-07-26T12:00:00Z",
          updated_at: "2026-07-26T13:00:00Z",
        },
      ],
      permissions: {
        can_edit: true,
        can_archive: true,
        can_restore: false,
        can_duplicate: true,
        can_delete: true,
      },
    },
    ownership: {
      deck_id: DECK_ID,
      currency: "USD",
      sources: [],
      source_warnings: [],
      selected_collection_ids: [],
      allocation_policy:
        "commander, companion, mainboard, sideboard; then sort_order and entry_id; maybeboard does not consume inventory",
      summary: {
        required_quantity: 1,
        allocated_owned_quantity: 0,
        missing_quantity: 1,
        maybeboard_quantity: 0,
        preferred_value: null,
        missing_acquisition_value: null,
        unpriced_entry_count: 1,
        unpriced_missing_quantity: 1,
        stale_price_entry_count: 0,
        price_providers: [],
        oldest_price_observed_at: null,
        latest_price_observed_at: null,
        oldest_price_ingested_at: null,
        latest_price_ingested_at: null,
      },
      entries: [
        {
          entry_id: ENTRY_ID,
          card_id: CARD_ID,
          card_name: "Lightning Bolt",
          zone: "mainboard",
          required_quantity: 1,
          available_oracle_quantity: 0,
          allocated_owned_quantity: 0,
          missing_quantity: 1,
          maybeboard_excluded: false,
          preferred_printing: null,
          selected_value: null,
          missing_acquisition_value: null,
        },
      ],
    },
    validation: {
      deck_id: DECK_ID,
      advisory: true,
      valid: false,
      content_hash: "b".repeat(64),
      rules_version: {
        format_code: "commander",
        rules: rules(),
      },
      catalog_version: CATALOG_VERSION,
      summary: {
        errors: 1,
        warnings: 0,
        infos: 0,
        legality_unknown_count: 0,
        issue_detail_limit: 1_000,
        issue_detail_returned: 1,
        issue_detail_total: 1,
        issues_truncated: false,
      },
      counts: {
        mainboard: 1,
        sideboard: 0,
        commander: 0,
        companion: 0,
        maybeboard: 0,
        deck_size_mainboard_plus_commander: 1,
        sideboard_capacity_used: 0,
      },
      issues: [
        {
          code: "mainboard_minimum",
          severity: "error",
          message: "The mainboard is too small.",
          entry_id: null,
          card_id: null,
          zone: "mainboard",
          details: { actual: 1, minimum: 100 },
        },
      ],
      validation_run_id: REVISION_ID,
      deck_revision_id: "00000000-0000-4000-8000-000000007902",
      revision: 8,
      evaluated_at: "2026-07-26T13:00:00Z",
    },
  };
}

function parsedFormats() {
  const formats = parseDeckFormatsResponse({
    formats: [
      {
        code: "commander",
        name: "Commander",
        active: true,
        latest_version: rules(),
      },
    ],
  });
  if (!formats) throw new Error("format fixture is invalid");
  return formats;
}

describe("deck unknown-response parsers", () => {
  it("parses the exact deck_list shape and prefers rules_version_key over numeric version", () => {
    const parsed = parseDeckListPage(realListFixture(), {
      workspaceId: WORKSPACE_ID,
      filter: "archived",
    });

    expect(parsed?.items[0]).toMatchObject({
      id: DECK_ID,
      rulesVersion: "commander-2026-07-26.3",
      currentRevision: 8,
      permissions: {
        canEdit: false,
        canRestore: true,
        canDuplicate: true,
      },
    });
  });

  it("rejects malformed required IDs, timestamps, cursors, and permission fields", () => {
    expect(
      parseDeckListPage({
        ...realListFixture(),
        workspace_id: "not-a-uuid",
      }),
    ).toBeNull();
    expect(
      parseDeckListPage({
        ...realListFixture(),
        items: [{ ...realListFixture().items[0], updated_at: "yesterday" }],
      }),
    ).toBeNull();
    expect(
      parseDeckListPage({
        ...realListFixture(),
        next_cursor: "unsafe cursor",
        has_more: true,
      }),
    ).toBeNull();
    expect(
      parseDeckListPage({
        ...realListFixture(),
        items: [
          {
            ...realListFixture().items[0],
            permissions: {
              ...realListFixture().items[0].permissions,
              can_restore: "yes",
            },
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseDeckListPage(
        {
          ...realListFixture(),
          items: [
            {
              ...realListFixture().items[0],
              workspace_id: SECOND_CARD_ID,
            },
          ],
        },
        { workspaceId: WORKSPACE_ID, filter: "archived" },
      ),
    ).toBeNull();
    expect(
      parseDeckListPage(realListFixture(), {
        workspaceId: WORKSPACE_ID,
        filter: "active",
      }),
    ).toBeNull();
  });

  it("requires complete versioned format configuration instead of inventing defaults", () => {
    expect(
      parseDeckFormatsResponse({
        formats: [
          {
            code: "commander",
            name: "Commander",
            active: true,
            latest_version: rules(),
          },
        ],
      })?.[0],
    ).toMatchObject({
      version: 3,
      effectiveAt: "2026-07-26T00:00:00Z",
      active: true,
      maximumDeckSize: 100,
    });
    const withoutEffectiveAt: Record<string, unknown> = { ...rules() };
    delete withoutEffectiveAt.effective_at;
    expect(
      parseDeckFormatsResponse({
        formats: [
          {
            code: "commander",
            name: "Commander",
            active: true,
            latest_version: withoutEffectiveAt,
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseDeckFormatsResponse({
        formats: [
          {
            code: "commander",
            name: "Commander",
            latest_version: rules(),
          },
        ],
      }),
    ).toBeNull();
  });

  it("parses complete validation totals and rejects mismatched detail evidence", () => {
    const fixture = detailFixture();
    const parsed = parseDeckDetail(fixture, parsedFormats(), {
      deckId: DECK_ID,
      currency: "USD",
    });
    expect(parsed?.validation.summary).toEqual({
      errorCount: 1,
      warningCount: 0,
      informationCount: 0,
      unknownLegalityCount: 0,
      issueDetailLimit: 1_000,
      issueDetailReturned: 1,
      issueDetailTotal: 1,
      issuesTruncated: false,
    });

    fixture.validation.summary.errors = 2;
    expect(
      parseDeckDetail(fixture, parsedFormats(), {
        deckId: DECK_ID,
        currency: "USD",
      }),
    ).toBeNull();

    expect(
      parseDeckDetail(detailFixture(), parsedFormats(), {
        deckId: DECK_ID,
        currency: "EUR",
      }),
    ).toBeNull();
  });

  it("accepts coherent truncated detail while retaining complete severity totals", () => {
    const fixture = detailFixture();
    const validation = fixture.validation as unknown as {
      summary: Record<string, unknown>;
      issues: Array<Record<string, unknown>>;
    };
    validation.summary = {
      errors: 1_001,
      warnings: 0,
      infos: 0,
      legality_unknown_count: 0,
      issue_detail_limit: 1_000,
      issue_detail_returned: 1_001,
      issue_detail_total: 1_001,
      issues_truncated: true,
    };
    validation.issues = [
      ...Array.from({ length: 1_000 }, () => ({
        code: "copy_limit",
        severity: "error",
        message: "A complete issue detail.",
        entry_id: null,
        card_id: null,
        zone: "mainboard",
        details: {},
      })),
      {
        code: "validation_issues_truncated",
        severity: "error",
        message: "Issue detail exceeded the response cap.",
        entry_id: null,
        card_id: null,
        zone: null,
        details: {
          detail_limit: 1_000,
          total: 1_001,
          omitted: 1,
          omitted_errors: 1,
          omitted_warnings: 0,
          omitted_infos: 0,
        },
      },
    ];

    expect(
      parseDeckDetail(fixture, parsedFormats(), {
        deckId: DECK_ID,
        currency: "USD",
      })?.validation.summary,
    ).toMatchObject({
      errorCount: 1_001,
      issueDetailTotal: 1_001,
      issuesTruncated: true,
    });
  });

  it("parses display_name and rejects malformed nested price evidence", () => {
    expect(
      parseDeckCardPrintingsPage(printingFixture(), {
        deckId: DECK_ID,
        cardId: CARD_ID,
        revision: 8,
        currency: "USD",
        catalogVersion: CATALOG_VERSION,
      })?.items[0],
    ).toMatchObject({
      printingId: PRINTING_ID,
      name: "Lightning Bolt",
      finishOptions: [
        {
          finish: "nonfoil",
          ownedQuantity: 2,
          price: {
            amount: "2.1500",
            provider: "scryfall",
          },
        },
      ],
    });
    const malformed = printingFixture();
    malformed.items[0]!.finishes[0]!.price.observed_at = "not-a-timestamp";
    expect(
      parseDeckCardPrintingsPage(malformed, {
        deckId: DECK_ID,
        cardId: CARD_ID,
        revision: 8,
        currency: "USD",
        catalogVersion: CATALOG_VERSION,
      }),
    ).toBeNull();

    const mismatchedCard = printingFixture();
    mismatchedCard.items[0]!.card_id = SECOND_CARD_ID;
    expect(
      parseDeckCardPrintingsPage(mismatchedCard, {
        deckId: DECK_ID,
        cardId: CARD_ID,
        revision: 8,
        currency: "USD",
        catalogVersion: CATALOG_VERSION,
      }),
    ).toBeNull();

    const mismatchedCurrency = printingFixture();
    mismatchedCurrency.items[0]!.finishes[0]!.price.currency = "EUR";
    expect(
      parseDeckCardPrintingsPage(mismatchedCurrency, {
        deckId: DECK_ID,
        cardId: CARD_ID,
        revision: 8,
        currency: "USD",
        catalogVersion: CATALOG_VERSION,
      }),
    ).toBeNull();
  });

  it("retains a catalog printing's singular finish as a selectable preference", () => {
    const singularFinish = printingFixture();
    const printing = singularFinish.items[0] as unknown as Record<string, unknown>;
    printing.finish = "foil";
    printing.finishes = [];

    expect(
      parseDeckCardPrintingsPage(singularFinish, {
        deckId: DECK_ID,
        cardId: CARD_ID,
        revision: 8,
        currency: "USD",
        catalogVersion: CATALOG_VERSION,
      })?.items[0],
    ).toMatchObject({ availableFinishes: ["foil"] });
  });

  it("rejects a malformed non-null catalog default printing instead of dropping it", () => {
    expect(
      parseDeckCatalogSearchPage(
        {
          deck_id: DECK_ID,
          query: "bolt",
          format_version_id: FORMAT_VERSION_ID,
          revision: 8,
          catalog_version: CATALOG_VERSION,
          items: [
            {
              card_id: CARD_ID,
              name: "Lightning Bolt",
              mana_cost: "{R}",
              mana_value: 1,
              type_line: "Instant",
              oracle_text: "Lightning Bolt deals 3 damage to any target.",
              color_identity: ["R"],
              legality: "legal",
              owned_quantity: 2,
              default_printing: {},
            },
          ],
          next_cursor: null,
          has_more: false,
        },
        {
          deckId: DECK_ID,
          query: "bolt",
          formatCode: "commander",
          formatVersionId: FORMAT_VERSION_ID,
          revision: 8,
          catalogVersion: CATALOG_VERSION,
          currency: "USD",
        },
      ),
    ).toBeNull();
  });

  it("retains export revision/catalog evidence and rejects top-level mismatches", () => {
    const value = {
      catalog_version: CATALOG_VERSION,
      revision: 8,
      plain_text: "1 Lightning Bolt\n",
      stable_json: {
        schema_version: 1,
        deck: {
          deck_id: DECK_ID,
          name: "Evidence deck",
          format_code: "commander",
          format_version_id: FORMAT_VERSION_ID,
          revision: 8,
          catalog_version: CATALOG_VERSION,
        },
        entries: [
          {
            card_id: CARD_ID,
            name: "Lightning Bolt",
            zone: "mainboard",
            quantity: 1,
            preferred_printing_id: null,
            preferred_finish: null,
            notes: null,
          },
        ],
      },
    };
    expect(parseDeckExport(value, DECK_ID)).toMatchObject({
      revision: 8,
      catalogVersion: CATALOG_VERSION,
      stableJson: {
        deck: {
          revision: 8,
          catalog_version: CATALOG_VERSION,
        },
      },
    });
    expect(
      parseDeckExport(
        {
          ...value,
          stable_json: {
            ...value.stable_json,
            deck: { ...value.stable_json.deck, revision: 7 },
          },
        },
        DECK_ID,
      ),
    ).toBeNull();
    expect(parseDeckExport(value, SECOND_CARD_ID)).toBeNull();
  });

  it("accepts bounded omitted ambiguity while validating candidate IDs and counts", () => {
    const bounded = {
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
          input_name: "Shared exact name",
          normalized_name: "shared exact name",
          status: "ambiguous",
          candidate_count: 8,
          candidates: [],
          candidates_truncated: true,
          suggestions_omitted: false,
        },
      ],
      counts: { exact: 0, ambiguous: 1, unresolved: 0 },
    };
    expect(parseDeckImportResolution(bounded, DECK_ID)?.items[0]).toMatchObject({
      candidateCount: 8,
      candidates: [],
      candidatesTruncated: true,
    });

    expect(
      parseDeckImportResolution(
        {
          ...bounded,
          items: [
            {
              ...bounded.items[0],
              status: "exact",
              candidate_count: 1,
              candidates_truncated: false,
              candidates: [
                {
                  card_id: "not-a-uuid",
                  name: "Shared exact name",
                  mana_cost: null,
                  type_line: null,
                  color_identity: [],
                },
              ],
            },
          ],
          counts: { exact: 1, ambiguous: 0, unresolved: 0 },
        },
        DECK_ID,
      ),
    ).toBeNull();
  });

  it("rejects mutation IDs that lack a coherent deck and revision envelope", () => {
    expect(parseDeckMutation({ deck_id: DECK_ID }, { deckId: DECK_ID })).toBeNull();
    expect(parseDeckMutation({}, { deckId: DECK_ID })).toBeNull();
    expect(parseDeckMutation(null, { deckId: SECOND_CARD_ID })).toBeNull();

    const fixture = detailFixture();
    const mutation = {
      deck: fixture.deck,
      revision: {
        revision_id: REVISION_ID,
        revision: 8,
        content_hash: "c".repeat(64),
        rules_version_id: FORMAT_VERSION_ID,
        catalog_version: CATALOG_VERSION,
      },
    };
    expect(
      parseDeckMutation(mutation, {
        deckId: DECK_ID,
        workspaceId: WORKSPACE_ID,
        expectedRevision: 7,
        status: "active",
        formatCode: "commander",
        formatVersionId: FORMAT_VERSION_ID,
        name: "Evidence deck",
        description: null,
        notes: null,
        tags: [],
        coverPrintingId: null,
      }),
    ).toEqual({ deckId: DECK_ID, revision: 8 });
    expect(
      parseDeckMutation(
        {
          ...mutation,
          revision: { ...mutation.revision, revision: 7 },
        },
        { deckId: DECK_ID, expectedRevision: 7 },
      ),
    ).toBeNull();
  });
});
