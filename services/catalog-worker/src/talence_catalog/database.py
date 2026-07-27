from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Any

import psycopg
from psycopg import Connection

from talence_catalog.download import DownloadResult
from talence_catalog.models import (
    CatalogSet,
    ExternalIdentifier,
    Face,
    Legality,
    NormalizedBatch,
    OracleCard,
    PriceObservation,
    Printing,
)
from talence_catalog.provider.scryfall import BulkDataDescriptor
from talence_catalog.store import (
    CatalogStoreError,
    CatalogSyncDisabledError,
    CatalogValidationError,
    ImportRegistration,
    ImportValidation,
    PromotionResult,
    QueuedNoopCompletion,
    SourceFileRegistration,
)

MAX_DATABASE_ERROR_SUMMARY_LENGTH = 500
type StageRecord = (
    CatalogSet | OracleCard | Printing | Face | Legality | ExternalIdentifier | PriceObservation
)


@dataclass(frozen=True, slots=True)
class StageSpec:
    attribute: str
    table: str
    key_columns: tuple[str, ...]
    columns: tuple[str, ...]
    casts: Mapping[str, str]


STAGE_SPECS = (
    StageSpec(
        attribute="sets",
        table="catalog_stage_sets",
        key_columns=("import_run_id", "set_id"),
        columns=(
            "import_run_id",
            "set_id",
            "code",
            "name",
            "set_type",
            "released_at",
            "parent_set_id",
            "card_count",
            "digital",
            "foil_only",
            "nonfoil_only",
            "icon_svg_uri",
        ),
        casts={},
    ),
    StageSpec(
        attribute="oracle_cards",
        table="catalog_stage_cards",
        key_columns=("import_run_id", "oracle_card_id"),
        columns=(
            "import_run_id",
            "oracle_card_id",
            "name",
            "normalized_name",
            "mana_cost",
            "mana_value",
            "type_line",
            "oracle_text",
            "colors",
            "color_identity",
            "keywords",
            "reserved",
        ),
        casts={},
    ),
    StageSpec(
        attribute="printings",
        table="catalog_stage_printings",
        key_columns=("import_run_id", "printing_id"),
        columns=(
            "import_run_id",
            "printing_id",
            "oracle_card_id",
            "set_id",
            "collector_number",
            "language",
            "printed_name",
            "rarity",
            "layout",
            "released_at",
            "digital",
            "promo",
            "oversized",
            "variation",
            "finishes",
            "color_identity",
            "frame_effects",
            "border_color",
            "artist",
            "scryfall_uri",
            "image_status",
            "default_browse",
        ),
        casts={"finishes": "public.card_finish[]"},
    ),
    StageSpec(
        attribute="faces",
        table="catalog_stage_faces",
        key_columns=("import_run_id", "face_id"),
        columns=(
            "import_run_id",
            "face_id",
            "printing_id",
            "face_index",
            "name",
            "mana_cost",
            "type_line",
            "oracle_text",
            "colors",
            "power",
            "toughness",
            "loyalty",
            "defense",
            "artist",
            "image_small_uri",
            "image_normal_uri",
            "image_large_uri",
            "image_png_uri",
            "art_crop_uri",
            "border_crop_uri",
        ),
        casts={},
    ),
    StageSpec(
        attribute="legalities",
        table="catalog_stage_legalities",
        key_columns=("import_run_id", "oracle_card_id", "format_code"),
        columns=(
            "import_run_id",
            "oracle_card_id",
            "format_code",
            "legality",
        ),
        casts={},
    ),
    StageSpec(
        attribute="external_ids",
        table="catalog_stage_external_ids",
        key_columns=(
            "import_run_id",
            "provider",
            "identifier_type",
            "identifier_value",
        ),
        columns=(
            "import_run_id",
            "entity_type",
            "entity_id",
            "provider",
            "identifier_type",
            "identifier_value",
        ),
        casts={},
    ),
    StageSpec(
        attribute="prices",
        table="catalog_stage_prices",
        key_columns=(
            "import_run_id",
            "printing_id",
            "provider",
            "currency",
            "finish",
        ),
        columns=(
            "import_run_id",
            "printing_id",
            "provider",
            "currency",
            "finish",
            "amount",
            "observed_at",
            "ingested_at",
            "stale_after",
        ),
        casts={"finish": "public.card_finish"},
    ),
)


