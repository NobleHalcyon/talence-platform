"""Canonical SQLite snapshot foundations."""

from talence_catalog.snapshot.publisher import (
    PublishedSnapshotArtifact,
    SnapshotGenerationError,
    SnapshotPublishOutcome,
    publish_active_catalog_snapshot,
)
from talence_catalog.snapshot.reference_client import (
    HttpSnapshotDownloader,
    InstalledSnapshot,
    LocalFileSnapshotDownloader,
    ReferenceSnapshotClient,
    SnapshotDownloadDescription,
    SnapshotDownloadError,
)
from talence_catalog.snapshot.schema import (
    SnapshotArtifact,
    SnapshotCounts,
    SnapshotMetadata,
    SnapshotValidation,
    create_catalog_snapshot,
    create_snapshot_shell,
    validate_snapshot,
)
from talence_catalog.snapshot.source import (
    CatalogGenerationIdentity,
    CatalogGenerationReader,
    CatalogSnapshotSourceError,
    InMemoryCatalogGeneration,
)
from talence_catalog.snapshot.storage import (
    DEFAULT_SNAPSHOT_BUCKET,
    LocalSnapshotStorage,
    SnapshotStorage,
    SnapshotStorageError,
    StoredArtifact,
    SupabaseSnapshotStorage,
    snapshot_storage_path,
)

__all__ = [
    "DEFAULT_SNAPSHOT_BUCKET",
    "CatalogGenerationIdentity",
    "CatalogGenerationReader",
    "CatalogSnapshotSourceError",
    "HttpSnapshotDownloader",
    "InMemoryCatalogGeneration",
    "InstalledSnapshot",
    "LocalFileSnapshotDownloader",
    "LocalSnapshotStorage",
    "PublishedSnapshotArtifact",
    "ReferenceSnapshotClient",
    "SnapshotArtifact",
    "SnapshotCounts",
    "SnapshotDownloadDescription",
    "SnapshotDownloadError",
    "SnapshotGenerationError",
    "SnapshotMetadata",
    "SnapshotPublishOutcome",
    "SnapshotStorage",
    "SnapshotStorageError",
    "SnapshotValidation",
    "StoredArtifact",
    "SupabaseSnapshotStorage",
    "create_catalog_snapshot",
    "create_snapshot_shell",
    "publish_active_catalog_snapshot",
    "snapshot_storage_path",
    "validate_snapshot",
]
