import "server-only";

import type { PriceObservation } from "@talence/domain";

import { ALL_CATALOG_LANGUAGES, DEFAULT_CATALOG_LANGUAGE } from "./query";
import { catalogPricePair } from "./prices";
import type {
  AdminCatalogStatus,
  CatalogCardDetail,
  CatalogFace,
  CatalogFreshness,
  CatalogPrintingDetail,
  CatalogSearchItem,
  CatalogSearchQuery,
  CatalogSearchResult,
  CatalogSetDetail,
  CatalogStatus,
} from "./types";

const PREVIEW_CATALOG: CatalogFreshness = {
  version: "mtg-20260726T120000Z-preview-s1",
  provider: "Scryfall",
  sourceObservedAt: "2026-07-26T12:00:00Z",
  ingestedAt: "2026-07-26T12:30:00Z",
};

function face(
  printingId: string,
  faceIndex: number,
  name: string,
  imagePath: string,
  fields: Partial<CatalogFace> = {},
): CatalogFace {
  return {
    id: `${printingId}-face-${faceIndex}`,
    faceIndex,
    name,
    manaCost: null,
    typeLine: null,
    oracleText: null,
    colors: [],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    artist: null,
    imageSmallUri: `https://cards.scryfall.io/small/front/${imagePath}.jpg`,
    imageNormalUri: `https://cards.scryfall.io/normal/front/${imagePath}.jpg`,
    imageLargeUri: `https://cards.scryfall.io/large/front/${imagePath}.jpg`,
    ...fields,
  };
}

const blackLotusPrice: PriceObservation = {
  provider: "Scryfall",
  currency: "USD",
  finish: "nonfoil",
  amount: "25000.0000",
  observedAt: "2026-07-26T12:00:00Z",
  ingestedAt: "2026-07-26T12:30:00Z",
  staleAfter: "2026-07-27T12:00:00Z",
};

const lightningBoltPrice: PriceObservation = {
  provider: "Scryfall",
  currency: "USD",
  finish: "nonfoil",
  amount: "2.1500",
  observedAt: "2026-07-26T12:00:00Z",
  ingestedAt: "2026-07-26T12:30:00Z",
  staleAfter: "2026-07-27T12:00:00Z",
};

const lightningBoltFoilPrice: PriceObservation = {
  ...lightningBoltPrice,
  amount: "8.4500",
  finish: "foil",
};

