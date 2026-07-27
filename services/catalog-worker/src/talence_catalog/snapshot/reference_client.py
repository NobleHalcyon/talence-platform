from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

import httpx

from talence_catalog.snapshot.schema import (
    DEFAULT_MAXIMUM_SNAPSHOT_BYTES,
    SNAPSHOT_SCHEMA_VERSION,
    SnapshotCounts,
    validate_snapshot,
)
from talence_catalog.timestamps import parse_timestamp
from talence_catalog.versioning import SHA256_PATTERN, validate_catalog_version


class SnapshotDownloadError(RuntimeError):
    """Safe reference-device snapshot update failure."""


@dataclass(frozen=True, slots=True)
class SnapshotDownloadDescription:
    version: str
    snapshot_schema_version: int
    game_code: str
    generated_at: str
    provider_observed_at: str
    sha256: str
    byte_size: int
    record_counts: SnapshotCounts
    minimum_client_version: str
    url: str

    def __post_init__(self) -> None:
        validate_catalog_version(self.version)
        if self.snapshot_schema_version != SNAPSHOT_SCHEMA_VERSION:
            raise ValueError("Reference client does not support this snapshot schema.")
        if self.game_code != "mtg":
            raise ValueError("Reference client only supports the MTG snapshot.")
        parse_timestamp(self.generated_at, label="snapshot manifest generated_at")
        parse_timestamp(
            self.provider_observed_at,
            label="snapshot manifest provider_observed_at",
        )
        if not SHA256_PATTERN.fullmatch(self.sha256):
            raise ValueError("Snapshot download SHA-256 is invalid.")
        if not 0 < self.byte_size <= DEFAULT_MAXIMUM_SNAPSHOT_BYTES:
            raise ValueError("Snapshot download byte size exceeds the canonical bounds.")
        if len(self.minimum_client_version) > 80 or not re.fullmatch(
            r"[0-9]+\.[0-9]+\.[0-9]+(?:[+-][A-Za-z0-9.-]+)?",
            self.minimum_client_version,
        ):
            raise ValueError("Snapshot minimum client version is invalid.")
        parsed = urlparse(self.url)
        if parsed.scheme not in {"file", "https"}:
            raise ValueError("Snapshot download URL must use file:// or HTTPS.")
        if parsed.scheme == "file" and (parsed.netloc or parsed.query or parsed.fragment):
            raise ValueError("Snapshot fixture URL must be a local file.")
        if parsed.scheme == "https" and (
            parsed.hostname is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
        ):
            raise ValueError("Snapshot HTTPS URL has an invalid authority.")


@dataclass(frozen=True, slots=True)
class InstalledSnapshot:
    version: str
    path: Path
    sha256: str
    byte_size: int
    previous_version: str | None
    replayed: bool


