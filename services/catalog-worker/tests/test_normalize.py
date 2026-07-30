import gzip
import json
from decimal import Decimal
from pathlib import Path

import pytest

from talence_catalog.normalize import (
    NormalizationError,
    iter_card_objects,
    normalize_catalog_file,
    normalize_sets,
)
from talence_catalog.normalize.card import normalize_search_name

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


def test_current_gzipped_jsonl_shape_normalizes_incrementally_without_network(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    jsonl_path = tmp_path / "all_cards.jsonl.gz"
    with gzip.open(jsonl_path, "wt", encoding="utf-8", newline="\n") as destination:
        for card in cards:
            destination.write(json.dumps(card, ensure_ascii=False, separators=(",", ":")))
            destination.write("\n")

    catalog = normalize_catalog_file(
        jsonl_path,
        source_format="jsonl_gzip",
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


def test_malformed_gzipped_jsonl_fails_fast_without_echoing_payload(
    tmp_path: Path,
) -> None:
    jsonl_path = tmp_path / "malformed.jsonl.gz"
    with gzip.open(jsonl_path, "wb") as destination:
        destination.write(b'{"object":"card"}\n')
        destination.write(b'{"secret":"must-not-appear"\n')

    with pytest.raises(NormalizationError, match="line 2 is not valid UTF-8 JSON") as caught:
        list(iter_card_objects(jsonl_path, source_format="jsonl_gzip"))

    assert "must-not-appear" not in str(caught.value)


def test_search_normalization_matches_database_unicode_and_punctuation_rules() -> None:
    assert normalize_search_name("   ") == ""
    assert normalize_search_name("Æther_Gust — Test!") == "æther gust test"
    assert normalize_search_name("_____") == "symbol5f5f5f5f5f"
    assert normalize_search_name("%") == "symbol25"


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


def test_printing_specific_legalities_collapse_to_card_level_precedence(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    lightning_bolts = [
        card for card in cards if card.get("oracle_id") == "4457d7c0-f97e-4cac-93f6-0447f3a0b1f9"
    ]
    assert len(lightning_bolts) == 2
    lightning_bolts[0]["legalities"].update(
        {
            "oldschool": "legal",
            "pauper": "restricted",
            "vintage": "banned",
        }
    )
    lightning_bolts[1]["legalities"].update(
        {
            "oldschool": "not_legal",
            "pauper": "not_legal",
            "vintage": "not_legal",
        }
    )
    cards_path = tmp_path / "printing-specific-legalities.json"
    cards_path.write_text(json.dumps(cards), encoding="utf-8")

    catalog = normalize_catalog_file(
        cards_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
        sets_path=sets_fixture_path,
    )
    legalities = {
        legality.format_code: legality.legality
        for legality in catalog.legalities
        if legality.oracle_card_id == "4457d7c0-f97e-4cac-93f6-0447f3a0b1f9"
    }

    assert legalities["oldschool"] == "legal"
    assert legalities["pauper"] == "restricted"
    assert legalities["vintage"] == "banned"


def test_external_identifier_mapped_to_multiple_printings_is_omitted(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    lightning_bolts = [
        card for card in cards if card.get("oracle_id") == "4457d7c0-f97e-4cac-93f6-0447f3a0b1f9"
    ]
    assert len(lightning_bolts) == 2
    for card in lightning_bolts:
        card["tcgplayer_id"] = 999_999
    cards_path = tmp_path / "ambiguous-external-id.json"
    cards_path.write_text(json.dumps(cards), encoding="utf-8")

    catalog = normalize_catalog_file(
        cards_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
        sets_path=sets_fixture_path,
    )

    assert not any(
        identifier.provider == "tcgplayer"
        and identifier.identifier_type == "product_id"
        and identifier.identifier_value == "999999"
        for identifier in catalog.external_ids
    )
    assert any(identifier.provider == "scryfall" for identifier in catalog.external_ids)


def test_price_without_a_matching_printing_finish_remains_absent(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    target = cards[0]
    target["finishes"] = ["foil"]
    target["prices"]["tix"] = "0.42"
    cards_path = tmp_path / "foil-only-with-tix.json"
    cards_path.write_text(json.dumps(cards), encoding="utf-8")

    catalog = normalize_catalog_file(
        cards_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
        sets_path=sets_fixture_path,
    )
    target_prices = [price for price in catalog.prices if price.printing_id == target["id"]]

    assert target_prices
    assert all(price.finish == "foil" for price in target_prices)
    assert not any(price.currency == "TIX" for price in target_prices)


def test_contradictory_set_finish_exclusivity_normalizes_to_unspecified(
    sets_fixture_path: Path,
) -> None:
    raw_sets = json.loads(sets_fixture_path.read_text(encoding="utf-8"))
    raw_sets[0]["foil_only"] = True
    raw_sets[0]["nonfoil_only"] = True

    catalog_set = next(
        item for item in normalize_sets(raw_sets) if item.set_id == raw_sets[0]["id"]
    )

    assert catalog_set.foil_only is False
    assert catalog_set.nonfoil_only is False


def test_empty_bulk_source_is_rejected(tmp_path: Path) -> None:
    empty = tmp_path / "empty.json"
    empty.write_text("[]", encoding="utf-8")

    with pytest.raises(NormalizationError, match="at least one card"):
        normalize_catalog_file(
            empty,
            observed_at=OBSERVED_AT,
            ingested_at=INGESTED_AT,
        )
