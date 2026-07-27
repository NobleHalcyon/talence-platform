from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlparse

import httpx

from talence_catalog.snapshot.schema import snapshot_digest
from talence_catalog.versioning import validate_catalog_version

DEFAULT_SNAPSHOT_BUCKET = "catalog-snapshots"


@dataclass(frozen=True, slots=True)
class StoredArtifact:
    storage_path: str
    byte_size: int
    sha256: str
    replayed: bool
    path: Path | None = None


class SnapshotStorage(Protocol):
    """Create-only artifact boundary used before database publication."""

    bucket: str

    def publish(self, source: Path, *, version: str) -> StoredArtifact: ...


class SnapshotStorageError(RuntimeError):
    """Raised without exposing a private Storage URL or credential."""


def snapshot_storage_path(version: str) -> str:
    validate_catalog_version(version)
    return f"mtg/{version}/catalog.sqlite"


class LocalSnapshotStorage:
    """Immutable local implementation used by fixture and integration tests."""

    bucket = DEFAULT_SNAPSHOT_BUCKET

    def __init__(self, root: Path, *, bucket: str = DEFAULT_SNAPSHOT_BUCKET) -> None:
        self._root = root.resolve()
        self.bucket = _validate_bucket(bucket)

    def publish(self, source: Path, *, version: str) -> StoredArtifact:
        storage_path = snapshot_storage_path(version)
        destination = self._root.joinpath(*storage_path.split("/"))
        expected_size, expected_sha256 = snapshot_digest(source)
        if destination.exists():
            byte_size, sha256 = snapshot_digest(destination)
            if (byte_size, sha256) != (expected_size, expected_sha256):
                raise SnapshotStorageError(
                    f"Immutable snapshot path contains different bytes: {storage_path}"
                )
            return StoredArtifact(
                storage_path=storage_path,
                path=destination,
                byte_size=byte_size,
                sha256=sha256,
                replayed=True,
            )
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
            try:
                # The temporary file lives beside the destination, so linking it
                # publishes complete bytes without an overwrite race.
                os.link(temporary_path, destination)
            except FileExistsError:
                byte_size, sha256 = snapshot_digest(destination)
                if (byte_size, sha256) != (expected_size, expected_sha256):
                    raise SnapshotStorageError(
                        f"Immutable snapshot path contains different bytes: {storage_path}"
                    ) from None
                return StoredArtifact(
                    storage_path=storage_path,
                    path=destination,
                    byte_size=byte_size,
                    sha256=sha256,
                    replayed=True,
                )
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

        byte_size, sha256 = snapshot_digest(destination)
        if (byte_size, sha256) != (expected_size, expected_sha256):
            raise SnapshotStorageError("Stored snapshot bytes failed verification.")
        return StoredArtifact(
            storage_path=storage_path,
            path=destination,
            byte_size=byte_size,
            sha256=sha256,
            replayed=False,
        )


class SupabaseSnapshotStorage:
    """Private Supabase Storage adapter with create-only, verified publication."""

    def __init__(
        self,
        project_url: str,
        secret_key: str,
        *,
        bucket: str = DEFAULT_SNAPSHOT_BUCKET,
        timeout_seconds: float = 120.0,
        client: httpx.Client | None = None,
    ) -> None:
        parsed_project_url = urlparse(project_url)
        if (
            parsed_project_url.scheme != "https"
            or parsed_project_url.hostname is None
            or parsed_project_url.username is not None
            or parsed_project_url.password is not None
            or parsed_project_url.path not in {"", "/"}
            or parsed_project_url.query
            or parsed_project_url.fragment
        ):
            raise ValueError("Supabase Storage project URL must use HTTPS.")
        if not secret_key:
            raise ValueError("Supabase Storage secret key must be non-empty.")
        if timeout_seconds <= 0:
            raise ValueError("Supabase Storage timeout must be positive.")
        self.bucket = _validate_bucket(bucket)
        self._project_url = project_url.rstrip("/")
        self._secret_key = secret_key
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=False,
        )

    def __enter__(self) -> SupabaseSnapshotStorage:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def publish(self, source: Path, *, version: str) -> StoredArtifact:
        storage_path = snapshot_storage_path(version)
        expected_size, expected_sha256 = snapshot_digest(source)
        upload_url = self._object_url(storage_path, authenticated=False)
        try:
            with source.open("rb") as body:
                response = self._client.post(
                    upload_url,
                    headers={
                        **self._authorization_headers(),
                        "content-type": "application/vnd.sqlite3",
                        "cache-control": "max-age=31536000, immutable",
                        "x-upsert": "false",
                    },
                    content=body,
                )
        except (httpx.HTTPError, OSError) as error:
            raise SnapshotStorageError("Snapshot Storage upload failed.") from error

        replayed = False
        if response.is_success:
            replayed = False
        elif response.status_code in {400, 409}:
            replayed = True
        else:
            raise SnapshotStorageError("Snapshot Storage upload was rejected.")

        actual_size, actual_sha256 = self._download_digest(
            storage_path,
            maximum_bytes=expected_size,
        )
        if (actual_size, actual_sha256) != (expected_size, expected_sha256):
            raise SnapshotStorageError(
                "Immutable Snapshot Storage object does not match the generated artifact."
            )
        return StoredArtifact(
            storage_path=storage_path,
            byte_size=actual_size,
            sha256=actual_sha256,
            replayed=replayed,
        )

    def _download_digest(
        self,
        storage_path: str,
        *,
        maximum_bytes: int,
    ) -> tuple[int, str]:
        digest = hashlib.sha256()
        byte_size = 0
        try:
            with self._client.stream(
                "GET",
                self._object_url(storage_path, authenticated=True),
                headers=self._authorization_headers(),
            ) as response:
                if not response.is_success:
                    raise SnapshotStorageError("Snapshot Storage verification download failed.")
                for chunk in response.iter_bytes():
                    byte_size += len(chunk)
                    if byte_size > maximum_bytes:
                        raise SnapshotStorageError(
                            "Snapshot Storage verification object exceeds the generated artifact."
                        )
                    digest.update(chunk)
        except SnapshotStorageError:
            raise
        except httpx.HTTPError as error:
            raise SnapshotStorageError("Snapshot Storage verification download failed.") from error
        return byte_size, digest.hexdigest()

    def _authorization_headers(self) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self._secret_key}",
            "apikey": self._secret_key,
        }

    def _object_url(self, storage_path: str, *, authenticated: bool) -> str:
        encoded_bucket = quote(self.bucket, safe="")
        encoded_path = "/".join(quote(part, safe="") for part in storage_path.split("/"))
        qualifier = "object/authenticated" if authenticated else "object"
        return f"{self._project_url}/storage/v1/{qualifier}/{encoded_bucket}/{encoded_path}"


def _validate_bucket(value: str) -> str:
    stripped = value.strip()
    if (
        not stripped
        or len(stripped) > 100
        or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for character in stripped)
    ):
        raise ValueError("Snapshot Storage bucket has an invalid shape.")
    return stripped
