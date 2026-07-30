from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import cast
from uuid import uuid4

import psycopg
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.database import PostgresCatalogStore
from talence_catalog.download import DownloadResult
from talence_catalog.importer import (
    CatalogImportError,
    run_fixture_import,
    run_live_import,
)
from talence_catalog.integration_safety import (
    require_disposable_local_supabase_database,
)
from talence_catalog.provider.scryfall import BulkDataDescriptor, ScryfallProvider

OBSERVED_AT = "2026-07-26T12:00:00Z"


@dataclass
class NeverDownloadProvider:
    descriptor: BulkDataDescriptor
    raw_sets: tuple[dict[str, object], ...]
    download_calls: int = 0

    def discover_all_cards(self) -> BulkDataDescriptor:
        return self.descriptor

    def fetch_sets(self) -> tuple[dict[str, object], ...]:
        return self.raw_sets

    def download_bulk(
        self,
        descriptor: BulkDataDescriptor,
        destination: Path,
    ) -> DownloadResult:
        del descriptor, destination
        self.download_calls += 1
        raise AssertionError("An unchanged queued import must not download bulk data.")


@pytest.mark.integration
def test_real_fixture_promotion_replay_and_failure_preservation(
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
        }
    )

    with PostgresCatalogStore.connect(database_url) as store:
        promoted = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
            force=True,
        )
        replay = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
        )
        changed_sets = json.loads(sets_fixture_path.read_text(encoding="utf-8"))
        changed_sets[0]["name"] = "Magic 2010 Integration Update"
        changed_sets_path = tmp_path / "sets-changed.json"
        changed_sets_path.write_text(
            json.dumps(changed_sets, ensure_ascii=False),
            encoding="utf-8",
        )
        changed_dependency = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=changed_sets_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
        )
        reactivated_original = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
            force=True,
        )
        reactivated_dependency = run_fixture_import(
            cards_path=cards_fixture_path,
            sets_path=changed_sets_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=config,
        )
        active_before_failure = store.status()["active_catalog_version"]

        with pytest.raises(CatalogImportError, match="price_invalid"):
            run_fixture_import(
                cards_path=cards_fixture_path,
                sets_path=sets_fixture_path,
                provider_observed_at="2026-07-26T12:01:00Z",
                store=store,
                config=config,
                force=True,
                now=lambda: "2026-07-25T12:00:00Z",
            )
        active_after_failure = store.status()["active_catalog_version"]

        queued_import_id = str(uuid4())
        live_provider_object_id = f"integration-queued-noop-{queued_import_id}"
        with psycopg.connect(database_url) as connection:
            active_source = connection.execute(
                """
                UPDATE public.catalog_source_files AS source_file
                SET
                  source_type = 'all_cards',
                  provider_object_id = %(provider_object_id)s,
                  download_uri = 'https://data.scryfall.io/all-cards.json'
                FROM public.catalog_state AS state,
                     public.catalog_import_runs AS import_run
                WHERE state.singleton_id = 1
                  AND import_run.id = state.active_import_id
                  AND source_file.id = import_run.source_file_id
                RETURNING
                  source_file.provider_object_id,
                  to_char(
                    source_file.provider_updated_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                  ),
                  source_file.compressed_size,
                  source_file.dependency_sha256
                """,
                {"provider_object_id": live_provider_object_id},
            ).fetchone()
            connection.execute(
                """
                INSERT INTO public.catalog_import_runs (
                  id,
                  trigger_type,
                  requested_force
                )
                VALUES (%(queued_import_id)s::uuid, 'manual', false)
                """,
                {"queued_import_id": queued_import_id},
            )
        assert active_source is not None
        provider = NeverDownloadProvider(
            descriptor=BulkDataDescriptor(
                provider_object_id=active_source[0],
                source_type="all_cards",
                updated_at=active_source[1],
                download_uri="https://data.scryfall.io/all-cards.json",
                content_type="application/json",
                content_encoding=None,
                compressed_size=active_source[2],
                dependency_sha256=active_source[3],
            ),
            raw_sets=tuple(cast(list[dict[str, object]], changed_sets)),
        )
        queued_noop = run_live_import(
            provider=cast(ScryfallProvider, provider),
            store=store,
            config=config,
            queued_import_id=queued_import_id,
            trigger_type="manual",
        )
        queued_replay = run_live_import(
            provider=cast(ScryfallProvider, provider),
            store=store,
            config=config,
            queued_import_id=queued_import_id,
            trigger_type="manual",
        )
        replay_completion = store.complete_queued_noop(
            queued_import_id,
            descriptor=provider.descriptor,
            worker_version="0.2.0",
        )

        active_before_switch = store.status()["active_catalog_version"]
        original_heartbeat = store.heartbeat_import
        kill_switch_tripped = False

        def heartbeat_with_disabled_sync(import_run_id: str) -> None:
            nonlocal kill_switch_tripped
            if not kill_switch_tripped:
                with psycopg.connect(database_url) as connection:
                    connection.execute(
                        """
                        UPDATE public.catalog_state
                        SET sync_enabled = false
                        WHERE singleton_id = 1
                        """
                    )
                kill_switch_tripped = True
            original_heartbeat(import_run_id)

        store.heartbeat_import = heartbeat_with_disabled_sync
        try:
            with pytest.raises(CatalogImportError) as sync_failure:
                run_fixture_import(
                    cards_path=cards_fixture_path,
                    sets_path=sets_fixture_path,
                    provider_observed_at="2026-07-26T12:02:00Z",
                    store=store,
                    config=config,
                    force=True,
                )
        finally:
            store.heartbeat_import = original_heartbeat
            with psycopg.connect(database_url) as connection:
                connection.execute(
                    """
                    UPDATE public.catalog_state
                    SET sync_enabled = true
                    WHERE singleton_id = 1
                    """
                )
        active_after_switch = store.status()["active_catalog_version"]

    assert promoted.promoted is True
    assert replay.status == "unchanged"
    assert replay.promoted is False
    assert replay.catalog_version == promoted.catalog_version
    assert changed_dependency.promoted is True
    assert changed_dependency.catalog_version != promoted.catalog_version
    assert changed_dependency.source_sha256 == promoted.source_sha256
    assert changed_dependency.source_bundle_sha256 != promoted.source_bundle_sha256
    assert reactivated_original.promoted is True
    assert reactivated_original.catalog_version == promoted.catalog_version
    assert reactivated_dependency.promoted is True
    assert reactivated_dependency.catalog_version == changed_dependency.catalog_version
    assert active_after_failure == active_before_failure == reactivated_dependency.catalog_version
    assert provider.download_calls == 0
    assert queued_noop.status == queued_replay.status == "unchanged"
    assert queued_noop.import_run_id == queued_replay.import_run_id == queued_import_id
    assert queued_noop.catalog_version == queued_replay.catalog_version
    assert replay_completion.status == "succeeded"
    assert replay_completion.noop is True
    assert replay_completion.replayed is True
    assert sync_failure.value.error_code == "sync_disabled"
    assert active_after_switch == active_before_switch

    with psycopg.connect(database_url) as connection:
        unicode_row = connection.execute(
            """
            SELECT printed_name
            FROM public.catalog_printings
            WHERE id = 'a71ed8c7-bb7c-4818-b6df-b3e214586847'::uuid
            """
        ).fetchone()
        token_price_count = connection.execute(
            """
            SELECT count(*)
            FROM public.current_prices
            WHERE printing_id = '78b13296-28d0-4186-b0d8-65a3db74651e'::uuid
            """
        ).fetchone()
        token_color_identity = connection.execute(
            """
            SELECT color_identity
            FROM public.catalog_printings
            WHERE id = '78b13296-28d0-4186-b0d8-65a3db74651e'::uuid
            """
        ).fetchone()
        freshness_row = connection.execute(
            """
            SELECT stale_after - observed_at
            FROM public.current_prices
            WHERE printing_id = 'e6a1f7d6-5f5b-4f1e-8cc3-8bf2962a8ac7'::uuid
              AND currency = 'USD'
              AND finish = 'nonfoil'::public.card_finish
            """
        ).fetchone()
        failed_run = connection.execute(
            """
            SELECT error_code
            FROM public.catalog_import_runs
            WHERE status = 'failed'::public.job_status
              AND error_code = 'validation_failed'
            ORDER BY completed_at DESC
            LIMIT 1
            """
        ).fetchone()
        queued_row = connection.execute(
            """
            SELECT
              status::text,
              started_at,
              validation_summary ->> 'noop',
              worker_version
            FROM public.catalog_import_runs
            WHERE id = %(queued_import_id)s::uuid
            """,
            {"queued_import_id": queued_import_id},
        ).fetchone()
        sync_failed_run = connection.execute(
            """
            SELECT error_code
            FROM public.catalog_import_runs
            WHERE status = 'failed'::public.job_status
              AND error_code = 'sync_disabled'
            ORDER BY completed_at DESC
            LIMIT 1
            """
        ).fetchone()

    assert unicode_row == ("稲妻",)
    assert token_price_count == (0,)
    assert token_color_identity == (["B", "R"],)
    assert freshness_row is not None
    assert freshness_row[0].total_seconds() == 36 * 60 * 60
    assert failed_run == ("validation_failed",)
    assert queued_row == ("succeeded", None, "true", "0.2.0")
    assert sync_failed_run == ("sync_disabled",)


