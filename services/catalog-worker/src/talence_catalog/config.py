from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from math import isfinite
from pathlib import Path
from typing import Literal, cast


class ConfigurationError(ValueError):
    """Raised when worker configuration is missing or unsafe."""


CONTACT_PATTERN = re.compile(r"(?:https://|mailto:)", re.IGNORECASE)
API_CONTRACT_VERSION_PATTERN = re.compile(r"^v[1-9]\d*$")
MINIMUM_CLIENT_VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[+-][A-Za-z0-9.-]+)?$")


def _positive_int(environment: dict[str, str], name: str, default: int) -> int:
    raw = environment.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be an integer.") from error
    if value <= 0:
        raise ConfigurationError(f"{name} must be greater than zero.")
    return value


def _positive_float(environment: dict[str, str], name: str, default: float) -> float:
    raw = environment.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be numeric.") from error
    if not isfinite(value) or value <= 0:
        raise ConfigurationError(f"{name} must be greater than zero.")
    return value


def _bounded_positive_int(
    environment: dict[str, str],
    name: str,
    default: int,
    *,
    maximum: int,
) -> int:
    value = _positive_int(environment, name, default)
    if value > maximum:
        raise ConfigurationError(f"{name} must be at most {maximum}.")
    return value


def _bounded_text(
    environment: dict[str, str],
    name: str,
    default: str,
    *,
    maximum_length: int,
) -> str:
    value = environment.get(name, default).strip()
    if not value or len(value) > maximum_length:
        raise ConfigurationError(
            f"{name} must be non-empty and at most {maximum_length} characters."
        )
    return value


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    """Non-secret catalog worker configuration plus an optional private DB URL."""

    user_agent: str
    maximum_download_bytes: int = 2_000_000_000
    request_timeout_seconds: float = 30.0
    maximum_attempts: int = 4
    retry_base_seconds: float = 0.5
    metadata_minimum_interval_seconds: float = 0.11
    batch_size: int = 1_000
    price_stale_after_hours: int = 36
    temporary_directory: Path | None = None
    database_url: str | None = field(default=None, repr=False)
    snapshot_storage_backend: Literal["local", "supabase"] = "local"
    snapshot_storage_root: Path | None = None
    snapshot_storage_bucket: str = "catalog-snapshots"
    snapshot_api_contract_version: str = "v1"
    snapshot_minimum_client_version: str = "0.1.0"
    snapshot_maximum_bytes: int = 1_073_741_824
    snapshot_batch_size: int = 5_000
    snapshot_storage_timeout_seconds: float = 120.0
    supabase_url: str | None = None
    supabase_secret_key: str | None = field(default=None, repr=False)

    @classmethod
    def from_environment(
        cls,
        environment: dict[str, str] | None = None,
    ) -> WorkerConfig:
        values = dict(os.environ if environment is None else environment)
        user_agent = values.get(
            "TALENCE_CATALOG_USER_AGENT",
            "Talence-Catalog-Worker/0.2 (+https://talence.example/catalog-worker)",
        ).strip()
        if "Talence" not in user_agent or not CONTACT_PATTERN.search(user_agent):
            raise ConfigurationError(
                "TALENCE_CATALOG_USER_AGENT must identify Talence and include an "
                "https:// or mailto: contact/reference."
            )

        temporary_directory = values.get("TALENCE_CATALOG_TEMP_DIRECTORY")
        snapshot_storage_root = values.get("TALENCE_SNAPSHOT_STORAGE_ROOT")
        snapshot_storage_backend = values.get(
            "TALENCE_SNAPSHOT_STORAGE_BACKEND",
            "local",
        ).strip()
        if snapshot_storage_backend not in {"local", "supabase"}:
            raise ConfigurationError("TALENCE_SNAPSHOT_STORAGE_BACKEND must be local or supabase.")
        metadata_minimum_interval_seconds = _positive_float(
            values,
            "TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS",
            0.11,
        )
        if metadata_minimum_interval_seconds <= 0.1:
            raise ConfigurationError(
                "TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS must be greater "
                "than 0.1 to remain below 10 metadata requests per second."
            )
        snapshot_storage_bucket = _bounded_text(
            values,
            "TALENCE_SNAPSHOT_STORAGE_BUCKET",
            "catalog-snapshots",
            maximum_length=100,
        )
        if snapshot_storage_bucket != "catalog-snapshots":
            raise ConfigurationError("TALENCE_SNAPSHOT_STORAGE_BUCKET must be catalog-snapshots.")
        snapshot_api_contract_version = _bounded_text(
            values,
            "TALENCE_SNAPSHOT_API_CONTRACT_VERSION",
            "v1",
            maximum_length=32,
        )
        if not API_CONTRACT_VERSION_PATTERN.fullmatch(snapshot_api_contract_version):
            raise ConfigurationError("TALENCE_SNAPSHOT_API_CONTRACT_VERSION must use the vN shape.")
        snapshot_minimum_client_version = _bounded_text(
            values,
            "TALENCE_SNAPSHOT_MINIMUM_CLIENT_VERSION",
            "0.1.0",
            maximum_length=80,
        )
        if not MINIMUM_CLIENT_VERSION_PATTERN.fullmatch(snapshot_minimum_client_version):
            raise ConfigurationError(
                "TALENCE_SNAPSHOT_MINIMUM_CLIENT_VERSION must use the canonical version shape."
            )

        return cls(
            user_agent=user_agent,
            maximum_download_bytes=_positive_int(
                values,
                "TALENCE_CATALOG_MAX_DOWNLOAD_BYTES",
                2_000_000_000,
            ),
            request_timeout_seconds=_positive_float(
                values,
                "TALENCE_CATALOG_REQUEST_TIMEOUT_SECONDS",
                30.0,
            ),
            maximum_attempts=_positive_int(
                values,
                "TALENCE_CATALOG_MAXIMUM_ATTEMPTS",
                4,
            ),
            retry_base_seconds=_positive_float(
                values,
                "TALENCE_CATALOG_RETRY_BASE_SECONDS",
                0.5,
            ),
            metadata_minimum_interval_seconds=metadata_minimum_interval_seconds,
            batch_size=_positive_int(values, "TALENCE_CATALOG_BATCH_SIZE", 1_000),
            price_stale_after_hours=_positive_int(
                values,
                "TALENCE_CATALOG_PRICE_STALE_AFTER_HOURS",
                36,
            ),
            temporary_directory=(
                Path(temporary_directory).expanduser().resolve() if temporary_directory else None
            ),
            database_url=values.get("TALENCE_DATABASE_URL") or None,
            snapshot_storage_backend=cast(
                Literal["local", "supabase"],
                snapshot_storage_backend,
            ),
            snapshot_storage_root=(
                Path(snapshot_storage_root).expanduser().resolve()
                if snapshot_storage_root
                else None
            ),
            snapshot_storage_bucket=snapshot_storage_bucket,
            snapshot_api_contract_version=snapshot_api_contract_version,
            snapshot_minimum_client_version=snapshot_minimum_client_version,
            snapshot_maximum_bytes=_bounded_positive_int(
                values,
                "TALENCE_SNAPSHOT_MAX_BYTES",
                1_073_741_824,
                maximum=1_073_741_824,
            ),
            snapshot_batch_size=_positive_int(
                values,
                "TALENCE_SNAPSHOT_BATCH_SIZE",
                5_000,
            ),
            snapshot_storage_timeout_seconds=_positive_float(
                values,
                "TALENCE_SNAPSHOT_STORAGE_TIMEOUT_SECONDS",
                120.0,
            ),
            supabase_url=values.get("SUPABASE_URL") or None,
            supabase_secret_key=values.get("SUPABASE_SECRET_KEY") or None,
        )
