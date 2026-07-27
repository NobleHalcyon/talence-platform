from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import psycopg
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.database import PostgresCatalogStore
from talence_catalog.importer import run_fixture_import
from talence_catalog.integration_safety import (
    require_disposable_local_supabase_database,
)
from talence_catalog.snapshot import (
    LocalSnapshotStorage,
    publish_active_catalog_snapshot,
    validate_snapshot,
)

OBSERVED_AT = "2026-07-26T12:00:00Z"


@pytest.mark.integration
def test_snapshot_publication_replay_and_forced_repromotion_are_byte_identical(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    database_url = os.environ.get("TALENCE_DATABASE_URL")
    if database_url is None:
        pytest.skip("TALENCE_DATABASE_URL is not configured for local integration.")
    require_disposable_local_supabase_database(database_url)
    config = WorkerConfig.from_environment(
        {
            "TALENCE_DATABASE_URL": database_url,
            "TALENCE_CATALOG_BATCH_SIZE": "1",
            "TALENCE_SNAPSHOT_BATCH_SIZE": "1",
        }
    )
    storage = LocalSnapshotStorage(tmp_path / "catalog-snapshots")

    with PostgresCatalogStore.connect(database_url) as store:
        first_import = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
            force=True,
            now=lambda: "2026-07-26T13:00:00Z",
        )
        first = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            source_batch_size=1,
            sqlite_batch_size=1,
        )
        replay = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            source_batch_size=2,
            sqlite_batch_size=2,
        )
        repromoted_import = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
            force=True,
            now=lambda: "2026-07-26T14:00:00Z",
        )
        repromoted = publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            source_batch_size=3,
            sqlite_batch_size=3,
        )

    assert first_import.promoted is True
    assert repromoted_import.promoted is True
    assert first_import.import_run_id != repromoted_import.import_run_id
    assert first_import.catalog_version == repromoted_import.catalog_version
    assert first.artifact.sha256 == replay.artifact.sha256 == repromoted.artifact.sha256
    assert first.artifact.byte_size == replay.artifact.byte_size == repromoted.artifact.byte_size
    assert replay.stored.replayed is True
    assert replay.publication.replayed is True
    assert repromoted.stored.replayed is True
    assert repromoted.publication.replayed is True
    assert (
        first.publication.snapshot_id
        == replay.publication.snapshot_id
        == repromoted.publication.snapshot_id
    )

    snapshot_path = first.stored.path
    assert snapshot_path is not None
    validation = validate_snapshot(snapshot_path)
    assert validation.quick_check == "ok"
    assert validation.foreign_key_failures == 0

    with psycopg.connect(database_url) as connection:
        database_row = connection.execute(
            """
            SELECT
              snapshot.version,
              snapshot.schema_version,
              snapshot.status::text,
              snapshot.storage_bucket,
              snapshot.storage_path,
              snapshot.sha256,
              snapshot.byte_size,
              snapshot.record_counts,
              snapshot.minimum_client_version,
              snapshot.api_contract_version,
              snapshot.source_sha256,
              state.current_robot_snapshot_id = snapshot.id
            FROM public.catalog_snapshots AS snapshot
            JOIN public.catalog_state AS state ON state.singleton_id = 1
            WHERE snapshot.id = %(snapshot_id)s::uuid
            """,
            {"snapshot_id": first.publication.snapshot_id},
        ).fetchone()
        cloud_printing_ids = tuple(
            row[0]
            for row in connection.execute(
                """
                SELECT printing.id::text
                FROM public.catalog_printings AS printing
                JOIN public.games AS game ON game.id = printing.game_id
                WHERE printing.active
                  AND game.code = 'mtg'
                  AND game.active
                ORDER BY printing.id
                LIMIT 3
                """
            ).fetchall()
        )

    snapshot = sqlite3.connect(f"file:{snapshot_path.resolve()}?mode=ro", uri=True)
    try:
        edge_printing_ids = tuple(
            row[0]
            for row in snapshot.execute(
                """
                SELECT printing_id
                FROM printings
                ORDER BY printing_id
                LIMIT 3
                """
            ).fetchall()
        )
        snapshot_meta = snapshot.execute(
            """
            SELECT catalog_version, source_sha256
            FROM snapshot_meta
            """
        ).fetchone()
    finally:
        snapshot.close()

    assert database_row is not None
    assert database_row == (
        first.artifact.metadata.catalog_version,
        1,
        "succeeded",
        "catalog-snapshots",
        first.stored.storage_path,
        first.artifact.sha256,
        first.artifact.byte_size,
        {
            "sets": validation.counts.sets,
            "oracle_cards": validation.counts.oracle_cards,
            "printings": validation.counts.printings,
            "faces": validation.counts.faces,
            "prices": validation.counts.prices,
        },
        "0.1.0",
        "v1",
        first_import.source_bundle_sha256,
        True,
    )
    assert snapshot_meta == (
        first.artifact.metadata.catalog_version,
        first_import.source_bundle_sha256,
    )
    assert edge_printing_ids == cloud_printing_ids