const BASE_PREVIEW_ITEMS: CatalogSearchItem[] = [
  {
    cardId: "00000000-0000-4000-8000-000000000001",
    printingId: "00000000-0000-4000-8000-000000000101",
    name: "Black Lotus",
    oracleName: "Black Lotus",
    printedName: null,
    manaCost: "{0}",
    manaValue: 0,
    typeLine: "Artifact",
    oracleText: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    colors: [],
    colorIdentity: [],
    keywords: [],
    set: {
      id: "00000000-0000-4000-8000-000000001001",
      code: "LEA",
      name: "Limited Edition Alpha",
      setType: "core",
      releasedAt: "1993-08-05",
      cardCount: 295,
      digital: false,
      iconSvgUri: "https://svgs.scryfall.io/sets/lea.svg",
    },
    collectorNumber: "232",
    language: "en",
    rarity: "rare",
    layout: "normal",
    releasedAt: "1993-08-05",
    digital: false,
    promo: false,
    oversized: false,
    finishes: ["nonfoil"],
    artist: "Christopher Rush",
    providerUri: "https://scryfall.com/card/lea/232/black-lotus",
    faces: [
      face(
        "00000000-0000-4000-8000-000000000101",
        0,
        "Black Lotus",
        "b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd",
        {
          manaCost: "{0}",
          typeLine: "Artifact",
          oracleText: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
          artist: "Christopher Rush",
        },
      ),
    ],
    prices: [blackLotusPrice],
    bestPrice: blackLotusPrice,
    displayPrices: catalogPricePair([blackLotusPrice]),
  },
  {
    cardId: "00000000-0000-4000-8000-000000000002",
    printingId: "00000000-0000-4000-8000-000000000102",
    name: "Delver of Secrets // Insectile Aberration",
    oracleName: "Delver of Secrets // Insectile Aberration",
    printedName: null,
    manaCost: "{U}",
    manaValue: 1,
    typeLine: "Creature — Human Wizard // Creature — Human Insect",
    oracleText: "At the beginning of your upkeep, look at the top card of your library.",
    colors: ["U"],
    colorIdentity: ["U"],
    keywords: ["Flying", "Transform"],
    set: {
      id: "00000000-0000-4000-8000-000000001002",
      code: "ISD",
      name: "Innistrad",
      setType: "expansion",
      releasedAt: "2011-09-30",
      cardCount: 264,
      digital: false,
      iconSvgUri: "https://svgs.scryfall.io/sets/isd.svg",
    },
    collectorNumber: "51",
    language: "en",
    rarity: "common",
    layout: "transform",
    releasedAt: "2011-09-30",
    digital: false,
    promo: false,
    oversized: false,
    finishes: ["nonfoil", "foil"],
    artist: "Nils Hamm",
    providerUri: "https://scryfall.com/card/isd/51/delver-of-secrets-insectile-aberration",
    faces: [
      face(
        "00000000-0000-4000-8000-000000000102",
        0,
        "Delver of Secrets",
        "0/0/00000000-0000-4000-8000-000000000102",
        {
          manaCost: "{U}",
          typeLine: "Creature — Human Wizard",
          oracleText:
            "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
          colors: ["U"],
          power: "1",
          toughness: "1",
          artist: "Nils Hamm",
        },
      ),
      face(
        "00000000-0000-4000-8000-000000000102",
        1,
        "Insectile Aberration",
        "0/0/00000000-0000-4000-8000-000000000102",
        {
          typeLine: "Creature — Human Insect",
          oracleText: "Flying",
          colors: ["U"],
          power: "3",
          toughness: "2",
          artist: "Nils Hamm",
        },
      ),
    ],
    prices: [],
    bestPrice: null,
    displayPrices: catalogPricePair([]),
  },
  {
    cardId: "00000000-0000-4000-8000-000000000003",
    printingId: "00000000-0000-4000-8000-000000000103",
    name: "Lightning Bolt",
    oracleName: "Lightning Bolt",
    printedName: "稲妻",
    manaCost: "{R}",
    manaValue: 1,
    typeLine: "Instant",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    colors: ["R"],
    colorIdentity: ["R"],
    keywords: [],
    set: {
      id: "00000000-0000-4000-8000-000000001003",
      code: "STA",
      name: "Strixhaven Mystical Archive",
      setType: "masterpiece",
      releasedAt: "2021-04-23",
      cardCount: 63,
      digital: false,
      iconSvgUri: "https://svgs.scryfall.io/sets/sta.svg",
    },
    collectorNumber: "105",
    language: "ja",
    rarity: "rare",
    layout: "normal",
    releasedAt: "2021-04-23",
    digital: false,
    promo: false,
    oversized: false,
    finishes: ["nonfoil", "foil"],
    artist: "Hiroshi Nagai",
    providerUri: "https://scryfall.com/card/sta/105/ja/lightning-bolt",
    faces: [
      face(
        "00000000-0000-4000-8000-000000000103",
        0,
        "稲妻",
        "0/0/00000000-0000-4000-8000-000000000103",
        {
          manaCost: "{R}",
          typeLine: "Instant",
          oracleText: "Lightning Bolt deals 3 damage to any target.",
          colors: ["R"],
          artist: "Hiroshi Nagai",
        },
      ),
    ],
    prices: [lightningBoltPrice, lightningBoltFoilPrice],
    bestPrice: lightningBoltPrice,
    displayPrices: catalogPricePair([lightningBoltPrice, lightningBoltFoilPrice]),
  },
  {
    cardId: null,
    printingId: "00000000-0000-4000-8000-000000000104",
    name: "Treasure",
    oracleName: "Treasure",
    printedName: null,
    manaCost: null,
    manaValue: null,
    typeLine: "Token Artifact — Treasure",
    oracleText: "{T}, Sacrifice this artifact: Add one mana of any color.",
    colors: [],
    colorIdentity: [],
    keywords: [],
    set: {
      id: "00000000-0000-4000-8000-000000001004",
      code: "TST",
      name: "Talence Fixture Tokens",
      setType: "token",
      releasedAt: "2026-07-26",
      cardCount: 1,
      digital: false,
      iconSvgUri: null,
    },
    collectorNumber: "1",
    language: "en",
    rarity: "common",
    layout: "token",
    releasedAt: "2026-07-26",
    digital: false,
    promo: false,
    oversized: false,
    finishes: ["nonfoil"],
    artist: "Fixture Artist",
    providerUri: "https://scryfall.com",
    faces: [
      face(
        "00000000-0000-4000-8000-000000000104",
        0,
        "Treasure",
        "0/0/00000000-0000-4000-8000-000000000104",
        {
          typeLine: "Token Artifact — Treasure",
          oracleText: "{T}, Sacrifice this artifact: Add one mana of any color.",
          artist: "Fixture Artist",
        },
      ),
    ],
    prices: [],
    bestPrice: null,
    displayPrices: catalogPricePair([]),
  },
];

