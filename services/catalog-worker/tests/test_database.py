from __future__ import annotations

import psycopg
import pytest

from talence_catalog.database import PostgresCatalogStore
from talence_catalog.store import CatalogStoreError


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
