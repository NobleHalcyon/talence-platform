import json
from decimal import Decimal
from pathlib import Path

import pytest

from talence_catalog.normalize import NormalizationError, normalize_catalog_file
from talence_catalog.normalize.card import (
    normalize_numeric_stat,
    normalize_search_name,
    normalize_type_parts,
)

OBSERVED_AT = "2026-07-26T12:00:00Z"
INGESTED_AT = "2026-07-26T12:05:00Z"


def test_representative_fixture_normalizes_without_network(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    catalog = normalize_catalog_file(
        cards_fixture_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
        sets_path=sets_fixture_path,
        stale_after="2026-07-28T00:00:00Z",
    )

    assert catalog.record_counts() == {
        "cards_seen": 4,
        "sets": 3,
        "oracle_cards": 2,
        "printings": 4,
        "faces": 5,
        "legalities": 6,
        "external_ids": 14,
        "prices": 7,
    }
    magic_2010 = next(catalog_set for catalog_set in catalog.sets if catalog_set.code == "m10")
    assert magic_2010.card_count == 249
    assert magic_2010.icon_svg_uri == "https://svgs.scryfall.io/sets/m10.svg"

    japanese = next(printing for printing in catalog.printings if printing.language == "ja")
    assert japanese.printed_name == "稲妻"

    transform_faces = [
        face for face in catalog.faces if face.printing_id == "b2c6aa39-2d2a-4d8e-a051-6eb9e7c58d78"
    ]
    assert [face.face_index for face in transform_faces] == [0, 1]
    assert [face.name for face in transform_faces] == [
        "Delver of Secrets",
        "Insectile Aberration",
    ]
    assert transform_faces[0].card_types == ("Creature",)
    assert transform_faces[0].subtypes == ("Human", "Wizard")
    assert transform_faces[0].power_numeric == Decimal("1")
    transform_printing = next(
        printing
        for printing in catalog.printings
        if printing.printing_id == transform_faces[0].printing_id
    )
    assert transform_printing.artists == ("Nils Hamm",)

    token = next(
        printing
        for printing in catalog.printings
        if printing.printing_id == "78b13296-28d0-4186-b0d8-65a3db74651e"
    )
    assert token.oracle_card_id is None
    assert token.color_identity == ("B", "R")
    assert token.default_browse is False
    assert all(price.printing_id != token.printing_id for price in catalog.prices)

    foil_bolt = next(
        price
        for price in catalog.prices
        if price.printing_id == "e6a1f7d6-5f5b-4f1e-8cc3-8bf2962a8ac7" and price.finish == "foil"
    )
    assert foil_bolt.amount == Decimal("4.00")
    assert foil_bolt.observed_at == OBSERVED_AT
    assert foil_bolt.stale_after == "2026-07-28T00:00:00Z"


def test_search_normalization_matches_database_unicode_and_punctuation_rules() -> None:
    assert normalize_search_name("Æther_Gust — Test!") == "æther gust test"


def test_type_and_variable_stat_normalization_is_deterministic() -> None:
    assert normalize_type_parts(
        "Legendary Snow Creature — Human Wizard // Artifact Creature — Golem"
    ) == (
        ("Legendary", "Snow"),
        ("Artifact", "Creature"),
        ("Golem", "Human", "Wizard"),
    )
    assert normalize_numeric_stat("-1.5") == Decimal("-1.5")
    assert normalize_numeric_stat("*") is None
    assert normalize_numeric_stat("1+*") is None
    assert normalize_numeric_stat("X") is None


def test_conflicting_oracle_identity_is_rejected(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    cards[1]["name"] = "Conflicting Canonical Name"
    conflicting = tmp_path / "conflicting.json"
    conflicting.write_text(json.dumps(cards), encoding="utf-8")

    with pytest.raises(NormalizationError, match="Conflicting normalized oracle card"):
        normalize_catalog_file(
            conflicting,
            observed_at=OBSERVED_AT,
            ingested_at=INGESTED_AT,
            sets_path=sets_fixture_path,
        )


def test_empty_bulk_source_is_rejected(tmp_path: Path) -> None:
    empty = tmp_path / "empty.json"
    empty.write_text("[]", encoding="utf-8")

    with pytest.raises(NormalizationError, match="at least one card"):
        normalize_catalog_file(
            empty,
            observed_at=OBSERVED_AT,
            ingested_at=INGESTED_AT,
        )