const BLACK_LOTUS_UNLIMITED: CatalogSearchItem = {
  ...BASE_PREVIEW_ITEMS[0]!,
  printingId: "00000000-0000-4000-8000-000000000105",
  set: {
    ...BASE_PREVIEW_ITEMS[0]!.set,
    id: "00000000-0000-4000-8000-000000001005",
    code: "2ED",
    name: "Unlimited Edition",
    releasedAt: "1993-12-01",
  },
  collectorNumber: "233",
  releasedAt: "1993-12-01",
  providerUri: "https://scryfall.com/card/2ed/233/black-lotus",
  faces: [
    face(
      "00000000-0000-4000-8000-000000000105",
      0,
      "Black Lotus",
      "b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd",
      {
        manaCost: "{0}",
        typeLine: "Artifact",
        oracleText: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
        artist: "Christopher Rush",
      },
    ),
  ],
};

const PREVIEW_ITEMS: CatalogSearchItem[] = [
  BASE_PREVIEW_ITEMS[0]!,
  BLACK_LOTUS_UNLIMITED,
  ...BASE_PREVIEW_ITEMS.slice(1),
];

const PRICE_BY_PRINTING = new Map<string, PriceObservation[]>([
  [PREVIEW_ITEMS[0]!.printingId, [blackLotusPrice]],
  [PREVIEW_ITEMS[1]!.printingId, [blackLotusPrice]],
  [PREVIEW_ITEMS[2]!.printingId, []],
  [PREVIEW_ITEMS[3]!.printingId, [lightningBoltPrice, lightningBoltFoilPrice]],
  [PREVIEW_ITEMS[4]!.printingId, []],
]);

