from __future__ import annotations

import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path

from talence_catalog.snapshot.schema import (
    SNAPSHOT_SCHEMA_VERSION,
    SnapshotCounts,
    SnapshotMetadata,
    SnapshotValidation,
    create_catalog_snapshot,
)
from talence_catalog.snapshot.storage import (
    DEFAULT_SNAPSHOT_BUCKET,
    SnapshotStorage,
    StoredArtifact,
)
from talence_catalog.store import (
    SnapshotCatalogStore,
    SnapshotPublication,
    SnapshotPublicationRequest,
)


class SnapshotGenerationError(RuntimeError):
    """Safe failure raised before any artifact reaches durable storage."""


@dataclass(frozen=True, slots=True)
class PublishedSnapshotArtifact:
    """Path-free identity for an artifact already handed to durable storage."""

    byte_size: int
    sha256: str
    validation: SnapshotValidation
    metadata: SnapshotMetadata


@dataclass(frozen=True, slots=True)
class SnapshotPublishOutcome:
    artifact: PublishedSnapshotArtifact
    stored: StoredArtifact
    publication: SnapshotPublication

    def as_dict(self) -> dict[str, object]:
        return {
            "status": self.publication.status,
            "snapshot_id": self.publication.snapshot_id,
            "version": self.publication.version,
            "snapshot_schema_version": SNAPSHOT_SCHEMA_VERSION,
            "storage_bucket": DEFAULT_SNAPSHOT_BUCKET,
            "storage_path": self.stored.storage_path,
            "sha256": self.artifact.sha256,
            "byte_size": self.artifact.byte_size,
            "record_counts": _manifest_counts(self.artifact.validation.counts),
            "generated_at": self.artifact.metadata.generated_at,
            "provider_observed_at": self.artifact.metadata.provider_observed_at,
            "source_sha256": self.artifact.metadata.source_sha256,
            "api_contract_version": self.artifact.metadata.api_contract_version,
            "minimum_client_version": self.artifact.metadata.minimum_client_version,
            "upload_replayed": self.stored.replayed,
            "publication_replayed": self.publication.replayed,
            "current_snapshot_id": self.publication.current_snapshot_id,
            "previous_snapshot_id": self.publication.previous_snapshot_id,
            "published_at": self.publication.published_at,
        }


def publish_active_catalog_snapshot(
    *,
    store: SnapshotCatalogStore,
    storage: SnapshotStorage,
    api_contract_version: str,
    minimum_client_version: str,
    temporary_directory: Path | None = None,
    schema_path: Path | None = None,
    source_batch_size: int = 5_000,
    sqlite_batch_size: int = 5_000,
    maximum_snapshot_bytes: int = 1_073_741_824,
) -> SnapshotPublishOutcome:
    """Generate, upload, then atomically publish one active catalog snapshot."""

    if storage.bucket != DEFAULT_SNAPSHOT_BUCKET:
        raise ValueError(f"Snapshot publication requires the {DEFAULT_SNAPSHOT_BUCKET!r} bucket.")

    with tempfile.TemporaryDirectory(
        prefix="talence-snapshot-",
        dir=temporary_directory,
    ) as temporary:
        output_path = Path(temporary) / "catalog.sqlite"
        with store.snapshot_generation(batch_size=source_batch_size) as generation:
            expected_import_id = generation.identity.active_import_id
            expected_catalog_version = generation.identity.catalog_version
            try:
                generated_artifact = create_catalog_snapshot(
                    output_path,
                    generation,
                    api_contract_version=api_contract_version,
                    minimum_client_version=minimum_client_version,
                    schema_path=schema_path,
                    batch_size=sqlite_batch_size,
                    maximum_snapshot_bytes=maximum_snapshot_bytes,
                )
            except (OSError, sqlite3.Error, ValueError) as error:
                raise SnapshotGenerationError(
                    "Catalog snapshot generation or integrity validation failed."
                ) from error

        stored = storage.publish(
            generated_artifact.path,
            version=expected_catalog_version,
        )
        if (
            stored.sha256 != generated_artifact.sha256
            or stored.byte_size != generated_artifact.byte_size
        ):
            raise ValueError("Uploaded snapshot identity does not match the built artifact.")

        publication = store.publish_snapshot(
            SnapshotPublicationRequest(
                expected_import_id=expected_import_id,
                expected_catalog_version=expected_catalog_version,
                snapshot_schema_version=SNAPSHOT_SCHEMA_VERSION,
                storage_path=stored.storage_path,
                sha256=generated_artifact.sha256,
                byte_size=generated_artifact.byte_size,
                record_counts=_manifest_counts(generated_artifact.validation.counts),
                minimum_client_version=minimum_client_version,
                generated_at=generated_artifact.metadata.generated_at,
                api_contract_version=api_contract_version,
            )
        )
        return SnapshotPublishOutcome(
            artifact=PublishedSnapshotArtifact(
                byte_size=generated_artifact.byte_size,
                sha256=generated_artifact.sha256,
                validation=generated_artifact.validation,
                metadata=generated_artifact.metadata,
            ),
            stored=stored,
            publication=publication,
        )


def _manifest_counts(counts: SnapshotCounts) -> dict[str, int]:
    """Project exactly the five keys allowed by the canonical manifest schema."""

    return {
        "sets": counts.sets,
        "oracle_cards": counts.oracle_cards,
        "printings": counts.printings,
        "faces": counts.faces,
        "prices": counts.prices,
    }
