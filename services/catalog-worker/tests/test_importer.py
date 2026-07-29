from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import cast

import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.download import DownloadEmptyError, DownloadResult
from talence_catalog.importer import (
    CatalogImportError,
    ImportOutcome,
    catalog_sets_sha256,
    run_fixture_import,
    run_live_import,
    unchanged_outcome,
)
from talence_catalog.models import NormalizedBatch
from talence_catalog.normalize import normalize_sets
from talence_catalog.provider.scryfall import (
    BulkDataDescriptor,
    ProviderUnavailableError,
    ScryfallProvider,
)
from talence_catalog.store import (
    CatalogStoreError,
    CatalogSyncDisabledError,
    CatalogValidationError,
    ImportRegistration,
    ImportValidation,
    PromotionResult,
    QueuedNoopCompletion,
    SourceFileRegistration,
)

OBSERVED_AT = "2026-07-26T12:00:00Z"
INGESTED_AT = "2026-07-26T12:05:00Z"


@dataclass
class MemoryCatalogStore:
    active_catalog_version: str | None = None
    active_source: tuple[str, str, str | None] | None = None
    fail_registration: bool = False
    fail_validation: bool = False
    fail_promotion: bool = False
    fail_failure_recording: bool = False
    rejected_records: int = 0
    sync_disabled_stage: str | None = None
    batches: list[NormalizedBatch] = field(default_factory=list)
    failed: list[tuple[str, str]] = field(default_factory=list)
    queued_failed: list[tuple[str, str, str]] = field(default_factory=list)
    heartbeats: list[str] = field(default_factory=list)
    register_calls: int = 0
    begin_calls: int = 0
    promote_calls: int = 0
    current_descriptor: BulkDataDescriptor | None = None
    queued_noop_calls: list[QueuedNoopCompletion] = field(default_factory=list)
    queued_force_ids: set[str] = field(default_factory=set)

    def source_is_unchanged(self, descriptor: BulkDataDescriptor) -> bool:
        return self.active_source == (
            descriptor.provider_object_id,
            descriptor.updated_at,
            descriptor.dependency_sha256,
        )

    def complete_queued_noop(
        self,
        queued_import_id: str,
        *,
        descriptor: BulkDataDescriptor,
        worker_version: str,
    ) -> QueuedNoopCompletion:
        assert worker_version == "0.2.0"
        if queued_import_id in self.queued_force_ids:
            completion = QueuedNoopCompletion(
                import_run_id=queued_import_id,
                status="queued",
                noop=False,
                catalog_version=self.active_catalog_version,
                active_import_id="active-run",
                replayed=False,
            )
        else:
            assert self.source_is_unchanged(descriptor)
            completion = QueuedNoopCompletion(
                import_run_id=queued_import_id,
                status="succeeded",
                noop=True,
                catalog_version=self.active_catalog_version,
                active_import_id="active-run",
                replayed=any(
                    call.import_run_id == queued_import_id and call.noop
                    for call in self.queued_noop_calls
                ),
            )
        self.queued_noop_calls.append(completion)
        return completion

    def register_source_file(
        self,
        descriptor: BulkDataDescriptor,
        download: DownloadResult,
        *,
        downloaded_at: str,
    ) -> SourceFileRegistration:
        assert download.byte_size > 0
        assert downloaded_at == INGESTED_AT
        if self.fail_registration:
            raise CatalogStoreError("fixture registration failed")
        self.register_calls += 1
        self.current_descriptor = descriptor
        return SourceFileRegistration(source_file_id=f"source-{self.register_calls}")

    def begin_import(
        self,
        source_file_id: str,
        *,
        trigger_type: str,
        worker_version: str,
        force: bool,
        queued_import_id: str | None,
    ) -> ImportRegistration:
        assert source_file_id.startswith("source-")
        assert trigger_type == "fixture"
        assert worker_version == "0.2.0"
        self.begin_calls += 1
        return ImportRegistration(
            import_run_id=queued_import_id or f"run-{self.begin_calls}",
        )

    def stage_batch(self, import_run_id: str, batch: NormalizedBatch) -> None:
        assert import_run_id
        self.batches.append(batch)

    def heartbeat_import(self, import_run_id: str) -> None:
        assert import_run_id
        if self.sync_disabled_stage == "heartbeat":
            raise CatalogSyncDisabledError("fixture sync switch disabled")
        self.heartbeats.append(import_run_id)

    def validate_import(self, import_run_id: str) -> ImportValidation:
        assert import_run_id
        if self.fail_validation:
            raise CatalogValidationError("fixture validation failed")
        return ImportValidation(
            counts=self._counts(),
            records_rejected=self.rejected_records,
        )

    def promote_import(
        self,
        import_run_id: str,
        *,
        catalog_version: str,
    ) -> PromotionResult:
        self.promote_calls += 1
        if self.sync_disabled_stage == "promotion":
            raise CatalogSyncDisabledError("fixture sync switch disabled")
        if self.fail_promotion:
            raise CatalogStoreError("fixture promotion failed")
        self.active_catalog_version = catalog_version
        assert self.current_descriptor is not None
        self.active_source = (
            self.current_descriptor.provider_object_id,
            self.current_descriptor.updated_at,
            self.current_descriptor.dependency_sha256,
        )
        return PromotionResult(
            active_import_id=import_run_id,
            catalog_version=catalog_version,
            counts=self._counts(),
        )

    def mark_import_failed(
        self,
        *,
        source_file_id: str | None,
        import_run_id: str | None,
        error_code: str,
        error_summary: str,
    ) -> None:
        if self.fail_failure_recording:
            raise CatalogStoreError("fixture failure recording failed")
        assert source_file_id is not None
        self.failed.append((error_code, error_summary))

    def mark_queued_import_failed(
        self,
        queued_import_id: str,
        *,
        error_code: str,
        error_summary: str,
    ) -> None:
        if self.fail_failure_recording:
            raise CatalogStoreError("fixture queued failure recording failed")
        self.queued_failed.append((queued_import_id, error_code, error_summary))

    def status(self) -> Mapping[str, object]:
        return {"active_catalog_version": self.active_catalog_version}

    def _counts(self) -> dict[str, int]:
        unique_sets = {record.set_id for batch in self.batches for record in batch.sets}
        unique_cards = {
            record.oracle_card_id for batch in self.batches for record in batch.oracle_cards
        }
        unique_printings = {
            record.printing_id for batch in self.batches for record in batch.printings
        }
        unique_faces = {record.face_id for batch in self.batches for record in batch.faces}
        unique_prices = {
            (record.printing_id, record.currency, record.finish)
            for batch in self.batches
            for record in batch.prices
        }
        return {
            "sets": len(unique_sets),
            "cards": len(unique_cards),
            "printings": len(unique_printings),
            "faces": len(unique_faces),
            "prices": len(unique_prices),
        }


