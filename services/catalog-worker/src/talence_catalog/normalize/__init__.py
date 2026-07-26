"""Scryfall-to-Talence normalization."""

from talence_catalog.normalize.card import NormalizationError, normalize_card
from talence_catalog.normalize.catalog import iter_card_objects, normalize_catalog_file

__all__ = [
    "NormalizationError",
    "iter_card_objects",
    "normalize_card",
    "normalize_catalog_file",
]
