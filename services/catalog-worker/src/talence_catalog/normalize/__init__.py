"""Scryfall-to-Talence normalization."""

from talence_catalog.normalize.card import NormalizationError, normalize_card
from talence_catalog.normalize.catalog import (
    iter_card_objects,
    iter_normalized_card_batches,
    iter_set_batches,
    iter_set_objects,
    normalize_catalog_file,
    normalize_set_file,
)
from talence_catalog.normalize.sets import normalize_sets

__all__ = [
    "NormalizationError",
    "iter_card_objects",
    "iter_normalized_card_batches",
    "iter_set_batches",
    "iter_set_objects",
    "normalize_card",
    "normalize_catalog_file",
    "normalize_set_file",
    "normalize_sets",
]