@dataclass
class FailingLiveProvider:
    failure_stage: str
    raw_sets: tuple[dict[str, object], ...] = ()
    download_calls: int = 0

    def discover_all_cards(self) -> BulkDataDescriptor:
        if self.failure_stage == "discovery":
            raise ProviderUnavailableError("fixture provider discovery failed")
        return BulkDataDescriptor(
            provider_object_id="bulk-object",
            source_type="all_cards",
            updated_at=OBSERVED_AT,
            download_uri="https://data.scryfall.io/all-cards.json",
            content_type="application/json",
            content_encoding=None,
            compressed_size=100,
        )

    def fetch_sets(self) -> tuple[dict[str, object], ...]:
        return self.raw_sets

    def download_bulk(
        self,
        descriptor: BulkDataDescriptor,
        destination: Path,
    ) -> DownloadResult:
        del descriptor, destination
        self.download_calls += 1
        raise DownloadEmptyError("fixture provider download failed")


@dataclass
class UnchangedLiveProvider:
    raw_sets: tuple[dict[str, object], ...]
    download_calls: int = 0

    def discover_all_cards(self) -> BulkDataDescriptor:
        return BulkDataDescriptor(
            provider_object_id="bulk-object",
            source_type="all_cards",
            updated_at=OBSERVED_AT,
            download_uri="https://data.scryfall.io/all-cards.json",
            content_type="application/json",
            content_encoding=None,
            compressed_size=100,
        )

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


def fixture_config() -> WorkerConfig:
    return WorkerConfig.from_environment(
        {
            "TALENCE_CATALOG_BATCH_SIZE": "1",
            "TALENCE_CATALOG_PRICE_STALE_AFTER_HOURS": "36",
        }
    )


def run_fixture(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    store: MemoryCatalogStore,
    *,
    force: bool = False,
    queued_import_id: str | None = None,
) -> ImportOutcome:
    return run_fixture_import(
        cards_path=cards_fixture_path,
        sets_path=sets_fixture_path,
        provider_observed_at=OBSERVED_AT,
        store=store,
        config=fixture_config(),
        force=force,
        queued_import_id=queued_import_id,
        now=lambda: INGESTED_AT,
    )


