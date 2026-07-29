from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol, cast

from psycopg import Connection

from talence_catalog.models import (
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    OracleCard,
    PriceObservation,
    Printing,
)
from talence_catalog.timestamps import format_timestamp
from talence_catalog.versioning import build_catalog_version

CATALOG_PROMOTION_LOCK_KEY = "talence:catalog-promotion"


class CatalogSnapshotSourceError(RuntimeError):
    """Raised when one coherent active catalog generation cannot be exported."""


@dataclass(frozen=True, slots=True)
class CatalogGenerationIdentity:
    active_import_id: str
    catalog_version: str
    provider_observed_at: str
    catalog_identity_sha256: str
    source_downloaded_at: str
    catalog_ingested_at: str

    def __post_init__(self) -> None:
        expected_version = build_catalog_version(
            self.provider_observed_at,
            self.catalog_identity_sha256,
            snapshot_schema_version=1,
        )
        if self.catalog_version != expected_version:
            raise ValueError(
                "The active catalog version does not match its combined catalog identity."
            )


class CatalogGenerationReader(Protocol):
    """A repeatable-read view whose iterators yield deterministic primary-key order."""

    identity: CatalogGenerationIdentity

    def iter_sets(self) -> Iterator[CatalogSet]: ...

    def iter_oracle_cards(self) -> Iterator[OracleCard]: ...

    def iter_printings(self) -> Iterator[Printing]: ...

    def iter_faces(self) -> Iterator[Face]: ...

    def iter_legalities(self) -> Iterator[Legality]: ...

    def iter_prices(self) -> Iterator[PriceObservation]: ...

    def iter_external_ids(self) -> Iterator[ExternalIdentifier]: ...


@dataclass(frozen=True, slots=True)
class InMemoryCatalogGeneration:
    """Fixture source with the same ordering guarantees as PostgreSQL export."""

    identity: CatalogGenerationIdentity
    sets: tuple[CatalogSet, ...] = ()
    oracle_cards: tuple[OracleCard, ...] = ()
    printings: tuple[Printing, ...] = ()
    faces: tuple[Face, ...] = ()
    legalities: tuple[Legality, ...] = ()
    prices: tuple[PriceObservation, ...] = ()
    external_ids: tuple[ExternalIdentifier, ...] = ()

    def iter_sets(self) -> Iterator[CatalogSet]:
        yield from sorted(self.sets, key=lambda row: row.set_id)

    def iter_oracle_cards(self) -> Iterator[OracleCard]:
        yield from sorted(self.oracle_cards, key=lambda row: row.oracle_card_id)

    def iter_printings(self) -> Iterator[Printing]:
        yield from sorted(self.printings, key=lambda row: row.printing_id)

    def iter_faces(self) -> Iterator[Face]:
        yield from sorted(self.faces, key=lambda row: row.face_id)

    def iter_legalities(self) -> Iterator[Legality]:
        yield from sorted(
            self.legalities,
            key=lambda row: (row.oracle_card_id, row.format_code),
        )

    def iter_prices(self) -> Iterator[PriceObservation]:
        yield from sorted(
            self.prices,
            key=lambda row: (row.printing_id, row.provider, row.currency, row.finish),
        )

    def iter_external_ids(self) -> Iterator[ExternalIdentifier]:
        yield from sorted(
            self.external_ids,
            key=lambda row: (row.provider, row.identifier_type, row.identifier_value),
        )


