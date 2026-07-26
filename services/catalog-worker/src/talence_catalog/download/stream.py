from __future__ import annotations

import hashlib
import os
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path


class DownloadSizeExceededError(RuntimeError):
    """Raised before a streamed source exceeds its configured size bound."""


class DownloadEmptyError(RuntimeError):
    """Raised when a provider returns no bytes for a bulk source."""


@dataclass(frozen=True, slots=True)
class DownloadResult:
    path: Path
    byte_size: int
    sha256: str


def stream_to_file(
    chunks: Iterable[bytes],
    destination: Path,
    *,
    maximum_bytes: int,
) -> DownloadResult:
    """Write streamed bytes atomically while enforcing size and calculating SHA-256."""

    if maximum_bytes <= 0:
        raise ValueError("maximum_bytes must be greater than zero.")

    resolved_destination = destination.resolve()
    resolved_destination.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    byte_size = 0
    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            dir=resolved_destination.parent,
            prefix=f".{resolved_destination.name}.",
            suffix=".part",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            for chunk in chunks:
                if not isinstance(chunk, bytes):
                    raise TypeError("download chunks must be bytes.")
                next_size = byte_size + len(chunk)
                if next_size > maximum_bytes:
                    raise DownloadSizeExceededError(
                        f"Download exceeded the {maximum_bytes}-byte limit."
                    )
                temporary_file.write(chunk)
                digest.update(chunk)
                byte_size = next_size

            temporary_file.flush()
            os.fsync(temporary_file.fileno())

        if byte_size == 0:
            raise DownloadEmptyError("Provider bulk download contained no bytes.")

        os.replace(temporary_path, resolved_destination)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return DownloadResult(
        path=resolved_destination,
        byte_size=byte_size,
        sha256=digest.hexdigest(),
    )
