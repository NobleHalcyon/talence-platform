from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import tempfile
import unicodedata
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from talence_catalog.models import (
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    OracleCard,
    PriceObservation,
    Printing,
)
from talence_catalog.snapshot.source import CatalogGenerationReader
from talence_catalog.timestamps import parse_timestamp
from talence_catalog.versioning import SHA256_PATTERN, validate_catalog_version

SNAPSHOT_SCHEMA_VERSION = 1
DEFAULT_MAXIMUM_SNAPSHOT_BYTES = 1_073_741_824
_COLOR_ORDER = ("W", "U", "B", "R", "G")
_FINISH_ORDER = ("nonfoil", "foil", "etched")
_API_CONTRACT_VERSION_PATTERN = re.compile(r"^v[1-9]\d*$")
_MINIMUM_CLIENT_VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[+-][A-Za-z0-9.-]+)?$")


@dataclass(frozen=True, slots=True)
class SnapshotCounts:
    sets: int
    oracle_cards: int
    printings: int
    faces: int
    prices: int

    def __post_init__(self) -> None:
        if (
            min(
                self.sets,
                self.oracle_cards,
                self.printings,
                self.faces,
                self.prices,
            )
            < 0
        ):
            raise ValueError("Snapshot record counts must be nonnegative.")


@dataclass(frozen=True, slots=True)
class SnapshotMetadata:
    catalog_version: str
    generated_at: str
    provider_observed_at: str
    source_sha256: str
    api_contract_version: str
    minimum_client_version: str
    counts: SnapshotCounts

    def __post_init__(self) -> None:
        validate_catalog_version(self.catalog_version)
        parse_timestamp(self.generated_at, label="snapshot generated_at")
        parse_timestamp(
            self.provider_observed_at,
            label="snapshot provider_observed_at",
        )
        if not SHA256_PATTERN.fullmatch(self.source_sha256):
            raise ValueError("source_sha256 must be lowercase SHA-256 text.")
        expected_prefix = f"-{self.source_sha256[:8]}-s{SNAPSHOT_SCHEMA_VERSION}"
        if not self.catalog_version.endswith(expected_prefix):
            raise ValueError("catalog_version must use the supplied combined source identity.")
        if len(self.api_contract_version) > 32 or not _API_CONTRACT_VERSION_PATTERN.fullmatch(
            self.api_contract_version
        ):
            raise ValueError("api_contract_version must use the canonical vN shape.")
        if len(self.minimum_client_version) > 80 or not _MINIMUM_CLIENT_VERSION_PATTERN.fullmatch(
            self.minimum_client_version
        ):
            raise ValueError("minimum_client_version must use the canonical version shape.")


@dataclass(frozen=True, slots=True)
class SnapshotValidation:
    quick_check: str
    foreign_key_failures: int
    user_version: int
    counts: SnapshotCounts
    legalities: int
    external_ids: int
    fts_rows: int


@dataclass(frozen=True, slots=True)
class SnapshotArtifact:
    path: Path
    byte_size: int
    sha256: str
    validation: SnapshotValidation
    metadata: SnapshotMetadata


def locate_canonical_schema(start: Path | None = None) -> Path:
    current = (start or Path(__file__)).resolve()
    for parent in (current, *current.parents):
        candidate = parent / "packages" / "contracts" / "canonical" / "edge-catalog-schema.sql"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Unable to locate canonical edge-catalog-schema.sql.")


