import "server-only";

import type { DeckZone, PriceObservation } from "@talence/domain";

import {
  PREVIEW_COLLECTION_ID,
  PREVIEW_TRADE_COLLECTION_ID,
  PREVIEW_WORKSPACE_ID,
} from "@/features/collections/preview-constants";

import { PREVIEW_ARCHIVED_DECK_ID, PREVIEW_DECK_ID } from "./preview-constants";
import { normalizeDeckImportName } from "./text-import";
import type {
  DeckCardIdentity,
  DeckCatalogSearchPage,
  DeckDetail,
  DeckEntry,
  DeckFormat,
  DeckImportResolution,
  DeckListItem,
  DeckListPage,
  DeckPrintingChoice,
  DeckStatusFilter,
} from "./types";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-07-26T16:00:00Z";
const UPDATED_AT = "2026-07-26T18:30:00Z";
const CATALOG_VERSION = "mtg-20260726T120000Z-preview-s1";
const RULES_EFFECTIVE_AT = "2026-07-26T00:00:00Z";
const ALLOCATION_ORDER: DeckZone[] = ["commander", "companion", "mainboard", "sideboard"];

function format(code: string, name: string, fields: Partial<DeckFormat> = {}): DeckFormat {
  return {
    code,
    name,
    formatVersionId: `00000000-0000-4000-8000-${String(7000 + PREVIEW_FORMAT_CODES.findIndex((candidate) => candidate === code) + 1).padStart(12, "0")}`,
    version: 1,
    versionKey: `${code}-2026-07-26.1`,
    rulesVersion: `${code}-2026-07-26.1`,
    effectiveAt: RULES_EFFECTIVE_AT,
    minimumDeckSize: code === "commander" ? 100 : 60,
    maximumDeckSize: code === "commander" ? 100 : null,
    minimumMainDeck: code === "commander" ? 0 : 60,
    maximumMainDeck: null,
    maximumSideboard: code === "commander" ? 0 : 15,
    defaultCopyLimit: code === "commander" ? 1 : 4,
    minimumCommanderCount: code === "commander" ? 1 : 0,
    maximumCommanderCount: code === "commander" ? 2 : 0,
    maximumCompanionCount: 1,
    companionConsumesSideboard: code !== "commander",
    enforceCommanderColorIdentity: code === "commander",
    legalityFormatCode: code,
    restrictedCopyLimit: 1,
    scopeNote:
      "Talence baseline validation is advisory and does not claim exhaustive Comprehensive Rules coverage.",
    active: true,
    ...fields,
  };
}

const PREVIEW_FORMAT_CODES = [
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "pauper",
  "commander",
] as const;

const PREVIEW_FORMATS: DeckFormat[] = [
  format("standard", "Standard"),
  format("pioneer", "Pioneer"),
  format("modern", "Modern"),
  format("legacy", "Legacy"),
  format("vintage", "Vintage"),
  format("pauper", "Pauper"),
  format("commander", "Commander"),
];

const LOTUS_PRICE: PriceObservation = {
  provider: "Scryfall",
  currency: "USD",
  finish: "nonfoil",
  amount: "25000.0000",
  observedAt: "2026-07-26T12:00:00Z",
  ingestedAt: "2026-07-26T12:30:00Z",
  staleAfter: "2026-07-27T12:00:00Z",
};

const BOLT_PRICE: PriceObservation = {
  provider: "Scryfall",
  currency: "USD",
  finish: "nonfoil",
  amount: "2.1500",
  observedAt: "2026-07-26T12:00:00Z",
  ingestedAt: "2026-07-26T12:30:00Z",
  staleAfter: "2026-07-27T12:00:00Z",
};

function printing(
  printingId: string,
  name: string,
  setCode: string,
  setName: string,
  collectorNumber: string,
  imagePath: string,
  price: PriceObservation | null,
): DeckPrintingChoice {
  return {
    printingId,
    name,
    setCode,
    setName,
    collectorNumber,
    language: "en",
    imageSmallUri: `https://cards.scryfall.io/small/front/${imagePath}.jpg`,
    imageNormalUri: `https://cards.scryfall.io/normal/front/${imagePath}.jpg`,
    availableFinishes: ["nonfoil"],
    finishOptions: [
      {
        finish: "nonfoil",
        ownedQuantity: 0,
        price,
      },
    ],
    active: true,
    price,
  };
}

