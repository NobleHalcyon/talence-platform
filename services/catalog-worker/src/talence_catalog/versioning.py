from __future__ import annotations

import re
from datetime import UTC, datetime

SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
CATALOG_VERSION_PATTERN = re.compile(r"^mtg-\d{8}T\d{6}Z-[a-f0-9]{8}-s[1-9]\d*$")


def build_catalog_version(
    provider_observed_at: str,
    source_sha256: str,
    *,
    snapshot_schema_version: int,
) -> str:
    if not SHA256_PATTERN.fullmatch(source_sha256):
        raise ValueError("source_sha256 must be 64 lowercase hexadecimal characters.")
    if snapshot_schema_version < 1:
        raise ValueError("snapshot_schema_version must be positive.")

    try:
        observed = datetime.fromisoformat(provider_observed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("provider_observed_at must be an ISO-8601 date-time.") from error
    if observed.tzinfo is None:
        raise ValueError("provider_observed_at must include a UTC offset.")

    timestamp = observed.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"mtg-{timestamp}-{source_sha256[:8]}-s{snapshot_schema_version}"


def validate_catalog_version(version: str) -> None:
    if not CATALOG_VERSION_PATTERN.fullmatch(version):
        raise ValueError("Catalog version does not match the canonical format.")