def test_fixture_import_stages_bounded_complete_batches_without_network(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore()

    outcome = run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert outcome.status == "succeeded"
    assert outcome.promoted is True
    assert outcome.source_bundle_sha256 is not None
    assert outcome.catalog_version == (
        f"mtg-20260726T120000Z-{outcome.source_bundle_sha256[:8]}-s1"
    )
    assert outcome.record_counts == {
        "sets": 3,
        "cards": 2,
        "printings": 4,
        "faces": 5,
        "prices": 7,
    }
    assert all(len(batch.sets) <= 1 for batch in store.batches)
    assert all(len(batch.printings) <= 1 for batch in store.batches)
    prices = [price for batch in store.batches for price in batch.prices]
    assert prices
    assert all(price.stale_after == "2026-07-28T00:00:00Z" for price in prices)
    assert all(price.amount >= 0 for price in prices)
    non_oracle = next(
        printing
        for batch in store.batches
        for printing in batch.printings
        if printing.printing_id == "78b13296-28d0-4186-b0d8-65a3db74651e"
    )
    assert non_oracle.color_identity == ("B", "R")
    assert len(store.heartbeats) == len(store.batches) + 2
    assert set(store.heartbeats) == {"run-1"}


def test_identical_fixture_replay_is_an_unchanged_noop(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore()
    first = run_fixture(cards_fixture_path, sets_fixture_path, store)
    staged_batch_count = len(store.batches)

    replay = run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert first.promoted is True
    assert replay.status == "unchanged"
    assert replay.unchanged is True
    assert replay.promoted is False
    assert replay.source_sha256 == first.source_sha256
    assert replay.source_bundle_sha256 == first.source_bundle_sha256
    assert len(store.batches) == staged_batch_count
    assert store.register_calls == 1
    assert store.promote_calls == 1


def test_changed_set_metadata_defeats_noop_and_changes_catalog_version(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    store = MemoryCatalogStore()
    first = run_fixture(cards_fixture_path, sets_fixture_path, store)
    changed_sets = json.loads(sets_fixture_path.read_text(encoding="utf-8"))
    changed_sets[0]["name"] = "Magic 2010 Updated"
    changed_sets_path = tmp_path / "sets-changed.json"
    changed_sets_path.write_text(
        json.dumps(changed_sets, ensure_ascii=False),
        encoding="utf-8",
    )

    second = run_fixture(cards_fixture_path, changed_sets_path, store)

    assert first.catalog_version is not None
    assert second.catalog_version is not None
    assert second.status == "succeeded"
    assert second.unchanged is False
    assert second.catalog_version != first.catalog_version
    assert second.source_sha256 == first.source_sha256
    assert second.source_bundle_sha256 != first.source_bundle_sha256
    assert store.register_calls == 2
    assert store.promote_calls == 2


def test_historical_source_is_repromoted_when_active_identity_differs(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    tmp_path: Path,
) -> None:
    store = MemoryCatalogStore()
    original = run_fixture(cards_fixture_path, sets_fixture_path, store)
    changed_sets = json.loads(sets_fixture_path.read_text(encoding="utf-8"))
    changed_sets[0]["name"] = "Magic 2010 Historical Source"
    changed_sets_path = tmp_path / "sets-historical.json"
    changed_sets_path.write_text(
        json.dumps(changed_sets, ensure_ascii=False),
        encoding="utf-8",
    )
    historical = run_fixture(cards_fixture_path, changed_sets_path, store)

    reactivated_original = run_fixture(
        cards_fixture_path,
        sets_fixture_path,
        store,
        force=True,
    )
    reactivated_historical = run_fixture(cards_fixture_path, changed_sets_path, store)

    assert original.catalog_version != historical.catalog_version
    assert reactivated_original.catalog_version == original.catalog_version
    assert reactivated_historical.catalog_version == historical.catalog_version
    assert reactivated_historical.promoted is True
    assert store.promote_calls == 4


@pytest.mark.parametrize("failure_stage", ["validation", "promotion"])
def test_failed_import_preserves_prior_catalog(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    failure_stage: str,
) -> None:
    store = MemoryCatalogStore(
        active_catalog_version="mtg-20260725T120000Z-aaaaaaaa-s1",
        fail_validation=failure_stage == "validation",
        fail_promotion=failure_stage == "promotion",
    )

    with pytest.raises(CatalogImportError):
        run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert store.active_catalog_version == "mtg-20260725T120000Z-aaaaaaaa-s1"
    assert store.failed
    assert store.promote_calls == (1 if failure_stage == "promotion" else 0)


def test_queued_fixture_preflight_failure_is_recorded(
    tmp_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore()

    with pytest.raises(CatalogImportError) as caught:
        run_fixture_import(
            cards_path=tmp_path / "missing-cards.json",
            sets_path=sets_fixture_path,
            provider_observed_at=OBSERVED_AT,
            store=store,
            config=fixture_config(),
            queued_import_id="queued-preflight",
            now=lambda: INGESTED_AT,
        )

    assert caught.value.error_code == "source_io_failed"
    assert store.queued_failed[0][:2] == ("queued-preflight", "source_io_failed")
    assert "missing-cards.json" in store.queued_failed[0][2]


def test_queued_provider_discovery_failure_is_recorded() -> None:
    store = MemoryCatalogStore()

    with pytest.raises(CatalogImportError) as caught:
        run_live_import(
            provider=cast(
                ScryfallProvider,
                FailingLiveProvider(failure_stage="discovery"),
            ),
            store=store,
            config=fixture_config(),
            queued_import_id="queued-provider",
            trigger_type="manual",
            now=lambda: INGESTED_AT,
        )

    assert caught.value.error_code == "provider_failed"
    assert store.queued_failed[0][:2] == ("queued-provider", "provider_failed")


def test_queued_download_failure_is_recorded(sets_fixture_path: Path) -> None:
    raw_sets = cast(
        list[dict[str, object]],
        json.loads(sets_fixture_path.read_text(encoding="utf-8")),
    )
    store = MemoryCatalogStore()

    with pytest.raises(CatalogImportError) as caught:
        run_live_import(
            provider=cast(
                ScryfallProvider,
                FailingLiveProvider(
                    failure_stage="download",
                    raw_sets=tuple(raw_sets),
                ),
            ),
            store=store,
            config=fixture_config(),
            queued_import_id="queued-download",
            trigger_type="manual",
            now=lambda: INGESTED_AT,
        )

    assert caught.value.error_code == "provider_failed"
    assert store.queued_failed[0][:2] == ("queued-download", "provider_failed")


def test_queued_unchanged_live_import_completes_without_download_and_replays(
    sets_fixture_path: Path,
) -> None:
    raw_sets = cast(
        list[dict[str, object]],
        json.loads(sets_fixture_path.read_text(encoding="utf-8")),
    )
    provider = UnchangedLiveProvider(raw_sets=tuple(raw_sets))
    dependency_sha256 = catalog_sets_sha256(normalize_sets(raw_sets))
    store = MemoryCatalogStore(
        active_catalog_version="mtg-20260726T120000Z-aaaaaaaa-s1",
        active_source=("bulk-object", OBSERVED_AT, dependency_sha256),
    )

    first = run_live_import(
        provider=cast(ScryfallProvider, provider),
        store=store,
        config=fixture_config(),
        queued_import_id="queued-noop",
        trigger_type="manual",
        now=lambda: INGESTED_AT,
    )
    replay = run_live_import(
        provider=cast(ScryfallProvider, provider),
        store=store,
        config=fixture_config(),
        queued_import_id="queued-noop",
        trigger_type="manual",
        now=lambda: INGESTED_AT,
    )

    assert provider.download_calls == 0
    assert first.status == replay.status == "unchanged"
    assert first.import_run_id == replay.import_run_id == "queued-noop"
    assert first.catalog_version == replay.catalog_version == store.active_catalog_version
    assert [call.status for call in store.queued_noop_calls] == [
        "succeeded",
        "succeeded",
    ]
    assert [call.noop for call in store.queued_noop_calls] == [True, True]
    assert [call.replayed for call in store.queued_noop_calls] == [False, True]


def test_nonqueued_unchanged_live_import_keeps_early_noop(
    sets_fixture_path: Path,
) -> None:
    raw_sets = cast(
        list[dict[str, object]],
        json.loads(sets_fixture_path.read_text(encoding="utf-8")),
    )
    provider = UnchangedLiveProvider(raw_sets=tuple(raw_sets))
    store = MemoryCatalogStore(
        active_catalog_version="mtg-20260726T120000Z-aaaaaaaa-s1",
        active_source=(
            "bulk-object",
            OBSERVED_AT,
            catalog_sets_sha256(normalize_sets(raw_sets)),
        ),
    )

    outcome = run_live_import(
        provider=cast(ScryfallProvider, provider),
        store=store,
        config=fixture_config(),
        trigger_type="scheduled",
        now=lambda: INGESTED_AT,
    )

    assert outcome.status == "unchanged"
    assert outcome.catalog_version == store.active_catalog_version
    assert provider.download_calls == 0
    assert store.queued_noop_calls == []


def test_unchanged_outcome_does_not_borrow_unrelated_source_metadata() -> None:
    class MismatchedStatusStore(MemoryCatalogStore):
        def status(self) -> Mapping[str, object]:
            return {
                "active_catalog_version": "mtg-active",
                "active_import_id": "active-import",
                "latest_successful": {
                    "import_run_id": "unrelated-import",
                    "source_file_id": "unrelated-source",
                    "catalog_version": "mtg-unrelated",
                    "sha256": "b" * 64,
                    "catalog_identity_sha256": "c" * 64,
                },
            }

    outcome = unchanged_outcome(
        trigger_type="fixture",
        store=MismatchedStatusStore(),
        source_sha256="a" * 64,
        source_bundle_sha256="d" * 64,
    )

    assert outcome.catalog_version == "mtg-active"
    assert outcome.import_run_id == "active-import"
    assert outcome.source_file_id is None
    assert outcome.source_sha256 == "a" * 64
    assert outcome.source_bundle_sha256 == "d" * 64


def test_requested_force_queue_continues_to_bulk_download(
    sets_fixture_path: Path,
) -> None:
    raw_sets = cast(
        list[dict[str, object]],
        json.loads(sets_fixture_path.read_text(encoding="utf-8")),
    )
    provider = FailingLiveProvider(
        failure_stage="download",
        raw_sets=tuple(raw_sets),
    )
    store = MemoryCatalogStore(
        active_source=(
            "bulk-object",
            OBSERVED_AT,
            catalog_sets_sha256(normalize_sets(raw_sets)),
        ),
        queued_force_ids={"queued-force"},
    )

    with pytest.raises(CatalogImportError) as caught:
        run_live_import(
            provider=cast(ScryfallProvider, provider),
            store=store,
            config=fixture_config(),
            queued_import_id="queued-force",
            trigger_type="manual",
            now=lambda: INGESTED_AT,
        )

    assert caught.value.error_code == "provider_failed"
    assert provider.download_calls == 1
    assert store.queued_noop_calls[0].status == "queued"
    assert store.queued_noop_calls[0].noop is False
    assert store.queued_failed[0][:2] == ("queued-force", "provider_failed")


def test_queued_source_registration_failure_is_recorded(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore(fail_registration=True)

    with pytest.raises(CatalogImportError) as caught:
        run_fixture(
            cards_fixture_path,
            sets_fixture_path,
            store,
            queued_import_id="queued-register",
        )

    assert caught.value.error_code == "database_failed"
    assert store.queued_failed[0][:2] == ("queued-register", "database_failed")


def test_failure_recording_failure_is_never_suppressed(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore(
        fail_validation=True,
        fail_failure_recording=True,
    )

    with pytest.raises(CatalogImportError) as caught:
        run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert caught.value.error_code == "failure_recording_failed"
    assert caught.value.__cause__ is not None


def test_nonzero_rejected_count_fails_closed(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
) -> None:
    store = MemoryCatalogStore(rejected_records=1)

    with pytest.raises(CatalogImportError) as caught:
        run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert caught.value.error_code == "validation_failed"
    assert "cannot accept rejected records" in caught.value.summary
    assert store.failed[0][0] == "validation_failed"


@pytest.mark.parametrize("failure_stage", ["heartbeat", "promotion"])
def test_sync_kill_switch_failure_is_stable_and_preserves_active_catalog(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    failure_stage: str,
) -> None:
    active_version = "mtg-20260725T120000Z-aaaaaaaa-s1"
    store = MemoryCatalogStore(
        active_catalog_version=active_version,
        sync_disabled_stage=failure_stage,
    )

    with pytest.raises(CatalogImportError) as caught:
        run_fixture(cards_fixture_path, sets_fixture_path, store)

    assert caught.value.error_code == "sync_disabled"
    assert store.active_catalog_version == active_version
    assert store.failed[0][0] == "sync_disabled"
