from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path

from talence_catalog.versioning import SHA256_PATTERN, validate_catalog_version

SNAPSHOT_SCHEMA_VERSION = 1


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
        if not SHA256_PATTERN.fullmatch(self.source_sha256):
            raise ValueError("source_sha256 must be lowercase SHA-256 text.")
        if not self.api_contract_version:
            raise ValueError("api_contract_version must be non-empty.")
        if not self.minimum_client_version:
            raise ValueError("minimum_client_version must be non-empty.")


@dataclass(frozen=True, slots=True)
class SnapshotValidation:
    quick_check: str
    foreign_key_failures: int
    user_version: int
    counts: SnapshotCounts


@dataclass(frozen=True, slots=True)
class SnapshotArtifact:
    path: Path
    byte_size: int
    sha256: str
    validation: SnapshotValidation


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
        metadata_rows = connection.execute(
            """
            SELECT
              snapshot_schema_version,
              game_code,
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
    if tuple(meta[2:]) != (
        counts.sets,
        counts.oracle_cards,
        counts.printings,
        counts.faces,
        counts.prices,
    ):
        raise ValueError("snapshot_meta record counts do not match table rows.")

    return SnapshotValidation(
        quick_check=quick_check,
        foreign_key_failures=foreign_key_failures,
        user_version=user_version,
        counts=counts,
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
    }
    if table not in allowed_tables:
        raise ValueError(f"Unsupported snapshot table: {table}")
    row = connection.execute(f"SELECT count(*) FROM {table}").fetchone()
    return int(row[0]) if row else 0
