from __future__ import annotations

import pytest

from talence_catalog.integration_safety import (
    require_disposable_local_supabase_database,
)


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "postgresql://postgres:postgres@[::1]:54322/postgres",
    ],
)
def test_disposable_local_supabase_target_accepts_exact_loopback_shape(
    database_url: str,
) -> None:
    assert require_disposable_local_supabase_database(database_url) == database_url


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql://postgres:secret@db.example.com:5432/postgres",
        "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
        "postgresql://postgres:postgres@127.0.0.1:54322/production",
        "postgresql://postgres:postgres@localhost:54322/postgres",
        ("postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.example.com"),
        "not-a-database-url",
    ],
)
def test_disposable_local_supabase_target_rejects_unsafe_or_ambiguous_urls(
    database_url: str,
) -> None:
    with pytest.raises(ValueError, match="disposable loopback"):
        require_disposable_local_supabase_database(database_url)
