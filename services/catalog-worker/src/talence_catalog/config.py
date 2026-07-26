from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


class ConfigurationError(ValueError):
    """Raised when worker configuration is missing or unsafe."""


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
    if value <= 0:
        raise ConfigurationError(f"{name} must be greater than zero.")
    return value


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    """Non-secret catalog worker configuration plus an optional private DB URL."""

    user_agent: str
    maximum_download_bytes: int = 2_000_000_000
    request_timeout_seconds: float = 30.0
    maximum_attempts: int = 4
    retry_base_seconds: float = 0.5
    batch_size: int = 1_000
    temporary_directory: Path | None = None
    database_url: str | None = field(default=None, repr=False)

    @classmethod
    def from_environment(
        cls,
        environment: dict[str, str] | None = None,
    ) -> WorkerConfig:
        values = dict(os.environ if environment is None else environment)
        user_agent = values.get(
            "TALENCE_CATALOG_USER_AGENT",
            "Talence-Catalog-Worker/0.1 (+https://talence.example/catalog-worker)",
        ).strip()
        if "Talence" not in user_agent or not user_agent:
            raise ConfigurationError(
                "TALENCE_CATALOG_USER_AGENT must identify Talence and include contact context."
            )

        temporary_directory = values.get("TALENCE_CATALOG_TEMP_DIRECTORY")

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
            batch_size=_positive_int(values, "TALENCE_CATALOG_BATCH_SIZE", 1_000),
            temporary_directory=(
                Path(temporary_directory).expanduser().resolve() if temporary_directory else None
            ),
            database_url=values.get("TALENCE_DATABASE_URL"),
        )
