from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from decimal import Decimal
from pathlib import Path

import pytest

from talence_catalog.models import CatalogSet, NormalizedCatalog
from talence_catalog.normalize.catalog import normalize_catalog_file
from talence_catalog.snapshot import (
    CatalogGenerationIdentity,
    InMemoryCatalogGeneration,
    LocalSnapshotStorage,
    SnapshotGenerationError,
    create_catalog_snapshot,
    publish_active_catalog_snapshot,
)
from talence_catalog.snapshot.source import CatalogGenerationReader
from talence_catalog.store import (
    CatalogStoreError,
    SnapshotPublication,
    SnapshotPublicationRequest,
)
from talence_catalog.versioning import build_catalog_version

OBSERVED_AT = "2026-07-26T12:00:00Z"
DOWNLOADED_AT = "2026-07-26T12:04:00Z"
INGESTED_AT = "2026-07-26T12:05:00Z"
CATALOG_IDENTITY = "a" * 64


def fixture_generation(
    cards_path: Path,
    sets_path: Path,
    *,
    catalog_identity: str = CATALOG_IDENTITY,
    active_import_id: str = "10000000-0000-4000-8000-000000000001",
) -> InMemoryCatalogGeneration:
    catalog = normalize_catalog_file(
        cards_path,
        sets_path=sets_path,
        observed_at=OBSERVED_AT,
        ingested_at=INGESTED_AT,
    )
    return generation_from_catalog(
        catalog,
        catalog_identity=catalog_identity,
        active_import_id=active_import_id,
    )


def generation_from_catalog(
    catalog: NormalizedCatalog,
    *,
    catalog_identity: str = CATALOG_IDENTITY,
    active_import_id: str = "10000000-0000-4000-8000-000000000001",
) -> InMemoryCatalogGeneration:
    return InMemoryCatalogGeneration(
        identity=CatalogGenerationIdentity(
            active_import_id=active_import_id,
            catalog_version=build_catalog_version(
                OBSERVED_AT,
                catalog_identity,
                snapshot_schema_version=1,
            ),
            provider_observed_at=OBSERVED_AT,
            catalog_identity_sha256=catalog_identity,
            source_downloaded_at=DOWNLOADED_AT,
            catalog_ingested_at=INGESTED_AT,
        ),
        sets=catalog.sets,
        oracle_cards=catalog.oracle_cards,
        printings=catalog.printings,
        faces=catalog.faces,
        legalities=catalog.legalities,
        prices=catalog.prices,
        external_ids=catalog.external_ids,
    )