class PostgresCatalogStore:
    """Psycopg implementation of the private Phase 2 catalog worker contract."""

    def __init__(self, connection: Connection[Any], *, owns_connection: bool = False) -> None:
        self._connection = connection
        self._owns_connection = owns_connection

    @classmethod
    def connect(cls, database_url: str) -> PostgresCatalogStore:
        if not database_url:
            raise ValueError("A non-empty catalog worker database URL is required.")
        try:
            connection = psycopg.connect(
                database_url,
                application_name="talence-catalog-worker",
            )
        except psycopg.Error as error:
            raise CatalogStoreError("Unable to connect to the catalog database.") from error
        return cls(connection, owns_connection=True)

    def close(self) -> None:
        if self._owns_connection:
            self._connection.close()

    def __enter__(self) -> PostgresCatalogStore:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def source_is_unchanged(self, descriptor: BulkDataDescriptor) -> bool:
        try:
            with self._connection.transaction():
                row = self._connection.execute(
                    """
                    SELECT EXISTS (
                      SELECT 1
                      FROM public.catalog_state AS state
                      JOIN public.catalog_import_runs AS import_run
                        ON import_run.id = state.active_import_id
                       AND import_run.status = 'succeeded'
                      JOIN public.catalog_source_files AS source
                        ON source.id = import_run.source_file_id
                      WHERE state.singleton_id = 1
                        AND source.provider = %(provider)s
                        AND source.source_type = %(source_type)s
                        AND source.provider_object_id = %(provider_object_id)s
                        AND source.provider_updated_at = %(provider_updated_at)s::timestamptz
                        AND source.dependency_sha256
                          IS NOT DISTINCT FROM %(dependency_sha256)s
                        AND (
                          %(compressed_size)s IS NULL
                          OR source.compressed_size = %(compressed_size)s
                        )
                    )
                    """,
                    {
                        "provider": "scryfall",
                        "source_type": descriptor.source_type,
                        "provider_object_id": descriptor.provider_object_id,
                        "provider_updated_at": descriptor.updated_at,
                        "dependency_sha256": descriptor.dependency_sha256,
                        "compressed_size": descriptor.compressed_size,
                    },
                ).fetchone()
        except psycopg.Error as error:
            raise CatalogStoreError("Unable to inspect prior catalog source state.") from error
        return bool(row and row[0])

    def complete_queued_noop(
        self,
        queued_import_id: str,
        *,
        descriptor: BulkDataDescriptor,
        worker_version: str,
    ) -> QueuedNoopCompletion:
        payload = self._call_json(
            """
            SELECT app_private.catalog_complete_queued_noop(
              p_queued_import_id => %(queued_import_id)s::uuid,
              p_provider => %(provider)s,
              p_source_type => %(source_type)s,
              p_provider_object_id => %(provider_object_id)s,
              p_provider_updated_at => %(provider_updated_at)s::timestamptz,
              p_dependency_sha256 => %(dependency_sha256)s,
              p_worker_version => %(worker_version)s
            )
            """,
            {
                "queued_import_id": queued_import_id,
                "provider": "scryfall",
                "source_type": descriptor.source_type,
                "provider_object_id": descriptor.provider_object_id,
                "provider_updated_at": descriptor.updated_at,
                "dependency_sha256": descriptor.dependency_sha256,
                "worker_version": worker_version,
            },
            operation="complete queued catalog no-op",
        )
        if _required_text(payload, "import_run_id") != queued_import_id:
            raise CatalogStoreError("Queued catalog no-op returned an unexpected import run.")

        status = _required_text(payload, "status")
        noop = _required_bool(payload, "noop")
        replayed = _required_bool(payload, "replayed")
        catalog_version = _optional_text(payload.get("catalog_version"))
        active_import_id = _optional_text(payload.get("active_import_id"))
        if status == "succeeded":
            if not noop or catalog_version is None or active_import_id is None:
                raise CatalogStoreError("Queued catalog no-op returned an invalid completion.")
        elif status == "queued":
            if noop or replayed:
                raise CatalogStoreError("Queued catalog no-op returned an invalid continuation.")
        else:
            raise CatalogStoreError("Queued catalog no-op returned an invalid status.")

        return QueuedNoopCompletion(
            import_run_id=queued_import_id,
            status=status,
            noop=noop,
            catalog_version=catalog_version,
            active_import_id=active_import_id,
            replayed=replayed,
        )

    def register_source_file(
        self,
        descriptor: BulkDataDescriptor,
        download: DownloadResult,
        *,
        downloaded_at: str,
    ) -> SourceFileRegistration:
        payload = self._call_json(
            """
            SELECT app_private.catalog_register_source_file(
              p_provider => %(provider)s,
              p_source_type => %(source_type)s,
              p_provider_object_id => %(provider_object_id)s,
              p_provider_updated_at => %(provider_updated_at)s::timestamptz,
              p_download_uri => %(download_uri)s,
              p_content_type => %(content_type)s,
              p_content_encoding => %(content_encoding)s,
              p_compressed_size => %(compressed_size)s,
              p_downloaded_size => %(downloaded_size)s,
              p_sha256 => %(sha256)s,
              p_dependency_sha256 => %(dependency_sha256)s,
              p_downloaded_at => %(downloaded_at)s::timestamptz
            )
            """,
            {
                "provider": "scryfall",
                "source_type": descriptor.source_type,
                "provider_object_id": descriptor.provider_object_id,
                "provider_updated_at": descriptor.updated_at,
                "download_uri": descriptor.download_uri,
                "content_type": descriptor.content_type,
                "content_encoding": descriptor.content_encoding,
                "compressed_size": descriptor.compressed_size,
                "downloaded_size": download.byte_size,
                "sha256": download.sha256,
                "dependency_sha256": descriptor.dependency_sha256,
                "downloaded_at": downloaded_at,
            },
            operation="register catalog source file",
        )
        return SourceFileRegistration(
            source_file_id=_required_text(payload, "source_file_id"),
            replayed=bool(payload.get("replayed", False)),
            unchanged=bool(payload.get("unchanged", False)),
            successful_import_id=_optional_text(payload.get("successful_import_id")),
        )

    def begin_import(
        self,
        source_file_id: str,
        *,
        trigger_type: str,
        worker_version: str,
        force: bool,
        queued_import_id: str | None,
    ) -> ImportRegistration:
        payload = self._call_json(
            """
            SELECT app_private.catalog_begin_import(
              p_source_file_id => %(source_file_id)s::uuid,
              p_trigger_type => %(trigger_type)s,
              p_worker_version => %(worker_version)s,
              p_force => %(force)s,
              p_queued_import_id => %(queued_import_id)s::uuid
            )
            """,
            {
                "source_file_id": source_file_id,
                "trigger_type": trigger_type,
                "worker_version": worker_version,
                "force": force,
                "queued_import_id": queued_import_id,
            },
            operation="begin catalog import",
        )
        return ImportRegistration(
            import_run_id=_required_text(payload, "import_run_id"),
            replayed=bool(payload.get("replayed", False)),
            noop=bool(payload.get("noop", False)),
            active_catalog_version=_optional_text(payload.get("active_catalog_version")),
        )

    def stage_batch(self, import_run_id: str, batch: NormalizedBatch) -> None:
        try:
            with self._connection.transaction(), self._connection.cursor() as cursor:
                for spec in STAGE_SPECS:
                    records = _stage_records(batch, spec.attribute)
                    if records:
                        parameters = [
                            _record_parameters(import_run_id, record) for record in records
                        ]
                        cursor.executemany(_consistent_upsert_sql(spec), parameters)
                        if cursor.rowcount != len(parameters):
                            raise CatalogValidationError(
                                f"Conflicting staged {spec.attribute} identity."
                            )
                if batch.cards_seen:
                    cursor.execute(
                        """
                        UPDATE public.catalog_import_runs
                        SET records_seen = records_seen + %(cards_seen)s,
                            updated_at = now()
                        WHERE id = %(import_run_id)s::uuid
                          AND status = 'running'
                        """,
                        {
                            "cards_seen": batch.cards_seen,
                            "import_run_id": import_run_id,
                        },
                    )
                    if cursor.rowcount != 1:
                        raise CatalogStoreError("Catalog import run is not writable while staging.")
        except CatalogStoreError:
            raise
        except psycopg.Error as error:
            raise CatalogStoreError("Unable to stage a bounded catalog batch.") from error

    def heartbeat_import(self, import_run_id: str) -> None:
        payload = self._call_json(
            """
            SELECT app_private.catalog_heartbeat_import(
              p_import_run_id => %(import_run_id)s::uuid
            )
            """,
            {"import_run_id": import_run_id},
            operation="heartbeat catalog import",
        )
        if (
            _required_text(payload, "import_run_id") != import_run_id
            or _required_text(payload, "status") != "running"
        ):
            raise CatalogStoreError("Catalog heartbeat returned an unexpected import run.")
        _required_text(payload, "heartbeat_at")

    def validate_import(self, import_run_id: str) -> ImportValidation:
        payload = self._call_json(
            """
            SELECT app_private.catalog_validate_import(
              p_import_run_id => %(import_run_id)s::uuid,
              p_max_rejections => 0
            )
            """,
            {"import_run_id": import_run_id},
            operation="validate staged catalog import",
        )
        raw_counts = payload.get("counts")
        if not isinstance(raw_counts, Mapping):
            raise CatalogStoreError("Catalog validation returned invalid counts.")
        counts = _integer_mapping(raw_counts)
        records_rejected = counts.get(
            "records_rejected",
            counts.get("rejected", 0),
        )
        if payload.get("valid") is not True:
            errors = payload.get("errors")
            safe_codes = (
                ", ".join(str(item)[:80] for item in errors[:5] if isinstance(item, (str, int)))
                if isinstance(errors, list)
                else "database validation rejected staged rows"
            )
            raise CatalogValidationError(_bounded(f"Catalog validation failed: {safe_codes}."))
        return ImportValidation(
            counts=counts,
            records_rejected=records_rejected,
        )

    def promote_import(
        self,
        import_run_id: str,
        *,
        catalog_version: str,
    ) -> PromotionResult:
        payload = self._call_json(
            """
            SELECT app_private.catalog_promote_import(
              p_import_run_id => %(import_run_id)s::uuid,
              p_catalog_version => %(catalog_version)s
            )
            """,
            {
                "import_run_id": import_run_id,
                "catalog_version": catalog_version,
            },
            operation="promote staged catalog import",
        )
        raw_counts = payload.get("counts")
        if not isinstance(raw_counts, Mapping):
            raise CatalogStoreError("Catalog promotion returned invalid counts.")
        status = _required_text(payload, "status")
        if status != "succeeded":
            raise CatalogStoreError("Catalog promotion did not succeed.")
        return PromotionResult(
            active_import_id=_required_text(payload, "import_run_id"),
            catalog_version=_required_text(payload, "catalog_version"),
            counts=_integer_mapping(raw_counts),
        )

    def mark_import_failed(
        self,
        *,
        source_file_id: str | None,
        import_run_id: str | None,
        error_code: str,
        error_summary: str,
    ) -> None:
        bounded_summary = _bounded(error_summary)
        if import_run_id is not None:
            self._call_json(
                """
                SELECT app_private.catalog_fail_import(
                  p_import_run_id => %(import_run_id)s::uuid,
                  p_error_code => %(error_code)s,
                  p_error_summary => %(error_summary)s
                )
                """,
                {
                    "import_run_id": import_run_id,
                    "error_code": error_code[:80],
                    "error_summary": bounded_summary,
                },
                operation="mark catalog import failed",
            )
            return
        if source_file_id is None:
            return
        try:
            with self._connection.transaction():
                self._connection.execute(
                    """
                    UPDATE public.catalog_source_files
                    SET status = 'failed',
                        updated_at = now()
                    WHERE id = %(source_file_id)s::uuid
                      AND status <> 'succeeded'
                    """,
                    {"source_file_id": source_file_id},
                )
        except psycopg.Error as error:
            raise CatalogStoreError("Unable to mark catalog source failed.") from error

    def mark_queued_import_failed(
        self,
        queued_import_id: str,
        *,
        error_code: str,
        error_summary: str,
    ) -> None:
        payload = self._call_json(
            """
            SELECT app_private.catalog_fail_queued_import(
              p_queued_import_id => %(queued_import_id)s::uuid,
              p_error_code => %(error_code)s,
              p_error_summary => %(error_summary)s
            )
            """,
            {
                "queued_import_id": queued_import_id,
                "error_code": error_code[:80],
                "error_summary": _bounded(error_summary),
            },
            operation="mark queued catalog import failed",
        )
        if (
            _required_text(payload, "import_run_id") != queued_import_id
            or _required_text(payload, "status") != "failed"
        ):
            raise CatalogStoreError("Queued catalog failure returned an unexpected import run.")

    def status(self) -> Mapping[str, object]:
        return self._call_json(
            """
            SELECT app_private.catalog_worker_status(
              p_provider => 'scryfall',
              p_source_type => 'all_cards'
            )
            """,
            {},
            operation="read catalog worker status",
        )

    def _call_json(
        self,
        statement: str,
        parameters: Mapping[str, object],
        *,
        operation: str,
    ) -> dict[str, object]:
        try:
            with self._connection.transaction():
                row = self._connection.execute(statement, parameters).fetchone()
        except psycopg.Error as error:
            if error.diag.message_primary == "talence_catalog_sync_disabled":
                raise CatalogSyncDisabledError(
                    "Catalog synchronization is disabled by the database incident switch."
                ) from error
            raise CatalogStoreError(f"Unable to {operation}.") from error
        if row is None or not isinstance(row[0], dict):
            raise CatalogStoreError(
                f"Database returned an invalid result while trying to {operation}."
            )
        return row[0]


