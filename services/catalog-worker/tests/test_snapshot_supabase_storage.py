from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from talence_catalog.snapshot import (
    SnapshotStorageError,
    SupabaseSnapshotStorage,
)
from talence_catalog.versioning import build_catalog_version

VERSION = build_catalog_version(
    "2026-07-26T12:00:00Z",
    "a" * 64,
    snapshot_schema_version=1,
)
PROJECT_URL = "https://safe-project.supabase.co"
SECRET_KEY = "private-service-key"


@pytest.mark.parametrize(
    ("upload_status", "expected_replayed"),
    [(200, False), (409, True), (400, True)],
)
def test_supabase_storage_create_only_upload_and_verified_replay(
    tmp_path: Path,
    upload_status: int,
    expected_replayed: bool,
) -> None:
    source = tmp_path / "catalog.sqlite"
    source.write_bytes(b"deterministic sqlite bytes")
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            assert request.headers["x-upsert"] == "false"
            assert request.headers["authorization"] == f"Bearer {SECRET_KEY}"
            assert request.headers["apikey"] == SECRET_KEY
            assert request.read() == source.read_bytes()
            return httpx.Response(upload_status, json={"Key": "catalog.sqlite"})
        assert request.method == "GET"
        assert "/object/authenticated/catalog-snapshots/" in str(request.url)
        return httpx.Response(200, content=source.read_bytes())

    client = httpx.Client(transport=httpx.MockTransport(handle))
    storage = SupabaseSnapshotStorage(
        PROJECT_URL,
        SECRET_KEY,
        client=client,
    )

    stored = storage.publish(source, version=VERSION)

    assert stored.replayed is expected_replayed
    assert stored.storage_path == f"mtg/{VERSION}/catalog.sqlite"
    assert stored.path is None
    assert [request.method for request in requests] == ["POST", "GET"]


def test_supabase_storage_existing_mismatch_fails_without_secret_or_url_leak(
    tmp_path: Path,
) -> None:
    source = tmp_path / "catalog.sqlite"
    source.write_bytes(b"expected bytes")
    methods: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        methods.append(request.method)
        if request.method == "POST":
            return httpx.Response(409, json={"code": "KeyAlreadyExists"})
        return httpx.Response(200, content=b"different immutable bytes")

    storage = SupabaseSnapshotStorage(
        PROJECT_URL,
        SECRET_KEY,
        client=httpx.Client(transport=httpx.MockTransport(handle)),
    )

    with pytest.raises(SnapshotStorageError) as caught:
        storage.publish(source, version=VERSION)

    assert methods == ["POST", "GET"]
    assert PROJECT_URL not in str(caught.value)
    assert SECRET_KEY not in str(caught.value)


def test_supabase_storage_rejects_unverified_server_error_safely(
    tmp_path: Path,
) -> None:
    source = tmp_path / "catalog.sqlite"
    source.write_bytes(b"expected bytes")

    storage = SupabaseSnapshotStorage(
        PROJECT_URL,
        SECRET_KEY,
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(503, text=f"{PROJECT_URL}/{SECRET_KEY}")
            )
        ),
    )

    with pytest.raises(SnapshotStorageError) as caught:
        storage.publish(source, version=VERSION)

    assert PROJECT_URL not in str(caught.value)
    assert SECRET_KEY not in str(caught.value)


def test_supabase_storage_bounds_verification_download_to_generated_size(
    tmp_path: Path,
) -> None:
    source = tmp_path / "catalog.sqlite"
    source.write_bytes(b"expected bytes")

    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"Key": "catalog.sqlite"})
        return httpx.Response(200, content=source.read_bytes() + b"unexpected")

    storage = SupabaseSnapshotStorage(
        PROJECT_URL,
        SECRET_KEY,
        client=httpx.Client(transport=httpx.MockTransport(handle)),
    )

    with pytest.raises(SnapshotStorageError, match="exceeds"):
        storage.publish(source, version=VERSION)