class SnapshotDownloader(Protocol):
    def download(
        self,
        url: str,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None: ...


class LocalFileSnapshotDownloader:
    """Network-free downloader for signed-URL protocol fixtures."""

    def download(
        self,
        url: str,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "file" or parsed.netloc or parsed.query or parsed.fragment:
            raise SnapshotDownloadError("Local snapshot fixture URL is invalid.")
        source = Path(url2pathname(unquote(parsed.path))).resolve(strict=True)
        _copy_bounded(source, destination, maximum_bytes=maximum_bytes)


class HttpSnapshotDownloader:
    """Small signed-URL downloader suitable for the reference integration client."""

    def __init__(
        self,
        *,
        timeout_seconds: float = 120.0,
        client: httpx.Client | None = None,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("Snapshot download timeout must be positive.")
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=False,
        )

    def __enter__(self) -> HttpSnapshotDownloader:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def download(
        self,
        url: str,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
        ):
            raise SnapshotDownloadError("Remote snapshot URL must use HTTPS.")
        try:
            with self._client.stream("GET", url) as response:
                if not response.is_success:
                    raise SnapshotDownloadError("Snapshot download was rejected.")
                content_length = response.headers.get("content-length")
                if content_length is not None and int(content_length) > maximum_bytes:
                    raise SnapshotDownloadError("Snapshot download exceeds the size guard.")
                byte_size = 0
                with destination.open("xb") as downloaded:
                    for chunk in response.iter_bytes():
                        byte_size += len(chunk)
                        if byte_size > maximum_bytes:
                            raise SnapshotDownloadError("Snapshot download exceeds the size guard.")
                        downloaded.write(chunk)
                    downloaded.flush()
                    os.fsync(downloaded.fileno())
        except SnapshotDownloadError:
            destination.unlink(missing_ok=True)
            raise
        except (httpx.HTTPError, OSError, ValueError) as error:
            destination.unlink(missing_ok=True)
            raise SnapshotDownloadError("Snapshot download failed.") from error


class ReferenceSnapshotClient:
    """Checksum/integrity-verifying installer with current + previous pointers."""

    def __init__(
        self,
        root: Path,
        *,
        downloader: SnapshotDownloader,
        maximum_attempts: int = 3,
        maximum_download_bytes: int = 1_073_741_824,
    ) -> None:
        if maximum_attempts <= 0:
            raise ValueError("Snapshot download attempts must be positive.")
        if not 0 < maximum_download_bytes <= DEFAULT_MAXIMUM_SNAPSHOT_BYTES:
            raise ValueError(
                "Snapshot download size guard must stay within the canonical 1 GiB ceiling."
            )
        self._root = root.resolve()
        self._downloader = downloader
        self._maximum_attempts = maximum_attempts
        self._maximum_download_bytes = maximum_download_bytes

    def install(
        self,
        description: SnapshotDownloadDescription,
        *,
        cloud_printing_sample: Sequence[str] = (),
    ) -> InstalledSnapshot:
        if description.byte_size > self._maximum_download_bytes:
            raise SnapshotDownloadError("Snapshot manifest exceeds the size guard.")
        self._root.mkdir(parents=True, exist_ok=True)
        downloads = self._root / ".downloads"
        downloads.mkdir(exist_ok=True)

        temporary_path: Path | None = None
        last_error: Exception | None = None
        for _ in range(self._maximum_attempts):
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            with tempfile.NamedTemporaryFile(
                dir=downloads,
                prefix=".catalog.",
                suffix=".sqlite.part",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
            temporary_path.unlink()
            try:
                self._downloader.download(
                    description.url,
                    temporary_path,
                    maximum_bytes=self._maximum_download_bytes,
                )
                _verify_download(temporary_path, description)
                validate_snapshot(temporary_path)
                _verify_snapshot_identity(temporary_path, description)
                _verify_cloud_printing_sample(
                    temporary_path,
                    cloud_printing_sample,
                )
                last_error = None
                break
            except (
                OSError,
                ValueError,
                sqlite3.Error,
                SnapshotDownloadError,
            ) as error:
                last_error = error
        if temporary_path is None or last_error is not None:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise SnapshotDownloadError(
                "Snapshot download failed after bounded retries."
            ) from last_error

        try:
            artifact_path, artifact_replayed = self._retain_versioned_artifact(
                temporary_path,
                description,
            )
            current = _read_pointer(self._root / "current.json")
            previous_version = (
                str(current["version"])
                if current is not None and current["version"] != description.version
                else _pointer_version(self._root / "previous.json")
            )
            if current is not None and current["version"] == description.version:
                return InstalledSnapshot(
                    version=description.version,
                    path=artifact_path,
                    sha256=description.sha256,
                    byte_size=description.byte_size,
                    previous_version=_pointer_version(self._root / "previous.json"),
                    replayed=True,
                )

            if current is not None:
                _write_pointer_atomic(self._root / "previous.json", current)
            new_pointer: dict[str, object] = {
                "version": description.version,
                "path": str(artifact_path.relative_to(self._root)).replace("\\", "/"),
                "sha256": description.sha256,
                "byte_size": description.byte_size,
            }
            _write_pointer_atomic(self._root / "current.json", new_pointer)
            return InstalledSnapshot(
                version=description.version,
                path=artifact_path,
                sha256=description.sha256,
                byte_size=description.byte_size,
                previous_version=previous_version,
                replayed=artifact_replayed,
            )
        finally:
            temporary_path.unlink(missing_ok=True)

    def _retain_versioned_artifact(
        self,
        temporary_path: Path,
        description: SnapshotDownloadDescription,
    ) -> tuple[Path, bool]:
        destination = self._root / "versions" / "mtg" / description.version / "catalog.sqlite"
        if destination.exists():
            _verify_download(destination, description)
            return destination, True
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temporary_path, destination)
        return destination, False


def _copy_bounded(source: Path, destination: Path, *, maximum_bytes: int) -> None:
    byte_size = 0
    try:
        with source.open("rb") as input_file, destination.open("xb") as output_file:
            while chunk := input_file.read(1024 * 1024):
                byte_size += len(chunk)
                if byte_size > maximum_bytes:
                    raise SnapshotDownloadError("Snapshot fixture exceeds the size guard.")
                output_file.write(chunk)
            output_file.flush()
            os.fsync(output_file.fileno())
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def _verify_download(
    path: Path,
    description: SnapshotDownloadDescription,
) -> None:
    digest = hashlib.sha256()
    byte_size = 0
    with path.open("rb") as artifact:
        while chunk := artifact.read(1024 * 1024):
            digest.update(chunk)
            byte_size += len(chunk)
    if byte_size != description.byte_size or digest.hexdigest() != description.sha256:
        raise SnapshotDownloadError("Snapshot checksum or byte size does not match manifest.")


def _verify_snapshot_identity(
    path: Path,
    description: SnapshotDownloadDescription,
) -> None:
    connection = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    try:
        row = connection.execute(
            """
            SELECT
              catalog_version,
              snapshot_schema_version,
              game_code,
              generated_at,
              provider_observed_at,
              sets_count,
              oracle_cards_count,
              printings_count,
              faces_count,
              prices_count,
              minimum_client_version
            FROM snapshot_meta
            """
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        raise SnapshotDownloadError("Snapshot metadata does not match its manifest.")
    row_without_timestamps = (*row[:3], *row[5:])
    expected_without_timestamps = (
        description.version,
        description.snapshot_schema_version,
        description.game_code,
        description.record_counts.sets,
        description.record_counts.oracle_cards,
        description.record_counts.printings,
        description.record_counts.faces,
        description.record_counts.prices,
        description.minimum_client_version,
    )
    if (
        row_without_timestamps != expected_without_timestamps
        or parse_timestamp(str(row[3]), label="snapshot generated_at")
        != parse_timestamp(
            description.generated_at,
            label="snapshot manifest generated_at",
        )
        or parse_timestamp(str(row[4]), label="snapshot provider_observed_at")
        != parse_timestamp(
            description.provider_observed_at,
            label="snapshot manifest provider_observed_at",
        )
    ):
        raise SnapshotDownloadError("Snapshot metadata does not match its manifest.")


def _verify_cloud_printing_sample(
    path: Path,
    cloud_printing_sample: Sequence[str],
) -> None:
    sample = tuple(sorted(set(cloud_printing_sample)))
    if len(sample) > 100:
        raise ValueError("Cloud printing sample is bounded to 100 IDs.")
    if not sample:
        return
    connection = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    try:
        placeholders = ", ".join("?" for _ in sample)
        rows = connection.execute(
            f"""
            SELECT printing_id
            FROM printings
            WHERE printing_id IN ({placeholders})
            ORDER BY printing_id
            """,
            sample,
        ).fetchall()
    finally:
        connection.close()
    if tuple(row[0] for row in rows) != sample:
        raise SnapshotDownloadError("Snapshot printing IDs do not match the sampled cloud catalog.")


def _read_pointer(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SnapshotDownloadError("Installed snapshot pointer is invalid.") from error
    if (
        not isinstance(value, dict)
        or not isinstance(value.get("version"), str)
        or not isinstance(value.get("path"), str)
        or not isinstance(value.get("sha256"), str)
        or isinstance(value.get("byte_size"), bool)
        or not isinstance(value.get("byte_size"), int)
    ):
        raise SnapshotDownloadError("Installed snapshot pointer has an invalid shape.")
    return value


def _pointer_version(path: Path) -> str | None:
    pointer = _read_pointer(path)
    return str(pointer["version"]) if pointer is not None else None


def _write_pointer_atomic(path: Path, value: dict[str, object]) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".part",
            mode="w",
            encoding="utf-8",
            newline="\n",
            delete=False,
        ) as pointer:
            temporary_path = Path(pointer.name)
            json.dump(value, pointer, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            pointer.write("\n")
            pointer.flush()
            os.fsync(pointer.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
