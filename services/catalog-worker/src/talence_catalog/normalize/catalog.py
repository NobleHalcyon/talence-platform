from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from pathlib import Path
from typing import Any, cast

import ijson  # type: ignore[import-untyped]

from talence_catalog.models import (
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    NormalizedBatch,
    NormalizedCard,
    NormalizedCatalog,
    OracleCard,
    PriceObservation,
    Printing,
)
from talence_catalog.normalize.card import NormalizationError, normalize_card
from talence_catalog.normalize.sets import normalize_sets


def iter_card_objects(source_path: Path) -> Iterator[dict[str, Any]]:
    """Iterate a top-level Scryfall card array without materializing the file."""

    with source_path.open("rb") as source:
        for item in ijson.items(source, "item"):
            if not isinstance(item, dict):
                raise NormalizationError("Every bulk catalog item must be an object.")
            yield cast(dict[str, Any], item)


def iter_set_objects(source_path: Path) -> Iterator[dict[str, Any]]:
    """Iterate a top-level Scryfall set array without materializing JSON text."""

    with source_path.open("rb") as source:
        for item in ijson.items(source, "item"):
            if not isinstance(item, dict):
                raise NormalizationError("Every set metadata item must be an object.")
            yield cast(dict[str, Any], item)


def normalize_set_file(source_path: Path) -> tuple[CatalogSet, ...]:
    return normalize_sets(iter_set_objects(source_path))


def iter_set_batches(
    catalog_sets: Sequence[CatalogSet],
    *,
    batch_size: int,
) -> Iterator[NormalizedBatch]:
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero.")
    for offset in range(0, len(catalog_sets), batch_size):
        yield NormalizedBatch(sets=tuple(catalog_sets[offset : offset + batch_size]))


def iter_normalized_card_batches(
    source_path: Path,
    *,
    catalog_sets: Mapping[str, CatalogSet],
    observed_at: str,
    ingested_at: str,
    stale_after: str | None,
    batch_size: int,
) -> Iterator[NormalizedBatch]:
    """Stream cards and emit bounded, internally deduplicated staging batches."""

    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero.")

    pending: list[NormalizedCard] = []
    for raw_card in iter_card_objects(source_path):
        raw_set_id = raw_card.get("set_id")
        authoritative_set = catalog_sets.get(raw_set_id) if isinstance(raw_set_id, str) else None
        if authoritative_set is None:
            raise NormalizationError(
                f"Card references a set absent from authoritative metadata: {raw_set_id}."
            )
        pending.append(
            normalize_card(
                raw_card,
                observed_at=observed_at,
                ingested_at=ingested_at,
                stale_after=stale_after,
                catalog_set=authoritative_set,
            )
        )
        if len(pending) == batch_size:
            yield _build_batch(pending)
            pending.clear()

    if pending:
        yield _build_batch(pending)


def normalize_catalog_file(
    source_path: Path,
    *,
    observed_at: str,
    ingested_at: str,
    sets_path: Path | None = None,
    stale_after: str | None = None,
) -> NormalizedCatalog:
    authoritative_sets = (
        {catalog_set.set_id: catalog_set for catalog_set in normalize_set_file(sets_path)}
        if sets_path is not None
        else {}
    )
    sets: dict[str, CatalogSet] = dict(authoritative_sets)
    oracle_cards: dict[str, OracleCard] = {}
    printings: dict[str, Printing] = {}
    faces: dict[tuple[str, int], Face] = {}
    legalities: dict[tuple[str, str], Legality] = {}
    external_ids: dict[tuple[str, str, str], ExternalIdentifier] = {}
    prices: dict[tuple[str, str, str, str], PriceObservation] = {}
    cards_seen = 0

    for raw_card in iter_card_objects(source_path):
        raw_set_id = raw_card.get("set_id")
        catalog_set = (
            authoritative_sets.get(raw_set_id)
            if isinstance(raw_set_id, str) and authoritative_sets
            else None
        )
        if authoritative_sets and catalog_set is None:
            raise NormalizationError(
                f"Card references a set absent from authoritative metadata: {raw_set_id}."
            )
        normalized = normalize_card(
            raw_card,
            observed_at=observed_at,
            ingested_at=ingested_at,
            stale_after=stale_after,
            catalog_set=catalog_set,
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


def _build_batch(cards: Sequence[NormalizedCard]) -> NormalizedBatch:
    oracle_cards: dict[str, OracleCard] = {}
    printings: dict[str, Printing] = {}
    faces: dict[tuple[str, int], Face] = {}
    legalities: dict[tuple[str, str], Legality] = {}
    external_ids: dict[tuple[str, str, str], ExternalIdentifier] = {}
    prices: dict[tuple[str, str, str, str], PriceObservation] = {}

    for normalized in cards:
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
            _store_consistent(faces, (face.printing_id, face.face_index), face, "face")
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
                (price.printing_id, price.provider, price.currency, price.finish),
                price,
                "price",
            )

    return NormalizedBatch(
        cards_seen=len(cards),
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
