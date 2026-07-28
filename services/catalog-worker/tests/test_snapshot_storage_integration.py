from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
import psycopg
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.database import PostgresCatalogStore
from talence_catalog.importer import run_fixture_import
from talence_catalog.integration_safety import (
    require_disposable_local_supabase_database,
)
from talence_catalog.snapshot import (
    HttpSnapshotDownloader,
    ReferenceSnapshotClient,
    SnapshotDownloadDescription,
    SnapshotPublishOutcome,
    SnapshotStorageError,
    SupabaseSnapshotStorage,
    publish_active_catalog_snapshot,
)

FIRST_OBSERVED_AT = "2026-07-27T15:00:00Z"
SECOND_OBSERVED_AT = "2026-07-27T15:01:00Z"


def _require_loopback_service(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise RuntimeError("Phase 5 Storage integration requires local loopback Supabase.")


def _signed_url(
    project_url: str,
    secret_key: str,
    bucket: str,
    storage_path: str,
) -> str:
    encoded_path = "/".join(quote(part, safe="") for part in storage_path.split("/"))
    response = httpx.post(
        f"{project_url.rstrip('/')}/storage/v1/object/sign/{bucket}/{encoded_path}",
        headers={
            "authorization": f"Bearer {secret_key}",
            "apikey": secret_key,
            "content-type": "application/json",
        },
        json={"expiresIn": 600},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    raw = payload.get("signedURL") or payload.get("signedUrl") or payload.get("signed_url")
    if not isinstance(raw, str) or not raw:
        raise RuntimeError("Local Storage returned no signed snapshot URL.")
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    if raw.startswith("/storage/v1/"):
        return f"{project_url.rstrip('/')}{raw}"
    return f"{project_url.rstrip('/')}/storage/v1/{raw.lstrip('/')}"


def _description(
    outcome: SnapshotPublishOutcome,
    signed_url: str,
) -> SnapshotDownloadDescription:
    artifact = outcome.artifact
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
        url=signed_url,
    )


@pytest.mark.integration
def test_real_local_private_storage_publication_signed_install_and_retention(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    database_url = os.environ.get("TALENCE_DATABASE_URL")
    project_url = os.environ.get("SUPABASE_URL")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not database_url or not project_url or not secret_key:
        pytest.skip(
            "TALENCE_DATABASE_URL, SUPABASE_URL, and SUPABASE_SECRET_KEY are "
            "required for local Storage integration."
        )
    require_disposable_local_supabase_database(database_url)
    _require_loopback_service(project_url)

    changed_sets = json.loads(sets_fixture_path.read_text(encoding="utf-8"))
    changed_sets[0]["name"] = "Magic 2010 Phase 5 Storage Retention"
    changed_sets_path = tmp_path / "sets-second.json"
    changed_sets_path.write_text(
        json.dumps(changed_sets, ensure_ascii=False),
        encoding="utf-8",
    )
    config = WorkerConfig.from_environment(
        {
            "TALENCE_DATABASE_URL": database_url,
            "TALENCE_CATALOG_BATCH_SIZE": "1",
            "TALENCE_SNAPSHOT_BATCH_SIZE": "1",
        }
    )

    with (
        PostgresCatalogStore.connect(database_url) as store,
        SupabaseSnapshotStorage(project_url, secret_key) as storage,
    ):
        run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=FIRST_OBSERVED_AT,
            store=store,
            config=config,
            force=True,
            now=lambda: "2026-07-27T15:00:30Z",
        )
        first = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0-alpha.1",
            source_batch_size=1,
            sqlite_batch_size=1,
        )

        run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=changed_sets_path,
            provider_observed_at=SECOND_OBSERVED_AT,
            store=store,
            config=config,
            force=True,
            now=lambda: "2026-07-27T15:01:30Z",
        )
        second = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0-alpha.1",
            source_batch_size=2,
            sqlite_batch_size=2,
        )
        replay = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0-alpha.1",
            source_batch_size=3,
            sqlite_batch_size=3,
        )

        mismatch = tmp_path / "mismatched.sqlite"
        mismatch.write_bytes(b"not the immutable catalog snapshot")
        with pytest.raises(SnapshotStorageError, match=r"does not match|exceeds"):
            storage.publish(mismatch, version=second.artifact.metadata.catalog_version)

    first_url = _signed_url(
        project_url,
        secret_key,
        "catalog-snapshots",
        first.stored.storage_path,
    )
    second_url = _signed_url(
        project_url,
        secret_key,
        "catalog-snapshots",
        second.stored.storage_path,
    )

    with psycopg.connect(database_url) as connection:
        cloud_printing_sample = tuple(
            row[0]
            for row in connection.execute(
                """
                SELECT printing.id::text
                FROM public.catalog_printings AS printing
                WHERE printing.active
                ORDER BY printing.id
                LIMIT 3
                """
            ).fetchall()
        )
        snapshot_rows = connection.execute(
            """
            SELECT
              snapshot.id::text,
              snapshot.version,
              snapshot.storage_bucket,
              snapshot.storage_path,
              state.current_robot_snapshot_id = snapshot.id
            FROM public.catalog_snapshots AS snapshot
            CROSS JOIN public.catalog_state AS state
            WHERE snapshot.id = ANY(%(snapshot_ids)s::uuid[])
            ORDER BY snapshot.version
            """,
            {
                "snapshot_ids": [
                    first.publication.snapshot_id,
                    second.publication.snapshot_id,
                ]
            },
        ).fetchall()

    with HttpSnapshotDownloader() as downloader:
        client = ReferenceSnapshotClient(tmp_path / "reference-device", downloader=downloader)
        installed_first = client.install(
            _description(first, first_url),
            cloud_printing_sample=cloud_printing_sample,
        )
        installed_second = client.install(
            _description(second, second_url),
            cloud_printing_sample=cloud_printing_sample,
        )

    anonymous = httpx.get(
        f"{project_url.rstrip('/')}/storage/v1/object/public/catalog-snapshots/"
        f"{second.stored.storage_path}",
        timeout=30,
    )

    assert first.stored.replayed in {True, False}
    assert second.stored.replayed in {True, False}
    assert replay.stored.replayed is True
    assert replay.publication.replayed is True
    assert first.artifact.metadata.catalog_version != second.artifact.metadata.catalog_version
    assert installed_first.previous_version is None
    assert installed_second.previous_version == first.artifact.metadata.catalog_version
    assert installed_second.version == second.artifact.metadata.catalog_version
    assert len(snapshot_rows) == 2
    assert all(row[2] == "catalog-snapshots" for row in snapshot_rows)
    assert all(row[3] == f"mtg/{row[1]}/catalog.sqlite" for row in snapshot_rows)
    assert sum(1 for row in snapshot_rows if row[4]) == 1
    assert (
        next(row for row in snapshot_rows if row[4])[1] == second.artifact.metadata.catalog_version
    )
    assert anonymous.status_code in {400, 401, 403, 404}
