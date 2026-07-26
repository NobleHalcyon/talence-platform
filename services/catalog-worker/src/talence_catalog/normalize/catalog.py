from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast

import ijson  # type: ignore[import-untyped]

from talence_catalog.models import (
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    NormalizedCatalog,
    OracleCard,
    PriceObservation,
    Printing,
)
from talence_catalog.normalize.card import NormalizationError, normalize_card


def iter_card_objects(source_path: Path) -> Iterator[dict[str, Any]]:
    """Iterate a top-level Scryfall card array without materializing the file."""

    with source_path.open("rb") as source:
        for item in ijson.items(source, "item"):
            if not isinstance(item, dict):
                raise NormalizationError("Every bulk catalog item must be an object.")
            yield cast(dict[str, Any], item)


def normalize_catalog_file(
    source_path: Path,
    *,
    observed_at: str,
    ingested_at: str,
) -> NormalizedCatalog:
    sets: dict[str, CatalogSet] = {}
    oracle_cards: dict[str, OracleCard] = {}
    printings: dict[str, Printing] = {}
    faces: dict[tuple[str, int], Face] = {}
    legalities: dict[tuple[str, str], Legality] = {}
    external_ids: dict[tuple[str, str, str], ExternalIdentifier] = {}
    prices: dict[tuple[str, str, str, str], PriceObservation] = {}
    cards_seen = 0

    for raw_card in iter_card_objects(source_path):
        normalized = normalize_card(
            raw_card,
            observed_at=observed_at,
            ingested_at=ingested_at,
        )
        cards_seen += 1
        _store_consistent(
            sets,
            normalized.catalog_set.set_id,
            normalized.catalog_set,
            "set",
        )
        if normalized.oracle_card is not None:
            _store_consistent(
                oracle_cards,
                normalized.oracle_card.oracle_card_id,
                normalized.oracle_card,
                "oracle card",
            )
        _store_consistent(
            printings,
            normalized.printing.printing_id,
            normalized.printing,
            "printing",
        )
        for face in normalized.faces:
            _store_consistent(
                faces,
                (face.printing_id, face.face_index),
                face,
                "face",
            )
        for legality in normalized.legalities:
            _store_consistent(
                legalities,
                (legality.oracle_card_id, legality.format_code),
                legality,
                "legality",
            )
        for identifier in normalized.external_ids:
            _store_consistent(
                external_ids,
                (
                    identifier.provider,
                    identifier.identifier_type,
                    identifier.identifier_value,
                ),
                identifier,
                "external identifier",
            )
        for price in normalized.prices:
            _store_consistent(
                prices,
                (
                    price.printing_id,
                    price.provider,
                    price.currency,
                    price.finish,
                ),
                price,
                "price",
            )

    if cards_seen == 0:
        raise NormalizationError("Bulk catalog must contain at least one card.")

    return NormalizedCatalog(
        cards_seen=cards_seen,
        sets=tuple(sets[key] for key in sorted(sets)),
        oracle_cards=tuple(oracle_cards[key] for key in sorted(oracle_cards)),
        printings=tuple(printings[key] for key in sorted(printings)),
        faces=tuple(faces[key] for key in sorted(faces)),
        legalities=tuple(legalities[key] for key in sorted(legalities)),
        external_ids=tuple(external_ids[key] for key in sorted(external_ids)),
        prices=tuple(prices[key] for key in sorted(prices)),
    )


def _store_consistent[Key, Record](
    destination: dict[Key, Record],
    key: Key,
    value: Record,
    label: str,
) -> None:
    existing = destination.get(key)
    if existing is not None and existing != value:
        raise NormalizationError(f"Conflicting normalized {label} identity: {key}.")
    destination[key] = value