def create_snapshot_shell(
    output_path: Path,
    metadata: SnapshotMetadata,
    *,
    schema_path: Path | None = None,
) -> SnapshotArtifact:
    """Create an immutable schema-valid snapshot shell without catalog rows."""

    if metadata.counts != SnapshotCounts(0, 0, 0, 0, 0):
        raise ValueError("Phase 0 snapshot shell supports zero record counts only.")

    resolved_output = output_path.resolve()
    if resolved_output.exists():
        raise FileExistsError(f"Snapshot artifact already exists: {resolved_output}")
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    schema = (schema_path or locate_canonical_schema()).read_text(encoding="utf-8")

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=resolved_output.parent,
            prefix=f".{resolved_output.name}.",
            suffix=".part",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        connection = sqlite3.connect(temporary_path)
        try:
            connection.executescript(schema)
            connection.execute(
                """
                INSERT INTO snapshot_meta (
                  singleton_id,
                  catalog_version,
                  snapshot_schema_version,
                  game_code,
                  generated_at,
                  provider_observed_at,
                  source_sha256,
                  api_contract_version,
                  minimum_client_version,
                  sets_count,
                  oracle_cards_count,
                  printings_count,
                  faces_count,
                  prices_count
                ) VALUES (1, ?, 1, 'mtg', ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)
                """,
                (
                    metadata.catalog_version,
                    metadata.generated_at,
                    metadata.provider_observed_at,
                    metadata.source_sha256,
                    metadata.api_contract_version,
                    metadata.minimum_client_version,
                ),
            )
            connection.commit()
            connection.execute("VACUUM")
        finally:
            connection.close()

        validation = validate_snapshot(temporary_path)
        os.replace(temporary_path, resolved_output)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    byte_size, sha256 = snapshot_digest(resolved_output)
    return SnapshotArtifact(
        path=resolved_output,
        byte_size=byte_size,
        sha256=sha256,
        validation=validation,
        metadata=metadata,
    )


def create_catalog_snapshot(
    output_path: Path,
    generation: CatalogGenerationReader,
    *,
    api_contract_version: str,
    minimum_client_version: str,
    schema_path: Path | None = None,
    batch_size: int = 5_000,
    maximum_snapshot_bytes: int = DEFAULT_MAXIMUM_SNAPSHOT_BYTES,
) -> SnapshotArtifact:
    """Stream one locked catalog generation into the canonical SQLite contract."""

    if batch_size <= 0:
        raise ValueError("Snapshot batch_size must be positive.")
    if not 0 < maximum_snapshot_bytes <= DEFAULT_MAXIMUM_SNAPSHOT_BYTES:
        raise ValueError(
            "maximum_snapshot_bytes must be between 1 and the canonical 1 GiB ceiling."
        )

    resolved_output = output_path.resolve()
    if resolved_output.exists():
        raise FileExistsError(f"Snapshot artifact already exists: {resolved_output}")
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    schema = (schema_path or locate_canonical_schema()).read_text(encoding="utf-8")

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=resolved_output.parent,
            prefix=f".{resolved_output.name}.",
            suffix=".part",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        connection = sqlite3.connect(temporary_path)
        try:
            connection.executescript(schema)
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("PRAGMA defer_foreign_keys = ON")
            counts, legalities, external_ids = _populate_catalog(
                connection,
                generation,
                batch_size=batch_size,
            )
            metadata = SnapshotMetadata(
                catalog_version=generation.identity.catalog_version,
                # The provider observation is part of catalog-version identity,
                # unlike the worker's mutable local download timestamp.
                generated_at=generation.identity.provider_observed_at,
                provider_observed_at=generation.identity.provider_observed_at,
                source_sha256=generation.identity.catalog_identity_sha256,
                api_contract_version=api_contract_version,
                minimum_client_version=minimum_client_version,
                counts=counts,
            )
            _insert_snapshot_metadata(connection, metadata)
            connection.execute(
                "INSERT INTO oracle_cards_fts(oracle_cards_fts) VALUES('integrity-check')"
            )
            connection.commit()
            connection.execute("VACUUM")
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        validation = validate_snapshot(temporary_path)
        if validation.legalities != legalities or validation.external_ids != external_ids:
            raise ValueError("Snapshot auxiliary record counts changed while writing.")
        byte_size, sha256 = snapshot_digest(temporary_path)
        if byte_size > maximum_snapshot_bytes:
            raise ValueError(
                f"SQLite snapshot exceeds maximum size ({byte_size} > {maximum_snapshot_bytes})."
            )
        # Windows requires a writable handle for FlushFileBuffers, which is what
        # os.fsync delegates to. The snapshot bytes are not modified here.
        with temporary_path.open("r+b") as built:
            os.fsync(built.fileno())
        os.replace(temporary_path, resolved_output)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return SnapshotArtifact(
        path=resolved_output,
        byte_size=byte_size,
        sha256=sha256,
        validation=validation,
        metadata=metadata,
    )