class PostgresCatalogGeneration:
    """Streaming reader held inside the caller's repeatable-read transaction."""

    def __init__(
        self,
        connection: Connection[Any],
        identity: CatalogGenerationIdentity,
        *,
        batch_size: int,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("Snapshot source batch_size must be positive.")
        self._connection = connection
        self._batch_size = batch_size
        self.identity = identity

    def iter_sets(self) -> Iterator[CatalogSet]:
        for row in self._rows(
            "snapshot_sets",
            """
            SELECT
              catalog_set.id::text,
              catalog_set.code,
              catalog_set.name,
              catalog_set.set_type,
              catalog_set.released_at::text,
              catalog_set.parent_set_id::text,
              catalog_set.card_count,
              catalog_set.digital,
              catalog_set.foil_only,
              catalog_set.nonfoil_only,
              catalog_set.icon_svg_uri
            FROM public.catalog_sets AS catalog_set
            JOIN public.games AS game ON game.id = catalog_set.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND catalog_set.active
            ORDER BY catalog_set.id
            """,
        ):
            yield CatalogSet(
                set_id=row[0],
                code=row[1],
                name=row[2],
                set_type=row[3],
                released_at=row[4],
                parent_set_id=row[5],
                card_count=row[6],
                digital=row[7],
                foil_only=row[8],
                nonfoil_only=row[9],
                icon_svg_uri=row[10],
            )

    def iter_oracle_cards(self) -> Iterator[OracleCard]:
        for row in self._rows(
            "snapshot_oracle_cards",
            """
            SELECT
              card.id::text,
              card.name,
              card.normalized_name,
              card.mana_cost,
              card.mana_value,
              card.type_line,
              card.oracle_text,
              card.colors,
              card.color_identity,
              card.keywords,
              card.reserved
            FROM public.catalog_cards AS card
            JOIN public.games AS game ON game.id = card.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND card.active
            ORDER BY card.id
            """,
        ):
            yield OracleCard(
                oracle_card_id=row[0],
                name=row[1],
                normalized_name=row[2],
                mana_cost=row[3],
                mana_value=cast(Decimal | None, row[4]),
                type_line=row[5],
                oracle_text=row[6],
                colors=tuple(row[7]),
                color_identity=tuple(row[8]),
                keywords=tuple(row[9]),
                reserved=row[10],
            )

    def iter_printings(self) -> Iterator[Printing]:
        for row in self._rows(
            "snapshot_printings",
            """
            SELECT
              printing.id::text,
              printing.card_id::text,
              printing.set_id::text,
              printing.collector_number,
              printing.language,
              printing.printed_name,
              printing.rarity,
              printing.layout,
              printing.released_at::text,
              printing.digital,
              printing.promo,
              printing.oversized,
              printing.variation,
              printing.finishes::text[],
              printing.color_identity,
              printing.frame_effects,
              printing.border_color,
              printing.artist,
              printing.scryfall_uri,
              printing.image_status,
              printing.is_default_browse
            FROM public.catalog_printings AS printing
            JOIN public.games AS game ON game.id = printing.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND printing.active
            ORDER BY printing.id
            """,
        ):
            yield Printing(
                printing_id=row[0],
                oracle_card_id=row[1],
                set_id=row[2],
                collector_number=row[3],
                language=row[4],
                printed_name=row[5],
                rarity=row[6],
                layout=row[7],
                released_at=row[8],
                digital=row[9],
                promo=row[10],
                oversized=row[11],
                variation=row[12],
                finishes=tuple(row[13]),
                color_identity=tuple(row[14]),
                frame_effects=tuple(row[15]),
                border_color=row[16],
                artist=row[17],
                scryfall_uri=row[18],
                image_status=row[19],
                default_browse=row[20],
            )

    def iter_faces(self) -> Iterator[Face]:
        for row in self._rows(
            "snapshot_faces",
            """
            SELECT
              face.id::text,
              face.printing_id::text,
              face.face_index,
              face.name,
              face.mana_cost,
              face.type_line,
              face.oracle_text,
              face.colors,
              face.power,
              face.toughness,
              face.loyalty,
              face.defense,
              face.artist,
              face.image_small_uri,
              face.image_normal_uri,
              face.image_large_uri,
              face.image_png_uri,
              face.art_crop_uri,
              face.border_crop_uri
            FROM public.catalog_faces AS face
            JOIN public.catalog_printings AS printing
              ON printing.id = face.printing_id
            JOIN public.games AS game ON game.id = printing.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND printing.active
            ORDER BY face.id
            """,
        ):
            yield Face(
                face_id=row[0],
                printing_id=row[1],
                face_index=row[2],
                name=row[3],
                mana_cost=row[4],
                type_line=row[5],
                oracle_text=row[6],
                colors=tuple(row[7]),
                power=row[8],
                toughness=row[9],
                loyalty=row[10],
                defense=row[11],
                artist=row[12],
                image_small_uri=row[13],
                image_normal_uri=row[14],
                image_large_uri=row[15],
                image_png_uri=row[16],
                art_crop_uri=row[17],
                border_crop_uri=row[18],
            )

    def iter_legalities(self) -> Iterator[Legality]:
        for row in self._rows(
            "snapshot_legalities",
            """
            SELECT
              legality.card_id::text,
              legality.format_code,
              legality.legality
            FROM public.catalog_legalities AS legality
            JOIN public.catalog_cards AS card ON card.id = legality.card_id
            JOIN public.games AS game ON game.id = card.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND card.active
            ORDER BY legality.card_id, legality.format_code
            """,
        ):
            yield Legality(
                oracle_card_id=row[0],
                format_code=row[1],
                legality=row[2],
            )

    def iter_prices(self) -> Iterator[PriceObservation]:
        for row in self._rows(
            "snapshot_prices",
            """
            SELECT
              price.printing_id::text,
              price.provider,
              price.currency,
              price.finish::text,
              price.amount,
              price.observed_at,
              price.ingested_at,
              price.stale_after
            FROM public.current_prices AS price
            JOIN public.catalog_printings AS printing
              ON printing.id = price.printing_id
            JOIN public.games AS game ON game.id = printing.game_id
            WHERE game.code = 'mtg'
              AND game.active
              AND printing.active
            ORDER BY
              price.printing_id,
              price.provider,
              price.currency,
              price.finish::text
            """,
        ):
            yield PriceObservation(
                printing_id=row[0],
                provider=row[1],
                currency=row[2],
                finish=row[3],
                amount=cast(Decimal, row[4]),
                observed_at=_timestamp(row[5]),
                ingested_at=_timestamp(row[6]),
                stale_after=_optional_timestamp(row[7]),
            )

    def iter_external_ids(self) -> Iterator[ExternalIdentifier]:
        for row in self._rows(
            "snapshot_external_ids",
            """
            SELECT
              external_id.entity_type,
              external_id.entity_id::text,
              external_id.provider,
              external_id.identifier_type,
              external_id.identifier_value
            FROM public.catalog_external_ids AS external_id
            WHERE
              (
                external_id.entity_type = 'card'
                AND EXISTS (
                  SELECT 1
                  FROM public.catalog_cards AS card
                  JOIN public.games AS game ON game.id = card.game_id
                  WHERE card.id = external_id.entity_id
                    AND game.code = 'mtg'
                    AND game.active
                    AND card.active
                )
              )
              OR (
                external_id.entity_type = 'printing'
                AND EXISTS (
                  SELECT 1
                  FROM public.catalog_printings AS printing
                  JOIN public.games AS game ON game.id = printing.game_id
                  WHERE printing.id = external_id.entity_id
                    AND game.code = 'mtg'
                    AND game.active
                    AND printing.active
                )
              )
              OR (
                external_id.entity_type = 'set'
                AND EXISTS (
                  SELECT 1
                  FROM public.catalog_sets AS catalog_set
                  JOIN public.games AS game ON game.id = catalog_set.game_id
                  WHERE catalog_set.id = external_id.entity_id
                    AND game.code = 'mtg'
                    AND game.active
                    AND catalog_set.active
                )
              )
            ORDER BY
              external_id.provider,
              external_id.identifier_type,
              external_id.identifier_value
            """,
        ):
            yield ExternalIdentifier(
                entity_type=row[0],
                entity_id=row[1],
                provider=row[2],
                identifier_type=row[3],
                identifier_value=row[4],
            )

    def _rows(self, name: str, statement: str) -> Iterator[tuple[Any, ...]]:
        with self._connection.cursor(name=name) as cursor:
            cursor.itersize = self._batch_size
            cursor.execute(statement)
            yield from cursor


@contextmanager
def postgres_catalog_generation(
    connection: Connection[Any],
    *,
    batch_size: int,
) -> Iterator[PostgresCatalogGeneration]:
    """Hold one active catalog generation stable while every source row streams."""

    with connection.transaction():
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        connection.execute(
            """
            SELECT pg_advisory_xact_lock_shared(
              hashtextextended(%(lock_key)s, 0)
            )
            """,
            {"lock_key": CATALOG_PROMOTION_LOCK_KEY},
        )
        row = connection.execute(
            """
            SELECT
              state.active_import_id::text,
              state.active_catalog_version,
              source.provider_updated_at,
              source.catalog_identity_sha256,
              source.downloaded_at,
              import_run.completed_at
            FROM public.catalog_state AS state
            JOIN public.catalog_import_runs AS import_run
              ON import_run.id = state.active_import_id
             AND import_run.status = 'succeeded'::public.job_status
             AND import_run.catalog_version = state.active_catalog_version
            JOIN public.catalog_source_files AS source
              ON source.id = import_run.source_file_id
             AND source.status = 'succeeded'::public.job_status
            WHERE state.singleton_id = 1
            """
        ).fetchone()
        if row is None:
            raise CatalogSnapshotSourceError(
                "No complete active catalog generation is available for a snapshot."
            )
        if not isinstance(row[3], str):
            raise CatalogSnapshotSourceError(
                "The active catalog is missing its combined catalog identity."
            )
        try:
            identity = CatalogGenerationIdentity(
                active_import_id=row[0],
                catalog_version=row[1],
                provider_observed_at=_timestamp(row[2]),
                catalog_identity_sha256=row[3],
                source_downloaded_at=_timestamp(row[4]),
                catalog_ingested_at=_timestamp(row[5]),
            )
        except ValueError as error:
            raise CatalogSnapshotSourceError(
                "The active catalog generation identity is inconsistent."
            ) from error
        yield PostgresCatalogGeneration(
            connection,
            identity,
            batch_size=batch_size,
        )


def _timestamp(value: object) -> str:
    if not isinstance(value, datetime):
        raise CatalogSnapshotSourceError("Catalog timestamp has an invalid database shape.")
    return format_timestamp(value)


def _optional_timestamp(value: object) -> str | None:
    return None if value is None else _timestamp(value)
