from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from talence_catalog.config import ConfigurationError, WorkerConfig
from talence_catalog.database import PostgresCatalogStore
from talence_catalog.download import DownloadEmptyError, DownloadSizeExceededError
from talence_catalog.importer import (
    CatalogImportError,
    run_fixture_import,
    run_live_import,
    status_payload,
)
from talence_catalog.normalize.card import NormalizationError
from talence_catalog.normalize.catalog import normalize_catalog_file
from talence_catalog.provider.scryfall import (
    ProviderResponseError,
    ProviderUnavailableError,
    ScryfallProvider,
)
from talence_catalog.snapshot import (
    LocalSnapshotStorage,
    SnapshotGenerationError,
    SnapshotPublishOutcome,
    SnapshotStorage,
    SnapshotStorageError,
    SupabaseSnapshotStorage,
    publish_active_catalog_snapshot,
)
from talence_catalog.snapshot.source import CatalogSnapshotSourceError
from talence_catalog.store import CatalogSnapshotStaleError, CatalogStoreError
from talence_catalog.timestamps import stale_after_timestamp

FIXTURE_OBSERVED_AT = "2026-07-26T12:00:00Z"
FIXTURE_INGESTED_AT = "2026-07-26T12:05:00Z"


def fixture_cards_path() -> Path:
    return Path(__file__).resolve().parents[2] / "fixtures" / "scryfall" / "all_cards.json"


def fixture_sets_path() -> Path:
    return Path(__file__).resolve().parents[2] / "fixtures" / "scryfall" / "sets.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="talence-catalog",
        description="Talence Scryfall catalog import worker.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    fixture_parser = subcommands.add_parser(
        "fixture-import",
        help="Run the PostgreSQL import lifecycle using local fixtures and no network.",
    )
    _add_fixture_paths(fixture_parser)
    fixture_parser.add_argument(
        "--observed-at",
        default=FIXTURE_OBSERVED_AT,
        help="Provider observation timestamp assigned to the fixture source.",
    )
    fixture_parser.add_argument(
        "--force",
        action="store_true",
        help="Import even when this exact fixture source previously succeeded.",
    )
    fixture_parser.add_argument(
        "--queued-import-id",
        help="Optional queued catalog_import_runs UUID created by the admin service.",
    )
    fixture_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Normalize and validate fixtures without connecting to PostgreSQL.",
    )

    live_parser = subcommands.add_parser(
        "live-import",
        help="Discover and import Scryfall's exact all_cards bulk source.",
    )
    live_parser.add_argument(
        "--force",
        action="store_true",
        help="Import even when the exact provider source previously succeeded.",
    )
    live_parser.add_argument(
        "--queued-import-id",
        help="Optional queued catalog_import_runs UUID created by the admin service.",
    )
    live_parser.add_argument(
        "--trigger-type",
        choices=("live", "manual", "scheduled"),
        default="live",
        help="Operational trigger recorded on the import run.",
    )

    validate_parser = subcommands.add_parser(
        "validate",
        help="Normalize and validate local Scryfall cards and sets without database writes.",
    )
    _add_fixture_paths(validate_parser)
    validate_parser.add_argument(
        "--observed-at",
        default=FIXTURE_OBSERVED_AT,
        help="Provider observation timestamp assigned to fixture prices.",
    )
    validate_parser.add_argument(
        "--ingested-at",
        default=FIXTURE_INGESTED_AT,
        help="Talence ingestion timestamp assigned during normalization.",
    )

    subcommands.add_parser(
        "status",
        help="Report worker capabilities and database catalog status when configured.",
    )
    subcommands.add_parser(
        "snapshot-publish",
        help=(
            "Build the active catalog SQLite snapshot, upload it immutably, "
            "then publish its database manifest pointer."
        ),
    )
    return parser


