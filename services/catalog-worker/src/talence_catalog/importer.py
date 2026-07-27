from __future__ import annotations

import hashlib
import json
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, NoReturn

from talence_catalog import __version__
from talence_catalog.config import WorkerConfig
from talence_catalog.download import (
    DownloadEmptyError,
    DownloadResult,
    DownloadSizeExceededError,
)
from talence_catalog.models import CatalogSet
from talence_catalog.normalize import (
    NormalizationError,
    iter_normalized_card_batches,
    iter_set_batches,
    normalize_set_file,
    normalize_sets,
)
from talence_catalog.provider.scryfall import (
    BulkDataDescriptor,
    ProviderResponseError,
    ProviderUnavailableError,
    ScryfallProvider,
)
from talence_catalog.store import (
    CatalogStore,
    CatalogStoreError,
    CatalogSyncDisabledError,
    CatalogValidationError,
    ImportValidation,
    PromotionResult,
)
from talence_catalog.timestamps import stale_after_timestamp, utc_now_timestamp
from talence_catalog.versioning import build_catalog_version

FIXTURE_PROVIDER_OBJECT_PREFIX = "fixture-sha256:"
SAFE_ERROR_SUMMARY_LIMIT = 500


@dataclass(frozen=True, slots=True)
class ImportOutcome:
    status: str
    trigger_type: str
    source_file_id: str | None
    import_run_id: str | None
    catalog_version: str | None
    source_sha256: str | None
    source_bundle_sha256: str | None
    record_counts: Mapping[str, int]
    unchanged: bool
    promoted: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "trigger_type": self.trigger_type,
            "source_file_id": self.source_file_id,
            "import_run_id": self.import_run_id,
            "catalog_version": self.catalog_version,
            "source_sha256": self.source_sha256,
            "source_bundle_sha256": self.source_bundle_sha256,
            "record_counts": dict(self.record_counts),
            "unchanged": self.unchanged,
            "promoted": self.promoted,
        }


class CatalogImportError(RuntimeError):
    """An import failed after preserving the previously active catalog."""

    def __init__(self, error_code: str, summary: str) -> None:
        super().__init__(summary)
        self.error_code = error_code
        self.summary = summary


def run_fixture_import(
    *,
    cards_path: Path,
    sets_path: Path,
    provider_observed_at: str,
    store: CatalogStore,
    config: WorkerConfig,
    force: bool = False,
    queued_import_id: str | None = None,
    now: Callable[[], str] = utc_now_timestamp,
) -> ImportOutcome:
    """Run the complete importer from local fixtures without provider network access."""

    try:
        download = digest_local_file(cards_path)
        catalog_sets = normalize_set_file(sets_path)
        descriptor = BulkDataDescriptor(
            provider_object_id=f"{FIXTURE_PROVIDER_OBJECT_PREFIX}{download.sha256}",
            source_type="fixture",
            updated_at=provider_observed_at,
            download_uri=cards_path.resolve().as_uri(),
            content_type="application/json",
            content_encoding=None,
            compressed_size=download.byte_size,
            dependency_sha256=catalog_sets_sha256(catalog_sets),
        )
    except Exception as error:
        if queued_import_id is None:
            raise
        _raise_recorded_import_failure(
            error,
            store=store,
            queued_import_id=queued_import_id,
        )

    return import_downloaded_catalog(
        descriptor=descriptor,
        download=download,
        catalog_sets=catalog_sets,
        store=store,
        config=config,
        trigger_type="fixture",
        force=force,
        queued_import_id=queued_import_id,
        source_prechecked=False,
        now=now,
    )