def _stage_records(batch: NormalizedBatch, attribute: str) -> tuple[StageRecord, ...]:
    records = getattr(batch, attribute)
    if not isinstance(records, tuple):
        raise CatalogStoreError(f"Invalid normalized batch attribute: {attribute}.")
    return records


def _record_parameters(import_run_id: str, record: StageRecord) -> dict[str, object]:
    values = asdict(record)
    parameters: dict[str, object] = {"import_run_id": import_run_id}
    for key, value in values.items():
        parameters[key] = list(value) if isinstance(value, tuple) else value
    return parameters


def _consistent_upsert_sql(spec: StageSpec) -> str:
    insert_columns = ", ".join(spec.columns)
    placeholders = ", ".join(
        f"%({column})s::{spec.casts[column]}" if column in spec.casts else f"%({column})s"
        for column in spec.columns
    )
    conflict_columns = ", ".join(spec.key_columns)
    value_columns = tuple(column for column in spec.columns if column not in spec.key_columns)
    assignments = ", ".join(f"{column} = EXCLUDED.{column}" for column in value_columns)
    existing_row = ", ".join(f"staged.{column}" for column in value_columns)
    excluded_row = ", ".join(f"EXCLUDED.{column}" for column in value_columns)
    return (
        f"INSERT INTO app_private.{spec.table} AS staged ({insert_columns}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_columns}) DO UPDATE SET {assignments} "
        f"WHERE ROW({existing_row}) IS NOT DISTINCT FROM ROW({excluded_row})"
    )


def _required_text(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise CatalogStoreError(f"Database result is missing {key}.")
    return value


def _optional_text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _required_bool(payload: Mapping[str, object], key: str) -> bool:
    value = payload.get(key)
    if not isinstance(value, bool):
        raise CatalogStoreError(f"Database result is missing {key}.")
    return value


def _integer_mapping(raw: Mapping[object, object]) -> dict[str, int]:
    result: dict[str, int] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, int):
            raise CatalogStoreError("Database count result must contain integer values.")
        result[key] = value
    return result


def _bounded(value: str) -> str:
    return " ".join(value.split())[:MAX_DATABASE_ERROR_SUMMARY_LENGTH]
