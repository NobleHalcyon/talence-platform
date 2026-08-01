from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, cast
from uuid import UUID, uuid5

from talence_catalog.models import (
    CardFinish,
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    NormalizedCard,
    OracleCard,
    PriceObservation,
    Printing,
)

FACE_NAMESPACE = UUID("2599fbc9-38df-4e34-a463-b50c40c5ec07")
ALLOWED_FINISHES = frozenset({"nonfoil", "foil", "etched"})
ALLOWED_LEGALITIES = frozenset({"legal", "not_legal", "restricted", "banned"})
DEFAULT_BROWSE_EXCLUDED_LAYOUTS = frozenset({"art_series", "emblem", "token"})
SUPERTYPES = frozenset({"Basic", "Legendary", "Ongoing", "Snow", "World", "Elite", "Host"})


class NormalizationError(ValueError):
    """Raised when provider data cannot safely enter staging."""


def normalize_search_name(value: str) -> str:
    punctuation_insensitive = "".join(
        character if character.isalnum() else " " for character in value.lower()
    )
    return " ".join(punctuation_insensitive.split())


def normalize_type_parts(
    type_line: str | None,
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Split Scryfall's canonical type line once during ingestion.

    Multi-face root type lines are unioned across their ``//`` sections. Face rows
    are normalized independently, so query semantics can match either aggregate
    Oracle identity or one eligible face without parsing in React.
    """
    supertypes: set[str] = set()
    card_types: set[str] = set()
    subtypes: set[str] = set()
    for face_type in (type_line or "").split("//"):
        left, separator, right = face_type.strip().partition(" — ")
        for word in left.split():
            (supertypes if word in SUPERTYPES else card_types).add(word)
        if separator:
            subtypes.update(right.split())
    return tuple(sorted(supertypes)), tuple(sorted(card_types)), tuple(sorted(subtypes))


def normalize_numeric_stat(value: object) -> Decimal | None:
    """Project only genuinely numeric P/T/L values; *, X, and expressions stay null."""
    text = _optional_text(value)
    if text is None:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def normalize_card(
    raw: Mapping[str, Any],
    *,
    observed_at: str,
    ingested_at: str,
    stale_after: str | None = None,
    catalog_set: CatalogSet | None = None,
) -> NormalizedCard:
    printing_id = _uuid_text(raw.get("id"), "card.id")
    set_id = _uuid_text(raw.get("set_id"), "card.set_id")
    oracle_id = (
        _uuid_text(raw.get("oracle_id"), "card.oracle_id")
        if raw.get("oracle_id") is not None
        else None
    )
    name = _required_text(raw, "name")
    digital = _boolean(raw, "digital", default=False)
    oversized = _boolean(raw, "oversized", default=False)
    layout = _optional_text(raw.get("layout"))

    card_set_code = _required_text(raw, "set").casefold()
    if catalog_set is None:
        catalog_set = CatalogSet(
            set_id=set_id,
            code=card_set_code,
            name=_required_text(raw, "set_name"),
            set_type=_optional_text(raw.get("set_type")),
            released_at=_optional_text(raw.get("released_at")),
            parent_set_id=None,
            card_count=None,
            digital=digital,
            foil_only=False,
            nonfoil_only=False,
            icon_svg_uri=None,
        )
    elif catalog_set.set_id != set_id or catalog_set.code.casefold() != card_set_code:
        raise NormalizationError(
            "Card set identity does not match authoritative Scryfall set metadata."
        )

    card_type_line = _optional_text(raw.get("type_line"))
    card_supertypes, card_types, card_subtypes = normalize_type_parts(card_type_line)
    oracle_card = (
        OracleCard(
            oracle_card_id=oracle_id,
            name=name,
            normalized_name=normalize_search_name(name),
            mana_cost=_optional_text(raw.get("mana_cost")),
            mana_value=_optional_decimal(raw.get("cmc"), "card.cmc"),
            type_line=card_type_line,
            oracle_text=_optional_text(raw.get("oracle_text")),
            colors=_string_tuple(raw.get("colors"), "card.colors"),
            color_identity=_string_tuple(
                raw.get("color_identity"),
                "card.color_identity",
            ),
            keywords=_string_tuple(raw.get("keywords"), "card.keywords"),
            reserved=_boolean(raw, "reserved", default=False),
            supertypes=card_supertypes,
            card_types=card_types,
            subtypes=card_subtypes,
        )
        if oracle_id is not None
        else None
    )

    finishes = _finishes(raw.get("finishes"))
    printing = Printing(
        printing_id=printing_id,
        oracle_card_id=oracle_id,
        set_id=set_id,
        collector_number=_required_text(raw, "collector_number"),
        language=_required_text(raw, "lang"),
        printed_name=_optional_text(raw.get("printed_name")),
        rarity=_optional_text(raw.get("rarity")),
        layout=layout,
        released_at=_optional_text(raw.get("released_at")),
        digital=digital,
        promo=_boolean(raw, "promo", default=False),
        oversized=oversized,
        variation=_boolean(raw, "variation", default=False),
        finishes=finishes,
        color_identity=_string_tuple(
            raw.get("color_identity"),
            "card.color_identity",
        ),
        frame_effects=_string_tuple(raw.get("frame_effects"), "card.frame_effects"),
        border_color=_optional_text(raw.get("border_color")),
        artist=_optional_text(raw.get("artist")),
        scryfall_uri=_optional_text(raw.get("scryfall_uri")),
        image_status=_optional_text(raw.get("image_status")),
        default_browse=(
            not digital
            and not oversized
            and (layout is None or layout not in DEFAULT_BROWSE_EXCLUDED_LAYOUTS)
        ),
        artists=_artist_names(raw),
    )

    return NormalizedCard(
        catalog_set=catalog_set,
        oracle_card=oracle_card,
        printing=printing,
        faces=_normalize_faces(raw, printing_id),
        legalities=_normalize_legalities(raw, oracle_id),
        external_ids=_normalize_external_ids(raw, printing_id, set_id, oracle_id),
        prices=_normalize_prices(
            raw,
            printing_id,
            observed_at,
            ingested_at,
            stale_after,
        ),
    )


def _normalize_faces(
    raw: Mapping[str, Any],
    printing_id: str,
) -> tuple[Face, ...]:
    raw_faces = raw.get("card_faces")
    if raw_faces is None:
        face_sources: list[Mapping[str, Any]] = [raw]
    elif isinstance(raw_faces, list) and all(isinstance(face, Mapping) for face in raw_faces):
        face_sources = list(raw_faces)
    else:
        raise NormalizationError("card.card_faces must be an array of objects.")

    faces = []
    for face_index, source in enumerate(face_sources):
        image_uris = source.get("image_uris")
        if image_uris is None:
            image_map: Mapping[str, Any] = {}
        elif isinstance(image_uris, Mapping):
            image_map = image_uris
        else:
            raise NormalizationError("face.image_uris must be an object.")

        face_id = str(
            uuid5(
                FACE_NAMESPACE,
                f"scryfall:{printing_id}:face:{face_index}",
            )
        )
        type_line = _optional_text(source.get("type_line"))
        supertypes, card_types, subtypes = normalize_type_parts(type_line)
        faces.append(
            Face(
                face_id=face_id,
                printing_id=printing_id,
                face_index=face_index,
                name=_required_text(source, "name"),
                mana_cost=_optional_text(source.get("mana_cost")),
                type_line=type_line,
                oracle_text=_optional_text(source.get("oracle_text")),
                colors=_string_tuple(source.get("colors"), "face.colors"),
                power=_optional_text(source.get("power")),
                toughness=_optional_text(source.get("toughness")),
                loyalty=_optional_text(source.get("loyalty")),
                defense=_optional_text(source.get("defense")),
                artist=_optional_text(source.get("artist")),
                image_small_uri=_optional_text(image_map.get("small")),
                image_normal_uri=_optional_text(image_map.get("normal")),
                image_large_uri=_optional_text(image_map.get("large")),
                image_png_uri=_optional_text(image_map.get("png")),
                art_crop_uri=_optional_text(image_map.get("art_crop")),
                border_crop_uri=_optional_text(image_map.get("border_crop")),
                supertypes=supertypes,
                card_types=card_types,
                subtypes=subtypes,
                power_numeric=normalize_numeric_stat(source.get("power")),
                toughness_numeric=normalize_numeric_stat(source.get("toughness")),
                loyalty_numeric=normalize_numeric_stat(source.get("loyalty")),
            )
        )

    if not faces:
        raise NormalizationError("A printing must normalize to at least one face.")
    return tuple(faces)


def _artist_names(raw: Mapping[str, Any]) -> tuple[str, ...]:
    names: set[str] = set()
    root_artist = _optional_text(raw.get("artist"))
    if root_artist:
        names.add(root_artist)
    raw_faces = raw.get("card_faces")
    if isinstance(raw_faces, list):
        for face in raw_faces:
            if isinstance(face, Mapping):
                artist = _optional_text(face.get("artist"))
                if artist:
                    names.add(artist)
    return tuple(sorted(names))


def _normalize_legalities(
    raw: Mapping[str, Any],
    oracle_id: str | None,
) -> tuple[Legality, ...]:
    if oracle_id is None:
        return ()
    raw_legalities = raw.get("legalities", {})
    if not isinstance(raw_legalities, Mapping):
        raise NormalizationError("card.legalities must be an object.")

    legalities = []
    for format_code, raw_legality in sorted(raw_legalities.items()):
        if not isinstance(format_code, str) or raw_legality not in ALLOWED_LEGALITIES:
            raise NormalizationError("card.legalities contains an unsupported value.")
        legalities.append(
            Legality(
                oracle_card_id=oracle_id,
                format_code=format_code,
                legality=cast(
                    Literal["legal", "not_legal", "restricted", "banned"],
                    raw_legality,
                ),
            )
        )
    return tuple(legalities)


def _normalize_external_ids(
    raw: Mapping[str, Any],
    printing_id: str,
    set_id: str,
    oracle_id: str | None,
) -> tuple[ExternalIdentifier, ...]:
    identifiers: dict[tuple[str, str, str], ExternalIdentifier] = {}

    def add(
        entity_type: Literal["card", "printing", "set"],
        entity_id: str,
        provider: str,
        identifier_type: str,
        value: object,
    ) -> None:
        if value is None:
            return
        identifier_value = str(value)
        key = (provider, identifier_type, identifier_value)
        candidate = ExternalIdentifier(
            entity_type=entity_type,
            entity_id=entity_id,
            provider=provider,
            identifier_type=identifier_type,
            identifier_value=identifier_value,
        )
        existing = identifiers.get(key)
        if existing is not None and existing != candidate:
            raise NormalizationError(
                f"External identifier {provider}/{identifier_type}/{identifier_value} "
                "maps to multiple entities."
            )
        identifiers[key] = candidate

    add("printing", printing_id, "scryfall", "card_id", printing_id)
    add("set", set_id, "scryfall", "set_id", set_id)
    if oracle_id is not None:
        add("card", oracle_id, "scryfall", "oracle_id", oracle_id)

    for source_key, provider, identifier_type in (
        ("arena_id", "arena", "card_id"),
        ("cardmarket_id", "cardmarket", "product_id"),
        ("mtgo_id", "mtgo", "card_id"),
        ("mtgo_foil_id", "mtgo", "foil_card_id"),
        ("tcgplayer_id", "tcgplayer", "product_id"),
        ("tcgplayer_etched_id", "tcgplayer", "etched_product_id"),
    ):
        add(
            "printing",
            printing_id,
            provider,
            identifier_type,
            raw.get(source_key),
        )

    multiverse_ids = raw.get("multiverse_ids", [])
    if not isinstance(multiverse_ids, list):
        raise NormalizationError("card.multiverse_ids must be an array.")
    for multiverse_id in multiverse_ids:
        add(
            "printing",
            printing_id,
            "wizards",
            "multiverse_id",
            multiverse_id,
        )

    return tuple(identifiers[key] for key in sorted(identifiers))


def _normalize_prices(
    raw: Mapping[str, Any],
    printing_id: str,
    observed_at: str,
    ingested_at: str,
    stale_after: str | None,
) -> tuple[PriceObservation, ...]:
    raw_prices = raw.get("prices", {})
    if not isinstance(raw_prices, Mapping):
        raise NormalizationError("card.prices must be an object.")

    mappings: tuple[tuple[str, str, CardFinish], ...] = (
        ("usd", "USD", "nonfoil"),
        ("usd_foil", "USD", "foil"),
        ("usd_etched", "USD", "etched"),
        ("eur", "EUR", "nonfoil"),
        ("eur_foil", "EUR", "foil"),
        ("tix", "TIX", "nonfoil"),
    )
    observations = []
    for source_key, currency, finish in mappings:
        raw_amount = raw_prices.get(source_key)
        if raw_amount is None:
            continue
        amount = _optional_decimal(raw_amount, f"card.prices.{source_key}")
        if amount is None or amount < 0:
            raise NormalizationError(f"card.prices.{source_key} must be nonnegative.")
        observations.append(
            PriceObservation(
                printing_id=printing_id,
                provider="scryfall",
                currency=currency,
                finish=finish,
                amount=amount,
                observed_at=observed_at,
                ingested_at=ingested_at,
                stale_after=stale_after,
            )
        )
    return tuple(observations)


def _required_text(raw: Mapping[str, Any], key: str) -> str:
    value = _optional_text(raw.get(key))
    if value is None:
        raise NormalizationError(f"{key} must be non-empty text.")
    return value


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise NormalizationError("Expected text or null.")
    stripped = value.strip()
    return stripped if stripped else None


def _uuid_text(value: object, label: str) -> str:
    if not isinstance(value, str):
        raise NormalizationError(f"{label} must be a UUID string.")
    try:
        return str(UUID(value))
    except ValueError as error:
        raise NormalizationError(f"{label} must be a UUID string.") from error


def _optional_decimal(value: object, label: str) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise NormalizationError(f"{label} must be numeric.")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise NormalizationError(f"{label} must be numeric.") from error


def _boolean(raw: Mapping[str, Any], key: str, *, default: bool) -> bool:
    value = raw.get(key, default)
    if not isinstance(value, bool):
        raise NormalizationError(f"{key} must be boolean.")
    return value


def _string_tuple(value: object, label: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise NormalizationError(f"{label} must be an array of strings.")
    return tuple(value)


def _finishes(value: object) -> tuple[CardFinish, ...]:
    raw_finishes = _string_tuple(value, "card.finishes")
    unsupported = set(raw_finishes) - ALLOWED_FINISHES
    if unsupported:
        raise NormalizationError(
            f"card.finishes contains unsupported values: {', '.join(sorted(unsupported))}."
        )
    return tuple(cast(CardFinish, finish) for finish in raw_finishes)
