from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from talence_catalog.snapshot.schema import snapshot_digest
from talence_catalog.versioning import validate_catalog_version


@dataclass(frozen=True, slots=True)
class StoredArtifact:
    path: Path
    byte_size: int
    sha256: str


class LocalSnapshotStorage:
    """Immutable local implementation of the future artifact storage boundary."""

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    def publish(self, source: Path, *, version: str) -> StoredArtifact:
        validate_catalog_version(version)
        destination = self._root / "mtg" / version / "catalog.sqlite"
        if destination.exists():
            raise FileExistsError(f"Immutable snapshot already exists: {destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)

        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=destination.parent,
                prefix=".catalog.",
                suffix=".part",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
            shutil.copyfile(source, temporary_path)
            with temporary_path.open("r+b") as copied:
                copied.flush()
                os.fsync(copied.fileno())
            os.replace(temporary_path, destination)
            temporary_path = None
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

        byte_size, sha256 = snapshot_digest(destination)
        return StoredArtifact(
            path=destination,
            byte_size=byte_size,
            sha256=sha256,
        )
