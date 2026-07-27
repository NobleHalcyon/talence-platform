from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

CardFinish = Literal["nonfoil", "foil", "etched"]
EntityType = Literal["card", "printing", "set"]


@dataclass(frozen=True, slots=True)
class CatalogSet:
    set_id: str
    code: str
    name: str
    set_type: str | None
    released_at: str | None
    parent_set_id: str | None
    card_count: int | None
    digital: bool
    foil_only: bool
    nonfoil_only: bool
    icon_svg_uri: str | None


@dataclass(frozen=True, slots=True)
class OracleCard:
    oracle_card_id: str
    name: str
    normalized_name: str
    mana_cost: str | None
    mana_value: Decimal | None
    type_line: str | None
    oracle_text: str | None
    colors: tuple[str, ...]
    color_identity: tuple[str, ...]
    keywords: tuple[str, ...]
    reserved: bool


@dataclass(frozen=True, slots=True)
class Printing:
    printing_id: str
    oracle_card_id: str | None
    set_id: str
    collector_number: str
    language: str
    printed_name: str | None
    rarity: str | None
    layout: str | None
    released_at: str | None
    digital: bool
    promo: bool
    oversized: bool
    variation: bool
    finishes: tuple[CardFinish, ...]
    color_identity: tuple[str, ...]
    frame_effects: tuple[str, ...]
    border_color: str | None
    artist: str | None
    scryfall_uri: str | None
    image_status: str | None
    default_browse: bool


@dataclass(frozen=True, slots=True)
class Face:
    face_id: str
    printing_id: str
    face_index: int
    name: str
    mana_cost: str | None
    type_line: str | None
    oracle_text: str | None
    colors: tuple[str, ...]
    power: str | None
    toughness: str | None
    loyalty: str | None
    defense: str | None
    artist: str | None
    image_small_uri: str | None
    image_normal_uri: str | None
    image_large_uri: str | None
    image_png_uri: str | None
    art_crop_uri: str | None
    border_crop_uri: str | None


@dataclass(frozen=True, slots=True)
class Legality:
    oracle_card_id: str
    format_code: str
    legality: Literal["legal", "not_legal", "restricted", "banned"]


@dataclass(frozen=True, slots=True)
class ExternalIdentifier:
    entity_type: EntityType
    entity_id: str
    provider: str
    identifier_type: str
    identifier_value: str


@dataclass(frozen=True, slots=True)
class PriceObservation:
    printing_id: str
    provider: str
    currency: str
    finish: CardFinish
    amount: Decimal
    observed_at: str
    ingested_at: str
    stale_after: str | None = None


@dataclass(frozen=True, slots=True)
class NormalizedCard:
    catalog_set: CatalogSet
    oracle_card: OracleCard | None
    printing: Printing
    faces: tuple[Face, ...]
    legalities: tuple[Legality, ...]
    external_ids: tuple[ExternalIdentifier, ...]
    prices: tuple[PriceObservation, ...]


@dataclass(frozen=True, slots=True)
class NormalizedCatalog:
    cards_seen: int
    sets: tuple[CatalogSet, ...]
    oracle_cards: tuple[OracleCard, ...]
    printings: tuple[Printing, ...]
    faces: tuple[Face, ...]
    legalities: tuple[Legality, ...]
    external_ids: tuple[ExternalIdentifier, ...]
    prices: tuple[PriceObservation, ...]

    def record_counts(self) -> dict[str, int]:
        return {
            "cards_seen": self.cards_seen,
            "sets": len(self.sets),
            "oracle_cards": len(self.oracle_cards),
            "printings": len(self.printings),
            "faces": len(self.faces),
            "legalities": len(self.legalities),
            "external_ids": len(self.external_ids),
            "prices": len(self.prices),
        }


@dataclass(frozen=True, slots=True)
class NormalizedBatch:
    """One bounded, internally deduplicated staging unit."""

    cards_seen: int = 0
    sets: tuple[CatalogSet, ...] = ()
    oracle_cards: tuple[OracleCard, ...] = ()
    printings: tuple[Printing, ...] = ()
    faces: tuple[Face, ...] = ()
    legalities: tuple[Legality, ...] = ()
    external_ids: tuple[ExternalIdentifier, ...] = ()
    prices: tuple[PriceObservation, ...] = ()

    def record_counts(self) -> dict[str, int]:
        return {
            "cards_seen": self.cards_seen,
            "sets": len(self.sets),
            "oracle_cards": len(self.oracle_cards),
            "printings": len(self.printings),
            "faces": len(self.faces),
            "legalities": len(self.legalities),
            "external_ids": len(self.external_ids),
            "prices": len(self.prices),
        }
