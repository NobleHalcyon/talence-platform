from __future__ import annotations

import sqlite3
from dataclasses import dataclass, replace
from pathlib import Path

import httpx
import pytest

from talence_catalog.normalize.catalog import normalize_catalog_file
from talence_catalog.snapshot import (
    CatalogGenerationIdentity,
    HttpSnapshotDownloader,
    InMemoryCatalogGeneration,
    LocalFileSnapshotDownloader,
    ReferenceSnapshotClient,
    SnapshotArtifact,
    SnapshotDownloadDescription,
    SnapshotDownloadError,
    create_catalog_snapshot,
)
from talence_catalog.snapshot.schema import snapshot_digest
from talence_catalog.versioning import build_catalog_version

OBSERVED_AT = "2026-07-26T12:00:00Z"
DOWNLOADED_AT = "2026-07-26T12:04:00Z"
INGESTED_AT = "2026-07-26T12:05:00Z"


def _build_snapshot(
    output_path: Path,
    cards_path: Path,
    sets_path: Path,
    schema_path: Path,
    *,
    identity_sha256: str,
) -> tuple[SnapshotArtifact, tuple[str, ...]]:
    catalog = normalize_catalog_file(
        cards_path,
        sets_path=sets_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
    )
    generation = InMemoryCatalogGeneration(
        identity=CatalogGenerationIdentity(
            active_import_id=f"{identity_sha256[0] * 8}-0000-4000-8000-000000000001",
            catalog_version=build_catalog_version(
                OBSERVED_AT,
                identity_sha256,
                snapshot_schema_version=1,
            ),
            provider_observed_at=OBSERVED_AT,
            catalog_identity_sha256=identity_sha256,
            source_downloaded_at=DOWNLOADED_AT,
            catalog_ingested_at=INGESTED_AT,
        ),
        sets=catalog.sets,
        oracle_cards=catalog.oracle_cards,
        printings=catalog.printings,
        faces=catalog.faces,
        legalities=catalog.legalities,
        prices=catalog.prices,
        external_ids=catalog.external_ids,
    )
    artifact = create_catalog_snapshot(
        output_path,
        generation,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=schema_path,
    )
    return artifact, tuple(printing.printing_id for printing in catalog.printings[:3])


def _description(artifact: SnapshotArtifact) -> SnapshotDownloadDescription:
    return SnapshotDownloadDescription(
        version=artifact.metadata.catalog_version,
        snapshot_schema_version=1,
        game_code="mtg",
        generated_at=artifact.metadata.generated_at,
        provider_observed_at=artifact.metadata.provider_observed_at,
        sha256=artifact.sha256,
        byte_size=artifact.byte_size,
        record_counts=artifact.validation.counts,
        minimum_client_version=artifact.metadata.minimum_client_version,
        url=artifact.path.as_uri(),
    )


