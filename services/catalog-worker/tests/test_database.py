from __future__ import annotations

from collections.abc import Mapping
from contextlib import contextmanager
from typing import Any, cast

import psycopg
import pytest
from psycopg.types.json import Jsonb

from talence_catalog.database import PostgresCatalogStore
from talence_catalog.store import (
    CatalogSnapshotStaleError,
    CatalogStoreError,
    SnapshotPublicationRequest,
)


def test_database_connection_failure_is_safely_wrapped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_connect(*_: object, **__: object) -> None:
        raise psycopg.OperationalError(
            "connection failed for postgresql://worker:secret@example.invalid/database"
        )

    monkeypatch.setattr(psycopg, "connect", fail_connect)

    with pytest.raises(CatalogStoreError) as caught:
        PostgresCatalogStore.connect("postgresql://worker:secret@example.invalid/database")

    assert str(caught.value) == "Unable to connect to the catalog database."
    assert "secret" not in str(caught.value)


def test_snapshot_publication_uses_the_private_rpc_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = PostgresCatalogStore(cast(Any, object()))
    captured: dict[str, object] = {}

    def call_json(
        statement: str,
        parameters: Mapping[str, object],
        *,
        operation: str,
    ) -> dict[str, object]:
        captured.update(
            statement=statement,
            parameters=parameters,
            operation=operation,
        )
        return {
            "snapshot_id": "10000000-0000-4000-8000-000000000001",
            "version": "mtg-20260726T120000Z-aaaaaaaa-s1",
            "status": "succeeded",
            "published_at": "2026-07-26T12:06:00Z",
            "current_snapshot_id": "10000000-0000-4000-8000-000000000001",
            "previous_snapshot_id": None,
            "replayed": False,
        }

    monkeypatch.setattr(store, "_call_json", call_json)
    request = SnapshotPublicationRequest(
        expected_import_id="20000000-0000-4000-8000-000000000001",
        expected_catalog_version="mtg-20260726T120000Z-aaaaaaaa-s1",
        snapshot_schema_version=1,
        storage_path="mtg/mtg-20260726T120000Z-aaaaaaaa-s1/catalog.sqlite",
        sha256="b" * 64,
        byte_size=4096,
        record_counts={
            "sets": 1,
            "oracle_cards": 2,
            "printings": 3,
            "faces": 4,
            "prices": 5,
        },
        minimum_client_version="0.1.0",
        generated_at="2026-07-26T12:04:00Z",
        api_contract_version="v1",
    )

    publication = store.publish_snapshot(request)

    statement = cast(str, captured["statement"])
    parameters = cast(Mapping[str, object], captured["parameters"])
    assert "app_private.catalog_publish_snapshot" in statement
    assert captured["operation"] == "publish catalog snapshot"
    assert parameters["expected_import_id"] == request.expected_import_id
    assert parameters["expected_catalog_version"] == request.expected_catalog_version
    assert parameters["storage_path"] == request.storage_path
    assert parameters["generated_at"] == request.generated_at
    counts = parameters["record_counts"]
    assert isinstance(counts, Jsonb)
    assert counts.obj == dict(request.record_counts)
    assert publication.snapshot_id == publication.current_snapshot_id
    assert publication.version == request.expected_catalog_version


def test_snapshot_stale_database_error_has_a_safe_specific_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StaleDatabaseError(Exception):
        diag = type(
            "Diagnostic",
            (),
            {"message_primary": "talence_catalog_snapshot_stale"},
        )()

    class FailingConnection:
        @contextmanager
        def transaction(self):
            yield

        def execute(self, *_: object, **__: object) -> None:
            raise StaleDatabaseError("postgresql://worker:secret@hosted.example/database")

    monkeypatch.setattr(psycopg, "Error", StaleDatabaseError)
    store = PostgresCatalogStore(cast(Any, FailingConnection()))

    with pytest.raises(CatalogSnapshotStaleError) as caught:
        store._call_json("SELECT failure", {}, operation="publish catalog snapshot")

    assert str(caught.value) == "The active catalog changed before snapshot publication."
    assert "secret" not in str(caught.value)
