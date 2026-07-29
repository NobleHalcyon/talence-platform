import pytest

from talence_catalog.versioning import (
    build_catalog_version,
    validate_catalog_version,
)


def test_catalog_version_matches_canonical_format() -> None:
    version = build_catalog_version(
        "2026-07-26T07:00:00-05:00",
        "a1b2c3d4" + ("0" * 56),
        snapshot_schema_version=1,
    )

    assert version == "mtg-20260726T120000Z-a1b2c3d4-s1"
    validate_catalog_version(version)


def test_catalog_version_rejects_invalid_hash() -> None:
    with pytest.raises(ValueError, match="64 lowercase"):
        build_catalog_version(
            "2026-07-26T12:00:00Z",
            "NOT-A-HASH",
            snapshot_schema_version=1,
        )