const LOTUS_PRINTING = printing(
  "00000000-0000-4000-8000-000000000101",
  "Black Lotus",
  "LEA",
  "Limited Edition Alpha",
  "232",
  "b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd",
  LOTUS_PRICE,
);

const DELVER_PRINTING = printing(
  "00000000-0000-4000-8000-000000000102",
  "Delver of Secrets // Insectile Aberration",
  "ISD",
  "Innistrad",
  "51",
  "0/0/00000000-0000-4000-8000-000000000102",
  null,
);

const BOLT_PRINTING = printing(
  "00000000-0000-4000-8000-000000000103",
  "Lightning Bolt",
  "STA",
  "Strixhaven Mystical Archive",
  "105",
  "0/0/00000000-0000-4000-8000-000000000103",
  BOLT_PRICE,
);

function card(
  cardId: string,
  name: string,
  printingChoice: DeckPrintingChoice,
  fields: Partial<DeckCardIdentity> = {},
): DeckCardIdentity {
  return {
    cardId,
    name,
    manaCost: null,
    manaValue: null,
    typeLine: null,
    oracleText: null,
    colorIdentity: [],
    representativePrinting: printingChoice,
    printingChoices: [printingChoice],
    ...fields,
  };
}

const LOTUS = card("00000000-0000-4000-8000-000000000001", "Black Lotus", LOTUS_PRINTING, {
  manaCost: "{0}",
  manaValue: 0,
  typeLine: "Artifact",
  oracleText: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
});

const DELVER = card(
  "00000000-0000-4000-8000-000000000002",
  "Delver of Secrets // Insectile Aberration",
  DELVER_PRINTING,
  {
    manaCost: "{U}",
    manaValue: 1,
    typeLine: "Creature - Human Wizard",
    colorIdentity: ["U"],
  },
);

const BOLT = card("00000000-0000-4000-8000-000000000003", "Lightning Bolt", BOLT_PRINTING, {
  manaCost: "{R}",
  manaValue: 1,
  typeLine: "Instant",
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  colorIdentity: ["R"],
});

function entry(
  id: string,
  cardIdentity: DeckCardIdentity,
  zone: DeckZone,
  quantity: number,
  fields: Partial<DeckEntry>,
): DeckEntry {
  return {
    id,
    deckId: PREVIEW_DECK_ID,
    card: cardIdentity,
    zone,
    quantity,
    preferredPrintingId: cardIdentity.representativePrinting?.printingId ?? null,
    preferredFinish: cardIdentity.representativePrinting ? "nonfoil" : null,
    sortOrder: 0,
    notes: null,
    updatedAt: UPDATED_AT,
    currentRevision: 7,
    preferredPrice: cardIdentity.representativePrinting?.price ?? null,
    ownership: {
      countsTowardRequirement: zone !== "maybeboard",
      requiredQuantity: zone === "maybeboard" ? 0 : quantity,
      ownedQuantity: 0,
      allocatedQuantity: 0,
      missingQuantity: zone === "maybeboard" ? 0 : quantity,
      preferredPrintingOwnedQuantity: 0,
      preferredPrintingAllocatedQuantity: 0,
      preferredPrintingMissingQuantity: zone === "maybeboard" ? 0 : quantity,
    },
    ...fields,
  };
}