def validate_snapshot(snapshot_path: Path) -> SnapshotValidation:
    connection = sqlite3.connect(f"file:{snapshot_path.resolve()}?mode=ro", uri=True)
    try:
        quick_check_row = connection.execute("PRAGMA quick_check").fetchone()
        quick_check = str(quick_check_row[0]) if quick_check_row else "missing"
        foreign_key_failures = len(connection.execute("PRAGMA foreign_key_check").fetchall())
        user_version_row = connection.execute("PRAGMA user_version").fetchone()
        user_version = int(user_version_row[0]) if user_version_row else 0
        counts = SnapshotCounts(
            sets=_table_count(connection, "sets"),
            oracle_cards=_table_count(connection, "oracle_cards"),
            printings=_table_count(connection, "printings"),
            faces=_table_count(connection, "faces"),
            prices=_table_count(connection, "current_prices"),
        )
        legalities = _table_count(connection, "legalities")
        external_ids = _table_count(connection, "external_ids")
        fts_rows = _table_count(connection, "oracle_cards_fts")
        metadata_rows = connection.execute(
            """
            SELECT
              snapshot_schema_version,
              game_code,
              catalog_version,
              generated_at,
              provider_observed_at,
              source_sha256,
              api_contract_version,
              minimum_client_version,
              sets_count,
              oracle_cards_count,
              printings_count,
              faces_count,
              prices_count
            FROM snapshot_meta
            """
        ).fetchall()
    finally:
        connection.close()

    if quick_check != "ok":
        raise ValueError(f"SQLite quick_check failed: {quick_check}")
    if foreign_key_failures != 0:
        raise ValueError("SQLite foreign_key_check returned failures.")
    if user_version != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError(f"Unexpected SQLite user_version: {user_version}")
    if len(metadata_rows) != 1:
        raise ValueError("snapshot_meta must contain exactly one row.")

    meta = metadata_rows[0]
    if meta[0] != SNAPSHOT_SCHEMA_VERSION or meta[1] != "mtg":
        raise ValueError("snapshot_meta schema/game identity is invalid.")
    validate_catalog_version(str(meta[2]))
    parse_timestamp(str(meta[3]), label="snapshot generated_at")
    parse_timestamp(str(meta[4]), label="snapshot provider_observed_at")
    if not SHA256_PATTERN.fullmatch(str(meta[5])):
        raise ValueError("snapshot_meta source identity is invalid.")
    expected_version_suffix = f"-{str(meta[5])[:8]}-s{SNAPSHOT_SCHEMA_VERSION}"
    if not str(meta[2]).endswith(expected_version_suffix):
        raise ValueError("snapshot_meta catalog/source identity is inconsistent.")
    if not _API_CONTRACT_VERSION_PATTERN.fullmatch(
        str(meta[6])
    ) or not _MINIMUM_CLIENT_VERSION_PATTERN.fullmatch(str(meta[7])):
        raise ValueError("snapshot_meta compatibility metadata is invalid.")
    if tuple(meta[8:]) != (
        counts.sets,
        counts.oracle_cards,
        counts.printings,
        counts.faces,
        counts.prices,
    ):
        raise ValueError("snapshot_meta record counts do not match table rows.")
    if fts_rows != counts.oracle_cards:
        raise ValueError("SQLite FTS rows do not match oracle-card rows.")

    connection = sqlite3.connect(f"file:{snapshot_path.resolve()}?mode=ro", uri=True)
    try:
        fts_orphans = connection.execute(
            """
            SELECT count(*)
            FROM oracle_cards_fts AS search
            LEFT JOIN oracle_cards AS card ON card.rowid = search.rowid
            WHERE card.rowid IS NULL
            """
        ).fetchone()
        external_orphans = connection.execute(
            """
            SELECT count(*)
            FROM external_ids AS external_id
            WHERE
              (
                external_id.entity_type = 'oracle_card'
                AND NOT EXISTS (
                  SELECT 1
                  FROM oracle_cards AS card
                  WHERE card.oracle_card_id = external_id.entity_id
                )
              )
              OR (
                external_id.entity_type = 'printing'
                AND NOT EXISTS (
                  SELECT 1
                  FROM printings AS printing
                  WHERE printing.printing_id = external_id.entity_id
                )
              )
              OR (
                external_id.entity_type = 'set'
                AND NOT EXISTS (
                  SELECT 1
                  FROM sets AS catalog_set
                  WHERE catalog_set.set_id = external_id.entity_id
                )
              )
            """
        ).fetchone()
    finally:
        connection.close()
    if fts_orphans is None or int(fts_orphans[0]) != 0:
        raise ValueError("SQLite FTS row identity does not match oracle cards.")
    if external_orphans is None or int(external_orphans[0]) != 0:
        raise ValueError("SQLite external IDs contain unknown entity references.")

    return SnapshotValidation(
        quick_check=quick_check,
        foreign_key_failures=foreign_key_failures,
        user_version=user_version,
        counts=counts,
        legalities=legalities,
        external_ids=external_ids,
        fts_rows=fts_rows,
    )