function includesText(item: CatalogSearchItem, query: string): boolean {
  const haystack = [
    item.name,
    item.printedName,
    item.typeLine,
    item.oracleText,
    item.set.name,
    item.set.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
  return haystack.includes(query.toLocaleLowerCase("en-US"));
}

function comparePrice(left: CatalogSearchItem, right: CatalogSearchItem): number {
  const leftPrice = left.bestPrice ? Number(left.bestPrice.amount) : Number.POSITIVE_INFINITY;
  const rightPrice = right.bestPrice ? Number(right.bestPrice.amount) : Number.POSITIVE_INFINITY;
  return leftPrice - rightPrice;
}

function oracleRepresentatives(items: CatalogSearchItem[]): CatalogSearchItem[] {
  const representatives = new Map<string, CatalogSearchItem>();

  items.forEach((item) => {
    const identity = item.cardId ?? `printing:${item.printingId}`;
    const current = representatives.get(identity);
    if (
      !current ||
      (item.releasedAt ?? "") > (current.releasedAt ?? "") ||
      ((item.releasedAt ?? "") === (current.releasedAt ?? "") &&
        item.printingId < current.printingId)
    ) {
      representatives.set(identity, item);
    }
  });

  return Array.from(representatives.values());
}

export function previewCatalogSearch(query: CatalogSearchQuery): CatalogSearchResult {
  const filtered = PREVIEW_ITEMS.filter((item) => {
    if (!query.includeDigital && item.digital) return false;
    if (!query.includeNondefault && item.layout === "token") return false;
    if (query.query && !includesText(item, query.query)) return false;
    if (query.setCode && item.set.code !== query.setCode) return false;
    if (
      query.language !== ALL_CATALOG_LANGUAGES &&
      item.language !== (query.language || DEFAULT_CATALOG_LANGUAGE)
    ) {
      return false;
    }
    if (query.rarity && item.rarity !== query.rarity) return false;
    if (query.finish && !item.finishes.includes(query.finish)) return false;
    if (query.colors.length && !query.colors.every((color) => item.colors.includes(color))) {
      return false;
    }
    if (
      query.colorIdentity.length &&
      !query.colorIdentity.every((color) =>
        color === "C" ? item.colorIdentity.length === 0 : item.colorIdentity.includes(color),
      )
    ) {
      return false;
    }
    if (query.typeLine && !item.typeLine?.toLowerCase().includes(query.typeLine.toLowerCase())) {
      return false;
    }
    if (query.manaValueMin !== null && (item.manaValue ?? -1) < query.manaValueMin) return false;
    if (query.manaValueMax !== null && (item.manaValue ?? Infinity) > query.manaValueMax)
      return false;
    if (query.priceAvailability === "available" && !item.bestPrice) return false;
    if (query.priceAvailability === "unavailable" && item.bestPrice) return false;
    if (query.currency && item.bestPrice && item.bestPrice.currency !== query.currency)
      return false;
    if (query.releasedFrom && (!item.releasedAt || item.releasedAt < query.releasedFrom)) {
      return false;
    }
    if (query.releasedTo && (!item.releasedAt || item.releasedAt > query.releasedTo)) return false;
    return true;
  });

  const selected = query.returnAllVariants
    ? filtered.map((item) => ({
        ...item,
        displayPrices: catalogPricePair(item.prices, query.currency),
      }))
    : oracleRepresentatives(filtered).map((item) => {
        const oraclePrices = filtered
          .filter((candidate) => candidate.cardId === item.cardId)
          .flatMap((candidate) => candidate.prices);
        return { ...item, displayPrices: catalogPricePair(oraclePrices, query.currency) };
      });

  selected.sort((left, right) => {
    if (query.sort === "newest") {
      return (
        (right.releasedAt ?? "").localeCompare(left.releasedAt ?? "") ||
        left.name.localeCompare(right.name)
      );
    }
    if (query.sort === "price_asc") {
      return comparePrice(left, right) || left.name.localeCompare(right.name);
    }
    if (query.sort === "price_desc") {
      return comparePrice(right, left) || left.name.localeCompare(right.name);
    }
    return (
      left.name.localeCompare(right.name) ||
      left.set.code.localeCompare(right.set.code) ||
      left.collectorNumber.localeCompare(right.collectorNumber)
    );
  });

  const items = selected.slice(0, query.pageSize);

  return {
    items,
    nextCursor: null,
    previousCursor: null,
    totalCount: selected.length,
    resultCount: items.length,
    currency: query.currency || "USD",
    catalog: PREVIEW_CATALOG,
  };
}

export function previewCatalogCardDetail(cardId: string): CatalogCardDetail | null {
  const printings = PREVIEW_ITEMS.filter((item) => item.cardId === cardId).sort(
    (left, right) =>
      (right.releasedAt ?? "").localeCompare(left.releasedAt ?? "") ||
      left.printingId.localeCompare(right.printingId),
  );
  const representative = printings[0];
  if (!representative) {
    return null;
  }
  return {
    card: {
      id: cardId,
      name: representative.name,
      manaCost: representative.manaCost,
      manaValue: representative.manaValue,
      typeLine: representative.typeLine,
      oracleText: representative.oracleText,
      colors: representative.colors,
      colorIdentity: representative.colorIdentity,
      keywords: representative.keywords,
      reserved: representative.name === "Black Lotus",
    },
    representativePrinting: representative,
    printings,
    printingCount: printings.length,
    printingsTruncated: false,
    legalities: [
      { formatCode: "vintage", legality: "restricted" },
      {
        formatCode: "commander",
        legality: representative.name === "Black Lotus" ? "banned" : "legal",
      },
    ],
    catalog: PREVIEW_CATALOG,
  };
}

export function previewCatalogPrintingDetail(printingId: string): CatalogPrintingDetail | null {
  const printing = PREVIEW_ITEMS.find((item) => item.printingId === printingId);
  return printing
    ? {
        printing,
        prices: PRICE_BY_PRINTING.get(printingId) ?? [],
        catalog: PREVIEW_CATALOG,
      }
    : null;
}

export function previewCatalogSetDetail(setCode: string): CatalogSetDetail | null {
  const printings = PREVIEW_ITEMS.filter(
    (item) => item.set.code.toLowerCase() === setCode.toLowerCase(),
  );
  const first = printings[0];
  return first
    ? {
        set: {
          ...first.set,
          sourceProvider: "Scryfall",
          sourceUpdatedAt: PREVIEW_CATALOG.sourceObservedAt,
          foilOnly: false,
          nonfoilOnly: false,
        },
        printings,
        totalCount: printings.length,
        catalog: PREVIEW_CATALOG,
      }
    : null;
}

export function previewCatalogStatus(): CatalogStatus {
  return {
    catalog: PREVIEW_CATALOG,
    counts: {
      sets: new Set(PREVIEW_ITEMS.map((item) => item.set.id)).size,
      cards: new Set(PREVIEW_ITEMS.flatMap((item) => (item.cardId ? [item.cardId] : []))).size,
      printings: PREVIEW_ITEMS.length,
      faces: PREVIEW_ITEMS.reduce((total, item) => total + item.faces.length, 0),
      prices: Array.from(PRICE_BY_PRINTING.values()).reduce(
        (total, prices) => total + prices.length,
        0,
      ),
    },
  };
}

export function previewAdminCatalogStatus(): AdminCatalogStatus {
  return {
    ...previewCatalogStatus(),
    syncEnabled: false,
    latestImports: [],
    queuedImports: [],
    source: {
      provider: "Scryfall",
      sourceType: "all_cards",
      providerObjectId: "preview-fixture",
      providerUpdatedAt: PREVIEW_CATALOG.sourceObservedAt,
      downloadedAt: PREVIEW_CATALOG.ingestedAt,
      sha256: "preview-only",
      status: "succeeded",
    },
    snapshotVersion: null,
  };
}
