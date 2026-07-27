from __future__ import annotations

from collections.abc import Mapping
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from talence_catalog.download import DownloadResult
from talence_catalog.models import NormalizedBatch
from talence_catalog.provider.scryfall import BulkDataDescriptor

if TYPE_CHECKING:
    from talence_catalog.snapshot.source import CatalogGenerationReader


class CatalogStoreError(RuntimeError):
    """Raised when the trusted catalog database contract cannot be completed."""


class CatalogSyncDisabledError(CatalogStoreError):
    """Raised when the database-owned catalog synchronization switch is off."""


class CatalogValidationError(CatalogStoreError):
    """Raised when database validation rejects staged catalog rows."""


class CatalogSnapshotStaleError(CatalogStoreError):
    """Raised when the active catalog changed after snapshot generation."""


@dataclass(frozen=True, slots=True)
class SourceFileRegistration:
    source_file_id: str
    replayed: bool = False
    unchanged: bool = False
    successful_import_id: str | None = None


@dataclass(frozen=True, slots=True)
class ImportRegistration:
    import_run_id: str
    replayed: bool = False
    noop: bool = False
    active_catalog_version: str | None = None


@dataclass(frozen=True, slots=True)
class QueuedNoopCompletion:
    import_run_id: str
    status: str
    noop: bool
    catalog_version: str | None
    active_import_id: str | None
    replayed: bool


@dataclass(frozen=True, slots=True)
class ImportValidation:
    counts: Mapping[str, int]
    records_rejected: int


@dataclass(frozen=True, slots=True)
class PromotionResult:
    active_import_id: str
    catalog_version: str
    counts: Mapping[str, int]


@dataclass(frozen=True, slots=True)
class SnapshotPublicationRequest:
    expected_import_id: str
    expected_catalog_version: str
    snapshot_schema_version: int
    storage_path: str
    sha256: str
    byte_size: int
    record_counts: Mapping[str, int]
    minimum_client_version: str
    generated_at: str
    api_contract_version: str


@dataclass(frozen=True, slots=True)
class SnapshotPublication:
    snapshot_id: str
    version: str
    status: str
    published_at: str
    current_snapshot_id: str
    previous_snapshot_id: str | None
    replayed: bool


class CatalogStore(Protocol):
    """Trusted database boundary used by fixture and live import orchestration."""

    def source_is_unchanged(self, descriptor: BulkDataDescriptor) -> bool: ...

    def complete_queued_noop(
        self,
        queued_import_id: str,
        *,
        descriptor: BulkDataDescriptor,
        worker_version: str,
    ) -> QueuedNoopCompletion: ...

    def register_source_file(
        self,
        descriptor: BulkDataDescriptor,
        download: DownloadResult,
        *,
        downloaded_at: str,
    ) -> SourceFileRegistration: ...

    def begin_import(
        self,
        source_file_id: str,
        *,
        trigger_type: str,
        worker_version: str,
        force: bool,
        queued_import_id: str | None,
    ) -> ImportRegistration: ...

    def stage_batch(self, import_run_id: str, batch: NormalizedBatch) -> None: ...

    def heartbeat_import(self, import_run_id: str) -> None: ...

    def validate_import(self, import_run_id: str) -> ImportValidation: ...

    def promote_import(
        self,
        import_run_id: str,
        *,
        catalog_version: str,
    ) -> PromotionResult: ...

    def mark_import_failed(
        self,
        *,
        source_file_id: str | None,
        import_run_id: str | None,
        error_code: str,
        error_summary: str,
    ) -> None: ...

    def mark_queued_import_failed(
        self,
        queued_import_id: str,
        *,
        error_code: str,
        error_summary: str,
    ) -> None: ...

    def status(self) -> Mapping[str, object]: ...


class SnapshotCatalogStore(Protocol):
    """Trusted generation read and atomic manifest-publication boundary."""

    def snapshot_generation(
        self,
        *,
        batch_size: int,
    ) -> AbstractContextManager[CatalogGenerationReader]: ...

    def publish_snapshot(
        self,
        request: SnapshotPublicationRequest,
    ) -> SnapshotPublication: ...