def entrypoint(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        config = WorkerConfig.from_environment()
        if arguments.command == "status":
            return _status(config)
        if arguments.command == "snapshot-publish":
            return _snapshot_publish(config)
        if arguments.command == "validate":
            return _validate(
                arguments.cards,
                arguments.sets,
                observed_at=arguments.observed_at,
                ingested_at=arguments.ingested_at,
                config=config,
                mode="validation",
            )
        if arguments.command == "fixture-import":
            if arguments.dry_run:
                return _validate(
                    arguments.cards,
                    arguments.sets,
                    observed_at=arguments.observed_at,
                    ingested_at=FIXTURE_INGESTED_AT,
                    config=config,
                    mode="fixture_dry_run",
                )
            database_url = _required_database_url(config)
            with PostgresCatalogStore.connect(database_url) as store:
                outcome = run_fixture_import(
                    cards_path=arguments.cards,
                    sets_path=arguments.sets,
                    provider_observed_at=arguments.observed_at,
                    store=store,
                    config=config,
                    force=arguments.force,
                    queued_import_id=arguments.queued_import_id,
                )
            _print_json(outcome.as_dict())
            return 0
        if arguments.command == "live-import":
            database_url = _required_database_url(config)
            with (
                PostgresCatalogStore.connect(database_url) as store,
                ScryfallProvider(config) as provider,
            ):
                outcome = run_live_import(
                    provider=provider,
                    store=store,
                    config=config,
                    force=arguments.force,
                    queued_import_id=arguments.queued_import_id,
                    trigger_type=arguments.trigger_type,
                )
            _print_json(outcome.as_dict())
            return 0
    except (
        CatalogImportError,
        CatalogStoreError,
        CatalogSnapshotSourceError,
        SnapshotGenerationError,
        SnapshotStorageError,
        ConfigurationError,
        DownloadEmptyError,
        DownloadSizeExceededError,
        FileNotFoundError,
        NormalizationError,
        OSError,
        ProviderResponseError,
        ProviderUnavailableError,
        ValueError,
    ) as error:
        error_code = (
            error.error_code if isinstance(error, CatalogImportError) else _cli_error_code(error)
        )
        _print_json(
            {
                "status": "failed",
                "error_code": error_code,
                "message": str(error),
                "promoted": False,
            },
            stream=sys.stderr,
        )
        return 2
    raise RuntimeError(f"Unhandled catalog worker command: {arguments.command}")


def _add_fixture_paths(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--cards",
        type=Path,
        default=fixture_cards_path(),
        help="Path to a local top-level Scryfall card array.",
    )
    parser.add_argument(
        "--sets",
        type=Path,
        default=fixture_sets_path(),
        help="Path to a local top-level Scryfall set array.",
    )


def _validate(
    cards_path: Path,
    sets_path: Path,
    *,
    observed_at: str,
    ingested_at: str,
    config: WorkerConfig,
    mode: str,
) -> int:
    catalog = normalize_catalog_file(
        cards_path,
        sets_path=sets_path,
        observed_at=observed_at,
        ingested_at=ingested_at,
        stale_after=stale_after_timestamp(
            observed_at,
            stale_after_hours=config.price_stale_after_hours,
        ),
    )
    _print_json(
        {
            "status": "validated",
            "mode": mode,
            "cards_source": str(cards_path.resolve()),
            "sets_source": str(sets_path.resolve()),
            "record_counts": catalog.record_counts(),
            "database_writes": False,
            "network_requests": False,
            "promoted": False,
        }
    )
    return 0


def _status(config: WorkerConfig) -> int:
    if config.database_url is None:
        _print_json(status_payload(None))
        return 0
    with PostgresCatalogStore.connect(config.database_url) as store:
        _print_json(status_payload(store))
    return 0


def _snapshot_publish(config: WorkerConfig) -> int:
    database_url = _required_database_url(config)
    if config.snapshot_storage_backend == "local":
        if config.snapshot_storage_root is None:
            raise ConfigurationError(
                "TALENCE_SNAPSHOT_STORAGE_ROOT is required when "
                "TALENCE_SNAPSHOT_STORAGE_BACKEND=local."
            )
        storage: SnapshotStorage = LocalSnapshotStorage(
            config.snapshot_storage_root,
            bucket=config.snapshot_storage_bucket,
        )
        with PostgresCatalogStore.connect(database_url) as store:
            outcome = _publish_snapshot(store, storage, config)
    else:
        if config.supabase_url is None or config.supabase_secret_key is None:
            raise ConfigurationError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY are required when "
                "TALENCE_SNAPSHOT_STORAGE_BACKEND=supabase."
            )
        with (
            SupabaseSnapshotStorage(
                config.supabase_url,
                config.supabase_secret_key,
                bucket=config.snapshot_storage_bucket,
                timeout_seconds=config.snapshot_storage_timeout_seconds,
            ) as storage,
            PostgresCatalogStore.connect(database_url) as store,
        ):
            outcome = _publish_snapshot(store, storage, config)
    _print_json(outcome.as_dict())
    return 0


def _publish_snapshot(
    store: PostgresCatalogStore,
    storage: SnapshotStorage,
    config: WorkerConfig,
) -> SnapshotPublishOutcome:
    return publish_active_catalog_snapshot(
        store=store,
        storage=storage,
        api_contract_version=config.snapshot_api_contract_version,
        minimum_client_version=config.snapshot_minimum_client_version,
        temporary_directory=config.temporary_directory,
        source_batch_size=config.snapshot_batch_size,
        sqlite_batch_size=config.snapshot_batch_size,
        maximum_snapshot_bytes=config.snapshot_maximum_bytes,
    )


def _required_database_url(config: WorkerConfig) -> str:
    if config.database_url is None:
        raise ConfigurationError(
            "TALENCE_DATABASE_URL is required for fixture-import, live-import, "
            "and snapshot-publish; "
            "use fixture-import --dry-run for an offline validation."
        )
    return config.database_url


def _cli_error_code(error: Exception) -> str:
    if isinstance(error, ConfigurationError):
        return "configuration_invalid"
    if isinstance(error, NormalizationError):
        return "normalization_failed"
    if isinstance(error, CatalogStoreError):
        if isinstance(error, CatalogSnapshotStaleError):
            return "snapshot_stale"
        return "database_failed"
    if isinstance(error, CatalogSnapshotSourceError):
        return "snapshot_source_failed"
    if isinstance(error, SnapshotGenerationError):
        return "snapshot_generation_failed"
    if isinstance(error, SnapshotStorageError):
        return "snapshot_storage_failed"
    if isinstance(
        error,
        (
            DownloadEmptyError,
            DownloadSizeExceededError,
            ProviderResponseError,
            ProviderUnavailableError,
        ),
    ):
        return "provider_failed"
    if isinstance(error, (FileNotFoundError, OSError)):
        return "source_io_failed"
    return "worker_failed"


def _print_json(payload: object, *, stream: TextIO | None = None) -> None:
    print(
        json.dumps(payload, indent=2, sort_keys=True),
        file=sys.stdout if stream is None else stream,
    )