def run_live_import(
    *,
    provider: ScryfallProvider,
    store: CatalogStore,
    config: WorkerConfig,
    force: bool = False,
    queued_import_id: str | None = None,
    trigger_type: str = "live",
    now: Callable[[], str] = utc_now_timestamp,
) -> ImportOutcome:
    """Discover, download, and import the exact Scryfall all_cards source."""

    if trigger_type not in {"live", "manual", "scheduled"}:
        raise ValueError("Live import trigger_type must be live, manual, or scheduled.")
    try:
        descriptor = provider.discover_all_cards()
        raw_sets = provider.fetch_sets()
        catalog_sets = normalize_sets(raw_sets)
        descriptor = replace(
            descriptor,
            dependency_sha256=catalog_sets_sha256(catalog_sets),
        )
        if not force and store.source_is_unchanged(descriptor):
            if queued_import_id is None:
                return unchanged_outcome(trigger_type=trigger_type, store=store)
            completion = store.complete_queued_noop(
                queued_import_id,
                descriptor=descriptor,
                worker_version=__version__,
            )
            if completion.noop:
                outcome = unchanged_outcome(trigger_type=trigger_type, store=store)
                return replace(
                    outcome,
                    import_run_id=completion.import_run_id,
                    catalog_version=completion.catalog_version,
                )

        with tempfile.TemporaryDirectory(
            prefix="talence-catalog-",
            dir=config.temporary_directory,
        ) as temporary_directory:
            destination = Path(temporary_directory) / "all_cards.json"
            download = provider.download_bulk(descriptor, destination)
            return import_downloaded_catalog(
                descriptor=descriptor,
                download=download,
                catalog_sets=catalog_sets,
                store=store,
                config=config,
                trigger_type=trigger_type,
                force=force,
                queued_import_id=queued_import_id,
                source_prechecked=True,
                now=now,
            )
    except CatalogImportError:
        raise
    except Exception as error:
        if queued_import_id is None:
            raise
        _raise_recorded_import_failure(
            error,
            store=store,
            queued_import_id=queued_import_id,
        )


def import_downloaded_catalog(
    *,
    descriptor: BulkDataDescriptor,
    download: DownloadResult,
    catalog_sets: tuple[CatalogSet, ...],
    store: CatalogStore,
    config: WorkerConfig,
    trigger_type: str,
    force: bool,
    queued_import_id: str | None,
    source_prechecked: bool,
    now: Callable[[], str],
) -> ImportOutcome:
    expected_source_type = "fixture" if trigger_type == "fixture" else "all_cards"
    if descriptor.source_type != expected_source_type:
        raise ValueError(
            f"{trigger_type} catalog imports require source type {expected_source_type}."
        )
    if (
        not force
        and queued_import_id is None
        and not source_prechecked
        and store.source_is_unchanged(descriptor)
    ):
        return unchanged_outcome(
            trigger_type=trigger_type,
            store=store,
            source_sha256=download.sha256,
            source_bundle_sha256=catalog_source_bundle_sha256(
                download.sha256,
                descriptor.dependency_sha256,
            ),
        )

    downloaded_at = now()
    source_file_id: str | None = None
    import_run_id: str | None = None
    try:
        source_registration = store.register_source_file(
            descriptor,
            download,
            downloaded_at=downloaded_at,
        )
        source_file_id = source_registration.source_file_id
        import_registration = store.begin_import(
            source_file_id,
            trigger_type=trigger_type,
            worker_version=__version__,
            force=force,
            queued_import_id=queued_import_id,
        )
        import_run_id = import_registration.import_run_id
        if import_registration.noop:
            return ImportOutcome(
                status="unchanged",
                trigger_type=trigger_type,
                source_file_id=source_file_id,
                import_run_id=import_run_id,
                catalog_version=import_registration.active_catalog_version,
                source_sha256=download.sha256,
                source_bundle_sha256=catalog_source_bundle_sha256(
                    download.sha256,
                    descriptor.dependency_sha256,
                ),
                record_counts={},
                unchanged=True,
                promoted=False,
            )

        store.heartbeat_import(import_run_id)
        for batch in iter_set_batches(catalog_sets, batch_size=config.batch_size):
            store.stage_batch(import_run_id, batch)
            store.heartbeat_import(import_run_id)

        sets_by_id = {catalog_set.set_id: catalog_set for catalog_set in catalog_sets}
        cards_seen = 0
        stale_after = stale_after_timestamp(
            descriptor.updated_at,
            stale_after_hours=config.price_stale_after_hours,
        )
        for batch in iter_normalized_card_batches(
            download.path,
            catalog_sets=sets_by_id,
            observed_at=descriptor.updated_at,
            ingested_at=downloaded_at,
            stale_after=stale_after,
            batch_size=config.batch_size,
        ):
            cards_seen += batch.cards_seen
            store.stage_batch(import_run_id, batch)
            store.heartbeat_import(import_run_id)

        if cards_seen == 0:
            raise NormalizationError("Bulk catalog must contain at least one card.")

        validation = store.validate_import(import_run_id)
        _validate_promotion_counts(validation)
        source_bundle_sha256 = catalog_source_bundle_sha256(
            download.sha256,
            descriptor.dependency_sha256,
        )
        catalog_version = build_catalog_version(
            descriptor.updated_at,
            source_bundle_sha256,
            snapshot_schema_version=1,
        )
        store.heartbeat_import(import_run_id)
        promotion = store.promote_import(
            import_run_id,
            catalog_version=catalog_version,
        )
        _validate_promotion_result(promotion, import_run_id, catalog_version)
    except Exception as error:
        _raise_recorded_import_failure(
            error,
            store=store,
            source_file_id=source_file_id,
            import_run_id=import_run_id,
            queued_import_id=queued_import_id,
        )

    return ImportOutcome(
        status="succeeded",
        trigger_type=trigger_type,
        source_file_id=source_file_id,
        import_run_id=import_run_id,
        catalog_version=promotion.catalog_version,
        source_sha256=download.sha256,
        source_bundle_sha256=source_bundle_sha256,
        record_counts=promotion.counts,
        unchanged=False,
        promoted=True,
    )