const PREVIEW_ENTRIES: DeckEntry[] = [
  entry("00000000-0000-4000-8000-000000006101", DELVER, "commander", 1, {
    sortOrder: 0,
    ownership: {
      countsTowardRequirement: true,
      requiredQuantity: 1,
      ownedQuantity: 4,
      allocatedQuantity: 1,
      missingQuantity: 0,
      preferredPrintingOwnedQuantity: 4,
      preferredPrintingAllocatedQuantity: 1,
      preferredPrintingMissingQuantity: 0,
    },
  }),
  entry("00000000-0000-4000-8000-000000006102", LOTUS, "mainboard", 1, {
    sortOrder: 10,
    ownership: {
      countsTowardRequirement: true,
      requiredQuantity: 1,
      ownedQuantity: 1,
      allocatedQuantity: 1,
      missingQuantity: 0,
      preferredPrintingOwnedQuantity: 1,
      preferredPrintingAllocatedQuantity: 1,
      preferredPrintingMissingQuantity: 0,
    },
  }),
  entry("00000000-0000-4000-8000-000000006103", BOLT, "mainboard", 4, {
    sortOrder: 20,
    ownership: {
      countsTowardRequirement: true,
      requiredQuantity: 4,
      ownedQuantity: 2,
      allocatedQuantity: 2,
      missingQuantity: 2,
      preferredPrintingOwnedQuantity: 2,
      preferredPrintingAllocatedQuantity: 2,
      preferredPrintingMissingQuantity: 2,
    },
  }),
  entry("00000000-0000-4000-8000-000000006104", BOLT, "sideboard", 2, {
    sortOrder: 30,
    ownership: {
      countsTowardRequirement: true,
      requiredQuantity: 2,
      ownedQuantity: 2,
      allocatedQuantity: 0,
      missingQuantity: 2,
      preferredPrintingOwnedQuantity: 2,
      preferredPrintingAllocatedQuantity: 0,
      preferredPrintingMissingQuantity: 2,
    },
  }),
  entry("00000000-0000-4000-8000-000000006105", DELVER, "maybeboard", 2, {
    sortOrder: 40,
    preferredPrintingId: null,
    preferredFinish: null,
    preferredPrice: null,
    ownership: {
      countsTowardRequirement: false,
      requiredQuantity: 0,
      ownedQuantity: 4,
      allocatedQuantity: 0,
      missingQuantity: 0,
      preferredPrintingOwnedQuantity: null,
      preferredPrintingAllocatedQuantity: null,
      preferredPrintingMissingQuantity: null,
    },
  }),
];

function primaryDeck(status: "active" | "archived" = "active") {
  return {
    id: status === "active" ? PREVIEW_DECK_ID : PREVIEW_ARCHIVED_DECK_ID,
    workspaceId: PREVIEW_WORKSPACE_ID,
    gameId: GAME_ID,
    formatCode: "commander",
    formatVersionId: PREVIEW_FORMATS.at(-1)!.formatVersionId,
    rulesVersion: PREVIEW_FORMATS.at(-1)!.rulesVersion,
    name: status === "active" ? "Arcane Allocation Lab" : "Archived Control Shell",
    slug: status === "active" ? "arcane-allocation-lab" : "archived-control-shell",
    description:
      status === "active"
        ? "A deterministic preview showing finite-copy allocation across deck zones."
        : "A paused deck retained for later restoration.",
    notes: status === "active" ? "Maybeboard ideas do not consume owned copies." : null,
    tags: status === "active" ? ["preview", "ownership"] : ["archived"],
    coverPrintingId: status === "active" ? DELVER_PRINTING.printingId : null,
    status,
    currentRevision: status === "active" ? 7 : 2,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    archivedAt: status === "archived" ? UPDATED_AT : null,
    deletedAt: null,
  } as const;
}

function listItem(status: "active" | "archived"): DeckListItem {
  const deck = primaryDeck(status);
  return {
    ...deck,
    formatName: "Commander",
    permissions: {
      canEdit: status === "active",
      canArchive: status === "active",
      canRestore: status === "archived",
      canDelete: true,
      canDuplicate: true,
    },
    entryCount: status === "active" ? PREVIEW_ENTRIES.length : 0,
    requiredQuantity: status === "active" ? 8 : 0,
    maybeboardQuantity: status === "active" ? 2 : 0,
    sourceCount: status === "active" ? 2 : 0,
    missingQuantity: status === "active" ? 4 : 0,
  };
}

export function previewDeckFormats(): DeckFormat[] {
  return PREVIEW_FORMATS.map((item) => ({ ...item }));
}

export function previewDeckList(filter: DeckStatusFilter): DeckListPage {
  const items = [listItem("active"), listItem("archived")].filter(
    (item) => filter === "all" || item.status === filter,
  );
  return {
    workspaceId: PREVIEW_WORKSPACE_ID,
    permissions: { canCreate: true },
    items,
    nextCursor: null,
    hasMore: false,
  };
}