@pytest.mark.integration
def test_cross_batch_legality_and_external_id_reconciliation(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    database_url = os.environ.get("TALENCE_DATABASE_URL")
    if database_url is None:
        pytest.skip("TALENCE_DATABASE_URL is not configured for local integration.")
    require_disposable_local_supabase_database(database_url)
    cards = json.loads(cards_fixture_path.read_text(encoding="utf-8"))
    lightning_bolts = [
        card for card in cards if card.get("oracle_id") == "4457d7c0-f97e-4cac-93f6-0447f3a0b1f9"
    ]
    assert len(lightning_bolts) == 2
    lightning_bolts[0]["legalities"]["oldschool"] = "legal"
    lightning_bolts[1]["legalities"]["oldschool"] = "not_legal"
    lightning_bolts[0]["tcgplayer_id"] = 999_999
    lightning_bolts[1].pop("tcgplayer_id", None)
    unique_path = tmp_path / "unique-external-id.json"
    unique_path.write_text(json.dumps(cards), encoding="utf-8")
    config = WorkerConfig.from_environment(
        {
            "TALENCE_DATABASE_URL": database_url,
            "TALENCE_CATALOG_BATCH_SIZE": "1",
        }
    )

    with PostgresCatalogStore.connect(database_url) as store:
        unique_outcome = run_fixture_import(
            cards_path=unique_path,
            sets_path=sets_fixture_path,
            provider_observed_at="2026-07-26T12:03:00Z",
            store=store,
            config=config,
            force=True,
        )

    with psycopg.connect(database_url) as connection:
        unique_mapping = connection.execute(
            """
            SELECT entity_id::text
            FROM public.catalog_external_ids
            WHERE provider = 'tcgplayer'
              AND identifier_type = 'product_id'
              AND identifier_value = '999999'
            """
        ).fetchone()

    lightning_bolts[1]["tcgplayer_id"] = 999_999
    ambiguous_path = tmp_path / "ambiguous-external-id.json"
    ambiguous_path.write_text(json.dumps(cards), encoding="utf-8")
    with PostgresCatalogStore.connect(database_url) as store:
        ambiguous_outcome = run_fixture_import(
            cards_path=ambiguous_path,
            sets_path=sets_fixture_path,
            provider_observed_at="2026-07-26T12:04:00Z",
            store=store,
            config=config,
            force=True,
        )

    with psycopg.connect(database_url) as connection:
        oldschool = connection.execute(
            """
            SELECT legality
            FROM public.catalog_legalities
            WHERE card_id = '4457d7c0-f97e-4cac-93f6-0447f3a0b1f9'::uuid
              AND format_code = 'oldschool'
            """
        ).fetchone()
        ambiguous_mapping = connection.execute(
            """
            SELECT entity_id
            FROM public.catalog_external_ids
            WHERE provider = 'tcgplayer'
              AND identifier_type = 'product_id'
              AND identifier_value = '999999'
            """
        ).fetchone()

    assert unique_outcome.promoted is True
    assert unique_mapping == ("e6a1f7d6-5f5b-4f1e-8cc3-8bf2962a8ac7",)
    assert ambiguous_outcome.promoted is True
    assert ambiguous_outcome.record_counts["ambiguous_external_ids_omitted"] == 1
    assert ambiguous_mapping is None
    assert oldschool == ("legal",)