def test_populated_snapshot_is_deterministic_canonical_and_searchable(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    generation = fixture_generation(cards_fixture_path, sets_fixture_path)

    first = create_catalog_snapshot(
        tmp_path / "first.sqlite",
        generation,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
        batch_size=1,
    )
    second = create_catalog_snapshot(
        tmp_path / "second.sqlite",
        generation,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
        batch_size=3,
    )
    database_scaled_generation = replace(
        generation,
        prices=tuple(
            replace(price, amount=price.amount.quantize(Decimal("0.0000")))
            for price in generation.prices
        ),
    )
    database_scaled = create_catalog_snapshot(
        tmp_path / "database-scaled.sqlite",
        database_scaled_generation,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
        batch_size=2,
    )

    assert first.sha256 == second.sha256 == database_scaled.sha256
    assert first.path.read_bytes() == second.path.read_bytes() == database_scaled.path.read_bytes()
    assert first.validation.quick_check == "ok"
    assert first.validation.foreign_key_failures == 0
    assert first.validation.user_version == 1
    assert first.validation.counts.sets == len(generation.sets)
    assert first.validation.counts.oracle_cards == len(generation.oracle_cards)
    assert first.validation.counts.printings == len(generation.printings)
    assert first.validation.counts.faces == len(generation.faces)
    assert first.validation.counts.prices == len(generation.prices)
    assert first.validation.legalities == len(generation.legalities)
    assert first.validation.external_ids == len(generation.external_ids)
    assert first.validation.fts_rows == len(generation.oracle_cards)
    assert first.metadata.generated_at == OBSERVED_AT

    connection = sqlite3.connect(first.path)
    try:
        price = connection.execute(
            """
            SELECT amount, typeof(amount), ingested_at
            FROM current_prices
            WHERE printing_id = 'e6a1f7d6-5f5b-4f1e-8cc3-8bf2962a8ac7'
              AND currency = 'USD'
              AND finish = 'nonfoil'
            """
        ).fetchone()
        arrays = connection.execute(
            """
            SELECT colors_json, color_identity_json, keywords_json
            FROM oracle_cards
            WHERE oracle_card_id = '0d13e6b0-3f45-4f36-8b9f-0bfc2c9d117a'
            """
        ).fetchone()
        entity_types = connection.execute(
            "SELECT DISTINCT entity_type FROM external_ids ORDER BY entity_type"
        ).fetchall()
        oracle_identifier = connection.execute(
            """
            SELECT entity_type
            FROM external_ids
            WHERE provider = 'scryfall'
              AND identifier_type = 'oracle_id'
            LIMIT 1
            """
        ).fetchone()
        search_result = connection.execute(
            """
            SELECT card.name
            FROM oracle_cards_fts AS search
            JOIN oracle_cards AS card ON card.rowid = search.rowid
            WHERE oracle_cards_fts MATCH 'lightning'
            """
        ).fetchone()
    finally:
        connection.close()

    assert price == ("0.35", "text", OBSERVED_AT)
    assert arrays == ('["U"]', '["U"]', '["Flying","Transform"]')
    assert entity_types == [("oracle_card",), ("printing",), ("set",)]
    assert oracle_identifier == ("oracle_card",)
    assert search_result == ("Lightning Bolt",)


@dataclass
class RecordingSnapshotStore:
    generation: CatalogGenerationReader
    current_snapshot_id: str = "20000000-0000-4000-8000-000000000001"
    fail_publications: int = 0
    requests: list[SnapshotPublicationRequest] = field(default_factory=list)

    @contextmanager
    def snapshot_generation(
        self,
        *,
        batch_size: int,
    ) -> Iterator[CatalogGenerationReader]:
        assert batch_size > 0
        yield self.generation

    def publish_snapshot(
        self,
        request: SnapshotPublicationRequest,
    ) -> SnapshotPublication:
        self.requests.append(request)
        if self.fail_publications:
            self.fail_publications -= 1
            raise CatalogStoreError("simulated publication failure")
        previous = self.current_snapshot_id
        snapshot_id = "30000000-0000-4000-8000-000000000001"
        self.current_snapshot_id = snapshot_id
        return SnapshotPublication(
            snapshot_id=snapshot_id,
            version=request.expected_catalog_version,
            status="succeeded",
            published_at="2026-07-26T12:06:00Z",
            current_snapshot_id=snapshot_id,
            previous_snapshot_id=previous,
            replayed=len(self.requests) > 1,
        )


def test_upload_success_publication_failure_preserves_pointer_and_retries_exact_bytes(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    generation = fixture_generation(cards_fixture_path, sets_fixture_path)
    store = RecordingSnapshotStore(generation, fail_publications=1)
    storage = LocalSnapshotStorage(tmp_path / "storage")
    prior_snapshot_id = store.current_snapshot_id

    with pytest.raises(CatalogStoreError, match="simulated"):
        publish_active_catalog_snapshot(
            store=store,
            storage=storage,
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            schema_path=canonical_snapshot_schema_path,
            sqlite_batch_size=2,
        )

    assert store.current_snapshot_id == prior_snapshot_id
    first_request = store.requests[0]
    uploaded_path = (
        tmp_path / "storage" / "mtg" / generation.identity.catalog_version / "catalog.sqlite"
    )
    assert uploaded_path.is_file()

    outcome = publish_active_catalog_snapshot(
        store=store,
        storage=storage,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
        sqlite_batch_size=3,
    )

    assert outcome.stored.replayed is True
    assert outcome.publication.previous_snapshot_id == prior_snapshot_id
    assert outcome.publication.replayed is True
    assert outcome.artifact.sha256 == first_request.sha256
    assert outcome.artifact.byte_size == first_request.byte_size
    assert set(store.requests[1].record_counts) == {
        "sets",
        "oracle_cards",
        "printings",
        "faces",
        "prices",
    }
    assert uploaded_path.read_bytes() == outcome.stored.path.read_bytes()


def test_missing_active_parent_fails_before_upload_or_pointer_change(
    tmp_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    child = CatalogSet(
        set_id="40000000-0000-4000-8000-000000000001",
        code="child",
        name="Active child",
        set_type="expansion",
        released_at="2026-07-26",
        parent_set_id="40000000-0000-4000-8000-000000000002",
        card_count=0,
        digital=False,
        foil_only=False,
        nonfoil_only=False,
        icon_svg_uri=None,
    )
    empty_catalog = NormalizedCatalog(
        cards_seen=1,
        sets=(child,),
        oracle_cards=(),
        printings=(),
        faces=(),
        legalities=(),
        external_ids=(),
        prices=(),
    )
    store = RecordingSnapshotStore(generation_from_catalog(empty_catalog))
    prior_snapshot_id = store.current_snapshot_id
    storage_root = tmp_path / "storage"

    with pytest.raises(SnapshotGenerationError) as caught:
        publish_active_catalog_snapshot(
            store=store,
            storage=LocalSnapshotStorage(storage_root),
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            schema_path=canonical_snapshot_schema_path,
        )

    assert isinstance(caught.value.__cause__, sqlite3.IntegrityError)
    assert store.current_snapshot_id == prior_snapshot_id
    assert store.requests == []
    assert not storage_root.exists()


def test_same_catalog_source_under_new_import_id_remains_byte_identical(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    original = fixture_generation(cards_fixture_path, sets_fixture_path)
    repromoted = replace(
        original,
        identity=replace(
            original.identity,
            active_import_id="10000000-0000-4000-8000-000000000099",
            catalog_ingested_at="2026-07-26T13:05:00Z",
        ),
        prices=tuple(
            replace(price, ingested_at="2026-07-26T13:05:00Z") for price in original.prices
        ),
    )

    first = create_catalog_snapshot(
        tmp_path / "original.sqlite",
        original,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
    )
    second = create_catalog_snapshot(
        tmp_path / "repromoted.sqlite",
        repromoted,
        api_contract_version="v1",
        minimum_client_version="0.1.0",
        schema_path=canonical_snapshot_schema_path,
    )

    assert first.sha256 == second.sha256
    assert first.path.read_bytes() == second.path.read_bytes()
    assert first.metadata.generated_at == second.metadata.generated_at == OBSERVED_AT


def test_snapshot_generator_rejects_a_size_guard_above_the_manifest_ceiling(
    tmp_path: Path,
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    canonical_snapshot_schema_path: Path,
) -> None:
    generation = fixture_generation(cards_fixture_path, sets_fixture_path)

    with pytest.raises(ValueError, match="1 GiB"):
        create_catalog_snapshot(
            tmp_path / "too-large-bound.sqlite",
            generation,
            api_contract_version="v1",
            minimum_client_version="0.1.0",
            schema_path=canonical_snapshot_schema_path,
            maximum_snapshot_bytes=1_073_741_825,
        )