def unchanged_outcome(
    *,
    trigger_type: str,
    store: CatalogStore | None = None,
    source_sha256: str | None = None,
    source_bundle_sha256: str | None = None,
) -> ImportOutcome:
    catalog_version: str | None = None
    source_file_id: str | None = None
    import_run_id: str | None = None
    if store is not None:
        state = store.status()
        catalog_version = _optional_mapping_text(state, "active_catalog_version")
        import_run_id = _optional_mapping_text(state, "active_import_id")
        latest = state.get("latest_successful")
        if isinstance(latest, Mapping):
            latest_catalog_version = _optional_mapping_text(latest, "catalog_version")
            latest_source_bundle_sha256 = _optional_mapping_text(
                latest,
                "catalog_identity_sha256",
            )
            latest_matches_active = (
                catalog_version is None or latest_catalog_version == catalog_version
            )
            latest_matches_source = (
                source_bundle_sha256 is None or latest_source_bundle_sha256 == source_bundle_sha256
            )
            if latest_matches_active and latest_matches_source:
                source_file_id = _optional_mapping_text(latest, "source_file_id")
                import_run_id = import_run_id or _optional_mapping_text(
                    latest,
                    "import_run_id",
                )
                source_sha256 = source_sha256 or _optional_mapping_text(latest, "sha256")
                source_bundle_sha256 = source_bundle_sha256 or latest_source_bundle_sha256
    return ImportOutcome(
        status="unchanged",
        trigger_type=trigger_type,
        source_file_id=source_file_id,
        import_run_id=import_run_id,
        catalog_version=catalog_version,
        source_sha256=source_sha256,
        source_bundle_sha256=source_bundle_sha256,
        record_counts={},
        unchanged=True,
        promoted=False,
    )


def digest_local_file(source_path: Path) -> DownloadResult:
    resolved = source_path.resolve(strict=True)
    digest = hashlib.sha256()
    byte_size = 0
    with resolved.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            byte_size += len(chunk)
    if byte_size == 0:
        raise NormalizationError("Fixture source must not be empty.")
    return DownloadResult(path=resolved, byte_size=byte_size, sha256=digest.hexdigest())


