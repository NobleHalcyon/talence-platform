import hashlib
from collections.abc import Iterator
from pathlib import Path

import pytest

from talence_catalog.download import DownloadSizeExceededError, stream_to_file


def test_streamed_download_is_atomic_and_checksummed(tmp_path: Path) -> None:
    destination = tmp_path / "all_cards.json"
    payload = [b"[", b'{"id":"fixture"}', b"]"]

    result = stream_to_file(payload, destination, maximum_bytes=1024)

    expected = b"".join(payload)
    assert result.path == destination.resolve()
    assert result.byte_size == len(expected)
    assert result.sha256 == hashlib.sha256(expected).hexdigest()
    assert destination.read_bytes() == expected
    assert list(tmp_path.glob("*.part")) == []


def test_oversized_download_leaves_no_partial_or_destination(tmp_path: Path) -> None:
    destination = tmp_path / "all_cards.json"

    with pytest.raises(DownloadSizeExceededError):
        stream_to_file([b"1234", b"5678"], destination, maximum_bytes=7)

    assert not destination.exists()
    assert list(tmp_path.glob(".*.part")) == []


def test_interrupted_download_leaves_no_partial_file(tmp_path: Path) -> None:
    destination = tmp_path / "all_cards.json"

    def interrupted() -> Iterator[bytes]:
        yield b"partial"
        raise OSError("simulated connection interruption")

    with pytest.raises(OSError, match="simulated"):
        stream_to_file(interrupted(), destination, maximum_bytes=1024)

    assert not destination.exists()
    assert list(tmp_path.glob(".*.part")) == []
