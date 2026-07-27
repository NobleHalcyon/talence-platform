from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any
from uuid import UUID

from talence_catalog.models import CatalogSet
from talence_catalog.normalize.card import NormalizationError


def normalize_sets(raw_sets: Iterable[Mapping[str, Any]]) -> tuple[CatalogSet, ...]:
    """Normalize authoritative Scryfall set metadata and resolve parent set IDs."""

    materialized = tuple(raw_sets)
    code_to_id: dict[str, str] = {}
    for raw_set in materialized:
        set_id = _uuid_text(raw_set.get("id"), "set.id")
        code = _required_text(raw_set, "code").casefold()
        existing = code_to_id.get(code)
        if existing is not None and existing != set_id:
            raise NormalizationError(f"Conflicting Scryfall set code: {code}.")
        code_to_id[code] = set_id

    sets: dict[str, CatalogSet] = {}
    for raw_set in materialized:
        set_id = _uuid_text(raw_set.get("id"), "set.id")
        code = _required_text(raw_set, "code").casefold()
        parent_code = _optional_text(raw_set.get("parent_set_code"))
        parent_set_id: str | None = None
        if parent_code is not None:
            parent_set_id = code_to_id.get(parent_code.casefold())
            if parent_set_id is None:
                raise NormalizationError(
                    f"Set {code} references unknown parent set code {parent_code}."
                )

        card_count = raw_set.get("card_count")
        if card_count is not None and (
            isinstance(card_count, bool) or not isinstance(card_count, int) or card_count < 0
        ):
            raise NormalizationError("set.card_count must be a nonnegative integer or null.")

        candidate = CatalogSet(
            set_id=set_id,
            code=code,
            name=_required_text(raw_set, "name"),
            set_type=_optional_text(raw_set.get("set_type")),
            released_at=_optional_text(raw_set.get("released_at")),
            parent_set_id=parent_set_id,
            card_count=card_count,
            digital=_boolean(raw_set, "digital", default=False),
            foil_only=_boolean(raw_set, "foil_only", default=False),
            nonfoil_only=_boolean(raw_set, "nonfoil_only", default=False),
            icon_svg_uri=_optional_text(raw_set.get("icon_svg_uri")),
        )
        existing_set = sets.get(set_id)
        if existing_set is not None and existing_set != candidate:
            raise NormalizationError(f"Conflicting normalized set identity: {set_id}.")
        sets[set_id] = candidate

    if not sets:
        raise NormalizationError("Set metadata must contain at least one set.")
    return tuple(sets[set_id] for set_id in sorted(sets))


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


def _boolean(raw: Mapping[str, Any], key: str, *, default: bool) -> bool:
    value = raw.get(key, default)
    if not isinstance(value, bool):
        raise NormalizationError(f"{key} must be boolean.")
    return value