def catalog_sets_sha256(catalog_sets: tuple[CatalogSet, ...]) -> str:
    """Hash exactly the normalized set fields that can affect a promoted catalog."""

    canonical = json.dumps(
        [asdict(catalog_set) for catalog_set in sorted(catalog_sets, key=lambda item: item.set_id)],
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def catalog_source_bundle_sha256(
    all_cards_sha256: str,
    sets_sha256: str | None,
) -> str:
    """Build the version fingerprint over every normalized catalog input."""

    if sets_sha256 is None:
        raise ValueError("A normalized sets dependency SHA-256 is required.")
    try:
        identity_material = bytes.fromhex(all_cards_sha256) + bytes.fromhex(sets_sha256)
    except ValueError as error:
        raise ValueError("Catalog input checksums must be hexadecimal SHA-256 values.") from error
    if len(identity_material) != 64:
        raise ValueError("Catalog input checksums must each contain 32 bytes.")
    return hashlib.sha256(identity_material).hexdigest()


def safe_import_error(error: Exception) -> tuple[str, str]:
    if isinstance(error, CatalogImportError):
        return error.error_code, error.summary
    if isinstance(error, NormalizationError):
        return "normalization_failed", _bounded_message(str(error))
    if isinstance(
        error,
        (
            DownloadEmptyError,
            DownloadSizeExceededError,
            ProviderResponseError,
            ProviderUnavailableError,
        ),
    ):
        return "provider_failed", _bounded_message(str(error))
    if isinstance(error, CatalogValidationError):
        return "validation_failed", _bounded_message(str(error))
    if isinstance(error, CatalogSyncDisabledError):
        return "sync_disabled", _bounded_message(str(error))
    if isinstance(error, CatalogStoreError):
        return "database_failed", "Catalog database operation failed."
    if isinstance(error, (FileNotFoundError, OSError)):
        return "source_io_failed", _bounded_message(str(error))
    return "worker_failed", f"{type(error).__name__}: catalog worker stage failed."


def _raise_recorded_import_failure(
    error: Exception,
    *,
    store: CatalogStore,
    source_file_id: str | None = None,
    import_run_id: str | None = None,
    queued_import_id: str | None = None,
) -> NoReturn:
    error_code, summary = safe_import_error(error)
    try:
        if import_run_id is not None:
            store.mark_import_failed(
                source_file_id=source_file_id,
                import_run_id=import_run_id,
                error_code=error_code,
                error_summary=summary,
            )
        elif queued_import_id is not None:
            store.mark_queued_import_failed(
                queued_import_id,
                error_code=error_code,
                error_summary=summary,
            )
        elif source_file_id is not None:
            store.mark_import_failed(
                source_file_id=source_file_id,
                import_run_id=None,
                error_code=error_code,
                error_summary=summary,
            )
    except Exception as recording_error:
        raise CatalogImportError(
            "failure_recording_failed",
            "Catalog import failed and its database failure state could not be recorded.",
        ) from recording_error

    if isinstance(error, CatalogImportError):
        raise error
    raise CatalogImportError(error_code, summary) from error


def _bounded_message(message: str) -> str:
    single_line = " ".join(message.split())
    return single_line[:SAFE_ERROR_SUMMARY_LIMIT] or "Catalog worker stage failed."


def _validate_promotion_counts(validation: ImportValidation) -> None:
    required = ("sets", "cards", "printings")
    for key in required:
        if validation.counts.get(key, 0) <= 0:
            raise CatalogImportError(
                "validation_failed",
                f"Validated import count {key} must be greater than zero.",
            )
    if validation.records_rejected != 0:
        raise CatalogImportError(
            "validation_failed",
            "Fail-fast catalog validation cannot accept rejected records.",
        )


def _validate_promotion_result(
    promotion: PromotionResult,
    import_run_id: str,
    catalog_version: str,
) -> None:
    if promotion.active_import_id != import_run_id:
        raise CatalogImportError(
            "promotion_failed",
            "Promotion did not activate the requested import.",
        )
    if promotion.catalog_version != catalog_version:
        raise CatalogImportError(
            "promotion_failed",
            "Promotion returned an unexpected catalog version.",
        )


def status_payload(store: CatalogStore | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "worker_version": __version__,
        "phase": 5,
        "capabilities": {
            "fixture_import": True,
            "fixture_network_access": False,
            "live_provider_import": True,
            "streaming_json": True,
            "bounded_batch_staging": True,
            "postgres_staging": True,
            "catalog_promotion": True,
            "snapshot_sqlite_generation": True,
            "snapshot_artifact_upload": True,
            "snapshot_manifest_publication": True,
            "snapshot_reference_client": True,
        },
        "database_configured": store is not None,
    }
    if store is not None:
        payload["catalog"] = dict(store.status())
    return payload


def _optional_mapping_text(payload: Mapping[Any, Any], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) and value else None