def snapshot_digest(snapshot_path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    byte_size = 0
    with snapshot_path.open("rb") as snapshot:
        while chunk := snapshot.read(1024 * 1024):
            digest.update(chunk)
            byte_size += len(chunk)
    return byte_size, digest.hexdigest()


def _table_count(connection: sqlite3.Connection, table: str) -> int:
    allowed_tables = {
        "sets",
        "oracle_cards",
        "printings",
        "faces",
        "current_prices",
        "legalities",
        "external_ids",
        "oracle_cards_fts",
    }
    if table not in allowed_tables:
        raise ValueError(f"Unsupported snapshot table: {table}")
    row = connection.execute(f"SELECT count(*) FROM {table}").fetchone()
    return int(row[0]) if row else 0


def _populate_catalog(
    connection: sqlite3.Connection,
    generation: CatalogGenerationReader,
    *,
    batch_size: int,
) -> tuple[SnapshotCounts, int, int]:
    sets = _insert_ordered(
        connection,
        """
        INSERT INTO sets (
          set_id, code, name, set_type, released_at, parent_set_id, digital, icon_svg_uri
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        generation.iter_sets(),
        key=lambda row: (row.set_id,),
        values=_set_values,
        batch_size=batch_size,
        label="sets",
    )
    oracle_cards = _insert_ordered(
        connection,
        """
        INSERT INTO oracle_cards (
          rowid,
          oracle_card_id,
          name,
          normalized_name,
          mana_cost,
          mana_value,
          type_line,
          oracle_text,
          colors_json,
          color_identity_json,
          keywords_json,
          reserved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        generation.iter_oracle_cards(),
        key=lambda row: (row.oracle_card_id,),
        values=_oracle_card_values,
        batch_size=batch_size,
        label="oracle_cards",
        after_batch=_insert_fts_batch,
    )
    printings = _insert_ordered(
        connection,
        """
        INSERT INTO printings (
          printing_id,
          oracle_card_id,
          set_id,
          collector_number,
          language,
          printed_name,
          rarity,
          layout,
          released_at,
          digital,
          promo,
          oversized,
          variation,
          finishes_json,
          frame_effects_json,
          border_color,
          artist,
          scryfall_uri,
          default_browse
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        generation.iter_printings(),
        key=lambda row: (row.printing_id,),
        values=_printing_values,
        batch_size=batch_size,
        label="printings",
    )
    faces = _insert_ordered(
        connection,
        """
        INSERT INTO faces (
          face_id,
          printing_id,
          face_index,
          name,
          mana_cost,
          type_line,
          oracle_text,
          colors_json,
          power,
          toughness,
          loyalty,
          defense,
          artist,
          image_small_uri,
          image_normal_uri,
          image_large_uri,
          image_png_uri,
          art_crop_uri,
          border_crop_uri
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        generation.iter_faces(),
        key=lambda row: (row.face_id,),
        values=_face_values,
        batch_size=batch_size,
        label="faces",
    )
    legalities = _insert_ordered(
        connection,
        """
        INSERT INTO legalities (oracle_card_id, format_code, legality)
        VALUES (?, ?, ?)
        """,
        generation.iter_legalities(),
        key=lambda row: (row.oracle_card_id, row.format_code),
        values=_legality_values,
        batch_size=batch_size,
        label="legalities",
    )
    prices = _insert_ordered(
        connection,
        """
        INSERT INTO current_prices (
          printing_id, provider, currency, finish, amount, observed_at, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        generation.iter_prices(),
        key=lambda row: (row.printing_id, row.provider, row.currency, row.finish),
        values=lambda row, ordinal: _price_values(
            row,
            ordinal,
            ingested_at=generation.identity.provider_observed_at,
        ),
        batch_size=batch_size,
        label="current_prices",
    )
    external_ids = _insert_ordered(
        connection,
        """
        INSERT INTO external_ids (
          entity_type, entity_id, provider, identifier_type, identifier_value
        ) VALUES (?, ?, ?, ?, ?)
        """,
        generation.iter_external_ids(),
        key=lambda row: (row.provider, row.identifier_type, row.identifier_value),
        values=_external_id_values,
        batch_size=batch_size,
        label="external_ids",
    )
    return (
        SnapshotCounts(
            sets=sets,
            oracle_cards=oracle_cards,
            printings=printings,
            faces=faces,
            prices=prices,
        ),
        legalities,
        external_ids,
    )


def _insert_ordered[T](
    connection: sqlite3.Connection,
    statement: str,
    records: Iterator[T],
    *,
    key: Callable[[T], tuple[str, ...]],
    values: Callable[[T, int], tuple[object, ...]],
    batch_size: int,
    label: str,
    after_batch: Callable[[sqlite3.Connection, list[tuple[object, ...]]], None] | None = None,
) -> int:
    previous_key: tuple[str, ...] | None = None
    count = 0
    batch: list[tuple[object, ...]] = []
    for record in records:
        record_key = key(record)
        if previous_key is not None and record_key <= previous_key:
            raise ValueError(f"Snapshot source {label} rows are not in unique PK order.")
        previous_key = record_key
        count += 1
        batch.append(values(record, count))
        if len(batch) >= batch_size:
            connection.executemany(statement, batch)
            if after_batch is not None:
                after_batch(connection, batch)
            batch.clear()
    if batch:
        connection.executemany(statement, batch)
        if after_batch is not None:
            after_batch(connection, batch)
    return count


def _insert_fts_batch(
    connection: sqlite3.Connection,
    oracle_rows: list[tuple[object, ...]],
) -> None:
    connection.executemany(
        """
        INSERT INTO oracle_cards_fts (
          rowid, oracle_card_id, name, normalized_name, type_line, oracle_text
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                row[0],
                row[1],
                row[2],
                row[3],
                row[6],
                row[7],
            )
            for row in oracle_rows
        ],
    )


def _set_values(row: CatalogSet, _: int) -> tuple[object, ...]:
    return (
        row.set_id,
        row.code,
        row.name,
        row.set_type,
        row.released_at,
        row.parent_set_id,
        int(row.digital),
        row.icon_svg_uri,
    )


def _oracle_card_values(row: OracleCard, ordinal: int) -> tuple[object, ...]:
    return (
        ordinal,
        row.oracle_card_id,
        row.name,
        row.normalized_name,
        row.mana_cost,
        _optional_decimal_text(row.mana_value),
        row.type_line,
        row.oracle_text,
        _canonical_array(row.colors, preferred_order=_COLOR_ORDER),
        _canonical_array(row.color_identity, preferred_order=_COLOR_ORDER),
        _canonical_array(row.keywords),
        int(row.reserved),
    )


def _printing_values(row: Printing, _: int) -> tuple[object, ...]:
    return (
        row.printing_id,
        row.oracle_card_id,
        row.set_id,
        row.collector_number,
        row.language,
        row.printed_name,
        row.rarity,
        row.layout,
        row.released_at,
        int(row.digital),
        int(row.promo),
        int(row.oversized),
        int(row.variation),
        _canonical_array(row.finishes, preferred_order=_FINISH_ORDER),
        _canonical_array(row.frame_effects),
        row.border_color,
        row.artist,
        row.scryfall_uri,
        int(row.default_browse),
    )


def _face_values(row: Face, _: int) -> tuple[object, ...]:
    return (
        row.face_id,
        row.printing_id,
        row.face_index,
        row.name,
        row.mana_cost,
        row.type_line,
        row.oracle_text,
        _canonical_array(row.colors, preferred_order=_COLOR_ORDER),
        row.power,
        row.toughness,
        row.loyalty,
        row.defense,
        row.artist,
        row.image_small_uri,
        row.image_normal_uri,
        row.image_large_uri,
        row.image_png_uri,
        row.art_crop_uri,
        row.border_crop_uri,
    )


def _legality_values(row: Legality, _: int) -> tuple[object, ...]:
    return row.oracle_card_id, row.format_code, row.legality


def _price_values(
    row: PriceObservation,
    _: int,
    *,
    ingested_at: str,
) -> tuple[object, ...]:
    return (
        row.printing_id,
        row.provider,
        row.currency,
        row.finish,
        _decimal_text(row.amount),
        row.observed_at,
        ingested_at,
    )


def _external_id_values(
    row: ExternalIdentifier,
    _: int,
) -> tuple[object, ...]:
    entity_type = "oracle_card" if row.entity_type == "card" else row.entity_type
    return (
        entity_type,
        row.entity_id,
        row.provider,
        row.identifier_type,
        row.identifier_value,
    )


def _canonical_array(
    values: tuple[str, ...],
    *,
    preferred_order: tuple[str, ...] = (),
) -> str:
    normalized = tuple(unicodedata.normalize("NFC", value) for value in values)
    if len(set(normalized)) != len(normalized):
        raise ValueError("Snapshot arrays may not contain duplicate values.")
    rank = {value: index for index, value in enumerate(preferred_order)}
    ordered = sorted(
        normalized,
        key=lambda value: (rank.get(value, len(rank)), value),
    )
    return json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))