@dataclass
class FlakyLocalDownloader:
    failures_remaining: int
    calls: int = 0

    def download(
        self,
        url: str,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None:
        self.calls += 1
        if self.failures_remaining:
            self.failures_remaining -= 1
            raise SnapshotDownloadError("simulated transient download failure")
        LocalFileSnapshotDownloader().download(
            url,
            destination,
            maximum_bytes=maximum_bytes,
        )


def test_reference_client_retries_then_keeps_current_and_previous_snapshots(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    first, cloud_sample = _build_snapshot(
        tmp_path / "source-first.sqlite",
        cards_fixture_path,
        sets_fixture_path,
        canonical_snapshot_schema_path,
        identity_sha256="a" * 64,
    )
    second, _ = _build_snapshot(
        tmp_path / "source-second.sqlite",
        cards_fixture_path,
        sets_fixture_path,
        canonical_snapshot_schema_path,
        identity_sha256="b" * 64,
    )
    downloader = FlakyLocalDownloader(failures_remaining=1)
    client = ReferenceSnapshotClient(
        tmp_path / "device",
        downloader=downloader,
        maximum_attempts=2,
    )

    installed_first = client.install(
        _description(first),
        cloud_printing_sample=cloud_sample,
    )
    # Recreate the client to prove pointer state survives a process restart.
    restarted_client = ReferenceSnapshotClient(
        tmp_path / "device",
        downloader=downloader,
        maximum_attempts=2,
    )
    installed_second = restarted_client.install(
        _description(second),
        cloud_printing_sample=cloud_sample,
    )
    replayed_second = restarted_client.install(
        _description(second),
        cloud_printing_sample=cloud_sample,
    )

    assert downloader.calls == 4
    assert installed_first.previous_version is None
    assert installed_second.previous_version == first.metadata.catalog_version
    assert replayed_second.replayed is True
    assert replayed_second.previous_version == first.metadata.catalog_version
    assert installed_first.path.is_file()
    assert installed_second.path.is_file()
    assert installed_first.path != installed_second.path
    assert '"version":"' + second.metadata.catalog_version + '"' in (
        tmp_path / "device" / "current.json"
    ).read_text(encoding="utf-8")
    assert '"version":"' + first.metadata.catalog_version + '"' in (
        tmp_path / "device" / "previous.json"
    ).read_text(encoding="utf-8")


def test_reference_client_preserves_pointers_after_integrity_or_cloud_sample_failure(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    artifact, cloud_sample = _build_snapshot(
        tmp_path / "source.sqlite",
        cards_fixture_path,
        sets_fixture_path,
        canonical_snapshot_schema_path,
        identity_sha256="c" * 64,
    )
    root = tmp_path / "device"
    client = ReferenceSnapshotClient(
        root,
        downloader=LocalFileSnapshotDownloader(),
        maximum_attempts=2,
    )
    client.install(_description(artifact), cloud_printing_sample=cloud_sample)
    current_before = (root / "current.json").read_bytes()

    invalid = tmp_path / "invalid.sqlite"
    invalid.write_bytes(artifact.path.read_bytes())
    connection = sqlite3.connect(invalid)
    try:
        connection.execute("UPDATE snapshot_meta SET prices_count = prices_count + 1")
        connection.commit()
    finally:
        connection.close()
    invalid_size, invalid_sha256 = snapshot_digest(invalid)
    invalid_description = replace(
        _description(artifact),
        sha256=invalid_sha256,
        byte_size=invalid_size,
        url=invalid.as_uri(),
    )

    with pytest.raises(SnapshotDownloadError, match="bounded retries"):
        client.install(invalid_description, cloud_printing_sample=cloud_sample)

    corrupt = tmp_path / "corrupt.sqlite"
    corrupt.write_bytes(b"not a SQLite database")
    corrupt_size, corrupt_sha256 = snapshot_digest(corrupt)
    corrupt_description = replace(
        _description(artifact),
        sha256=corrupt_sha256,
        byte_size=corrupt_size,
        url=corrupt.as_uri(),
    )
    with pytest.raises(SnapshotDownloadError, match="bounded retries"):
        client.install(corrupt_description, cloud_printing_sample=cloud_sample)

    mismatched_manifest = replace(
        _description(artifact),
        record_counts=replace(
            artifact.validation.counts,
            sets=artifact.validation.counts.sets + 1,
        ),
    )
    with pytest.raises(SnapshotDownloadError, match="bounded retries"):
        client.install(mismatched_manifest, cloud_printing_sample=cloud_sample)

    with pytest.raises(SnapshotDownloadError, match="bounded retries"):
        client.install(
            _description(artifact),
            cloud_printing_sample=("00000000-0000-4000-8000-000000000000",),
        )

    assert (root / "current.json").read_bytes() == current_before
    assert not (root / "previous.json").exists()


def test_http_reference_downloader_enforces_streamed_size_guard(tmp_path: Path) -> None:
    destination = tmp_path / "download.sqlite"
    downloader = HttpSnapshotDownloader(
        client=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"too many bytes"))
        )
    )

    with pytest.raises(SnapshotDownloadError, match="size guard"):
        downloader.download(
            "https://downloads.example.test/catalog.sqlite",
            destination,
            maximum_bytes=2,
        )

    assert not destination.exists()