export function previewDeckDetail(deckId: string): DeckDetail | null {
  if (deckId !== PREVIEW_DECK_ID && deckId !== PREVIEW_ARCHIVED_DECK_ID) return null;
  const archived = deckId === PREVIEW_ARCHIVED_DECK_ID;
  const formatDefinition = PREVIEW_FORMATS.at(-1)!;
  const entries = archived ? [] : PREVIEW_ENTRIES.map((item) => ({ ...item }));
  return {
    deck: primaryDeck(archived ? "archived" : "active"),
    format: { ...formatDefinition },
    permissions: {
      canEdit: !archived,
      canArchive: !archived,
      canRestore: archived,
      canDelete: true,
      canDuplicate: true,
    },
    availableFormats: previewDeckFormats(),
    sources: [
      {
        collectionId: PREVIEW_COLLECTION_ID,
        name: "Main Collection",
        priority: 0,
        selected: true,
        status: "active",
      },
      {
        collectionId: PREVIEW_TRADE_COLLECTION_ID,
        name: "Trade Binder",
        priority: 1,
        selected: true,
        status: "active",
      },
    ],
    entries,
    ownership: {
      requiredQuantity: archived ? 0 : 8,
      allocatedQuantity: archived ? 0 : 4,
      missingQuantity: archived ? 0 : 4,
      maybeboardQuantity: archived ? 0 : 2,
      sourceCollectionCount: archived ? 0 : 2,
      allocationOrder: ALLOCATION_ORDER,
    },
    valuation: {
      currency: "USD",
      preferredPrintingValue: archived ? null : "25012.9000",
      missingAcquisitionValue: archived ? null : "8.6000",
      unpricedEntryCount: archived ? 0 : 1,
      unpricedMissingQuantity: 0,
      providers: archived ? [] : ["Scryfall"],
      oldestObservedAt: archived ? null : "2026-07-26T12:00:00Z",
      latestObservedAt: archived ? null : "2026-07-26T12:00:00Z",
      oldestIngestedAt: archived ? null : "2026-07-26T12:30:00Z",
      latestIngestedAt: archived ? null : "2026-07-26T12:30:00Z",
      stalePriceCount: 0,
    },
    validation: {
      valid: false,
      formatCode: "commander",
      formatName: "Commander",
      rulesVersion: formatDefinition.rulesVersion,
      catalogVersion: CATALOG_VERSION,
      contentHash: archived ? "preview-archived-empty" : "preview-e43f47b1",
      validationRunId: archived
        ? "00000000-0000-4000-8000-000000006902"
        : "00000000-0000-4000-8000-000000006901",
      evaluatedAt: UPDATED_AT,
      summary: {
        errorCount: archived ? 0 : 3,
        warningCount: archived ? 0 : 1,
        informationCount: archived ? 0 : 1,
        unknownLegalityCount: archived ? 0 : 1,
        issueDetailLimit: 1_000,
        issueDetailReturned: archived ? 0 : 5,
        issueDetailTotal: archived ? 0 : 5,
        issuesTruncated: false,
      },
      advisory: true,
      zoneQuantities: {
        mainboard: archived ? 0 : 5,
        sideboard: archived ? 0 : 2,
        commander: archived ? 0 : 1,
        companion: 0,
        maybeboard: archived ? 0 : 2,
      },
      issues: archived
        ? []
        : [
            {
              code: "mainboard_minimum",
              severity: "error",
              message:
                "Commander requires exactly 100 cards across the mainboard and commander zone; this deck currently has 6.",
              cardId: null,
              zone: "mainboard",
              details: { actual: 6, required: 100, included_zones: ["mainboard", "commander"] },
            },
            {
              code: "card_banned",
              severity: "error",
              message: "Black Lotus is banned in Commander for this catalog version.",
              cardId: LOTUS.cardId,
              zone: "mainboard",
              details: { legality: "banned", format: "commander" },
            },
            {
              code: "commander_color_identity",
              severity: "error",
              message:
                "Lightning Bolt has red color identity outside the commander's blue identity.",
              cardId: BOLT.cardId,
              zone: "mainboard",
              details: { card_identity: ["R"], commander_identity: ["U"] },
            },
            {
              code: "legality_unknown",
              severity: "warning",
              message:
                "Lightning Bolt has no Commander legality row in this preview catalog; legality is unknown.",
              cardId: BOLT.cardId,
              zone: "sideboard",
              details: { format: "commander" },
            },
            {
              code: "commander_pairing_not_exhaustive",
              severity: "information",
              message:
                "Partner/background pairing and commander eligibility need manual review; baseline validation is not exhaustive.",
              cardId: DELVER.cardId,
              zone: "commander",
              details: { commander_count: 1 },
            },
          ],
    },
  };
}