def _decimal_text(value: Decimal) -> str:
    if not value.is_finite():
        raise ValueError("Snapshot decimal values must be finite.")
    plain = format(value, "f")
    if "." in plain:
        plain = plain.rstrip("0").rstrip(".")
    return "0" if plain in {"-0", "+0"} else plain


def _optional_decimal_text(value: Decimal | None) -> str | None:
    return None if value is None else _decimal_text(value)


def _insert_snapshot_metadata(
    connection: sqlite3.Connection,
    metadata: SnapshotMetadata,
) -> None:
    connection.execute(
        """
        INSERT INTO snapshot_meta (
          singleton_id,
          catalog_version,
          snapshot_schema_version,
          game_code,
          generated_at,
          provider_observed_at,
          source_sha256,
          api_contract_version,
          minimum_client_version,
          sets_count,
          oracle_cards_count,
          printings_count,
          faces_count,
          prices_count
        ) VALUES (1, ?, 1, 'mtg', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            metadata.catalog_version,
            metadata.generated_at,
            metadata.provider_observed_at,
            metadata.source_sha256,
            metadata.api_contract_version,
            metadata.minimum_client_version,
            metadata.counts.sets,
            metadata.counts.oracle_cards,
            metadata.counts.printings,
            metadata.counts.faces,
            metadata.counts.prices,
        ),
    )
