import sqlite3
from pathlib import Path

import pytest

from talence_catalog.snapshot import (
    LocalSnapshotStorage,
    SnapshotCounts,
    SnapshotMetadata,
    create_snapshot_shell,
    validate_snapshot,
)
from talence_catalog.versioning import build_catalog_version


def metadata() -> SnapshotMetadata:
    source_sha256 = "a" * 64
    return SnapshotMetadata(
        catalog_version=build_catalog_version(
            "2026-07-26T12:00:00Z",
            source_sha256,
            snapshot_schema_version=1,
        ),
        generated_at="2026-07-26T12:05:00Z",
        provider_observed_at="2026-07-26T12:00:00Z",
        source_sha256=source_sha256,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        counts=SnapshotCounts(0, 0, 0, 0, 0),
    )


def test_snapshot_shell_applies_canonical_schema_and_integrity_checks(
    tmp_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    artifact = create_snapshot_shell(
        tmp_path / "catalog.sqlite",
        metadata(),
        schema_path=canonical_snapshot_schema_path,
    )

    assert artifact.byte_size > 0
    assert len(artifact.sha256) == 64
    assert artifact.validation.quick_check == "ok"
    assert artifact.validation.foreign_key_failures == 0
    assert artifact.validation.user_version == 1
    assert artifact.validation.counts == SnapshotCounts(0, 0, 0, 0, 0)


def test_snapshot_metadata_count_mismatch_is_detected(
    tmp_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    artifact = create_snapshot_shell(
        tmp_path / "catalog.sqlite",
        metadata(),
        schema_path=canonical_snapshot_schema_path,
    )
    connection = sqlite3.connect(artifact.path)
    try:
        connection.execute("UPDATE snapshot_meta SET sets_count = 1")
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(ValueError, match="record counts"):
        validate_snapshot(artifact.path)


def test_local_storage_is_immutable(
    tmp_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    source = create_snapshot_shell(
        tmp_path / "source.sqlite",
        metadata(),
        schema_path=canonical_snapshot_schema_path,
    )
    storage = LocalSnapshotStorage(tmp_path / "artifacts")

    stored = storage.publish(source.path, version=metadata().catalog_version)

    assert stored.sha256 == source.sha256
    assert stored.byte_size == source.byte_size
    with pytest.raises(FileExistsError, match="Immutable snapshot"):
        storage.publish(source.path, version=metadata().catalog_version)