export function previewDeckCatalogSearch(
  query: string,
  formatCode: string,
  deckId = PREVIEW_DECK_ID,
  formatVersionId = PREVIEW_FORMATS.at(-1)!.formatVersionId,
  revision = 7,
  catalogVersion = CATALOG_VERSION,
): DeckCatalogSearchPage {
  const cards = [
    { card: LOTUS, legality: formatCode === "commander" ? "banned" : "restricted", owned: 1 },
    { card: DELVER, legality: "legal", owned: 4 },
    { card: BOLT, legality: null, owned: 2 },
  ].filter(({ card: item }) =>
    query
      ? `${item.name} ${item.typeLine ?? ""}`
          .toLocaleLowerCase("en-US")
          .includes(query.toLocaleLowerCase("en-US"))
      : true,
  );
  return {
    deckId,
    formatVersionId,
    revision,
    items: cards.map((item) => ({
      card: {
        ...item.card,
        printingChoices: [...item.card.printingChoices],
      },
      legality: item.legality,
      ownedQuantity: item.owned,
    })),
    query,
    formatCode,
    nextCursor: null,
    hasMore: false,
    catalogVersion,
  };
}

export function previewDeckImportResolution(
  deckId: string,
  names: Array<{ lineId: string; name: string }>,
): DeckImportResolution {
  const cards = [LOTUS, DELVER, BOLT];
  const items: DeckImportResolution["items"] = names.map(({ lineId, name }) => {
    const normalizedName = normalizeDeckImportName(name);
    const exact = cards.filter(
      (candidate) => normalizeDeckImportName(candidate.name) === normalizedName,
    );
    const suggestions = cards
      .filter((candidate) => {
        const candidateName = normalizeDeckImportName(candidate.name);
        return (
          candidateName.includes(normalizedName) ||
          normalizedName.includes(candidateName) ||
          normalizedName
            .split(" ")
            .some((token) => token.length >= 3 && candidateName.includes(token))
        );
      })
      .slice(0, 5);
    const matches = exact.length ? exact : suggestions;
    const status = exact.length === 1 ? "exact" : exact.length > 1 ? "ambiguous" : "unresolved";
    return {
      lineId,
      inputName: name,
      normalizedName,
      status,
      candidateCount: matches.length,
      candidates: matches.map((candidate) => ({
        cardId: candidate.cardId,
        name: candidate.name,
        manaCost: candidate.manaCost,
        typeLine: candidate.typeLine,
        colorIdentity: candidate.colorIdentity,
      })),
      candidatesTruncated: false,
      suggestionsOmitted: status === "unresolved" && matches.length === 0,
    };
  });
  return {
    deckId,
    catalogVersion: CATALOG_VERSION,
    items,
    counts: {
      exact: items.filter((item) => item.status === "exact").length,
      ambiguous: items.filter((item) => item.status === "ambiguous").length,
      unresolved: items.filter((item) => item.status === "unresolved").length,
    },
    limits: {
      maxLines: 2_000,
      maxInputBytes: 512 * 1024,
      maxAmbiguousLinesWithCandidates: 250,
      maxCandidatesPerAmbiguousLine: 5,
      maxSuggestionLines: 50,
      maxSuggestionsPerLine: 3,
    },
  };
}

export function previewDeckCardPrintings(deckId: string, cardId: string) {
  const detail = previewDeckDetail(deckId);
  const cardIdentity = detail?.entries.find((entry) => entry.card.cardId === cardId)?.card;
  if (!detail || !cardIdentity) return null;
  const oracleOwned =
    detail.entries.find((entry) => entry.card.cardId === cardId)?.ownership.ownedQuantity ?? 0;
  return {
    deckId,
    cardId,
    revision: detail.deck.currentRevision,
    currency: detail.valuation.currency,
    items: cardIdentity.printingChoices.map((item) => ({
      ...item,
      finishOptions: item.finishOptions.map((finishOption) => ({
        ...finishOption,
        ownedQuantity: oracleOwned,
      })),
    })),
    nextCursor: null,
    hasMore: false,
    catalogVersion: CATALOG_VERSION,
  };
}
