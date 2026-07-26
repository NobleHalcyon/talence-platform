from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from talence_catalog.config import WorkerConfig

SCRYFALL_API_BASE_URL = "https://api.scryfall.com"
TRANSIENT_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})


class ProviderResponseError(RuntimeError):
    """Raised when provider metadata is malformed."""


class ProviderUnavailableError(RuntimeError):
    """Raised after all bounded transient attempts fail."""


@dataclass(frozen=True, slots=True)
class BulkDataDescriptor:
    provider_object_id: str
    source_type: str
    updated_at: str
    download_uri: str
    content_type: str
    content_encoding: str | None
    compressed_size: int | None


class ScryfallProvider:
    """Narrow Scryfall metadata client with injectable, network-free tests."""

    def __init__(
        self,
        config: WorkerConfig,
        *,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        base_url: str = SCRYFALL_API_BASE_URL,
    ) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("Scryfall provider base URL must use HTTPS.")
        self._config = config
        self._sleep = sleep
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=base_url,
            timeout=config.request_timeout_seconds,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> ScryfallProvider:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def discover_all_cards(self) -> BulkDataDescriptor:
        payload = self._request_json("/bulk-data")
        data = payload.get("data")
        if not isinstance(data, list):
            raise ProviderResponseError("Scryfall bulk metadata is missing a data array.")

        for item in data:
            if isinstance(item, dict) and item.get("type") == "all_cards":
                return self._parse_bulk_descriptor(item)
        raise ProviderResponseError("Scryfall did not return an all_cards descriptor.")

    def fetch_sets(self) -> tuple[dict[str, Any], ...]:
        payload = self._request_json("/sets")
        data = payload.get("data")
        if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
            raise ProviderResponseError("Scryfall set metadata is missing a data array.")
        return tuple(data)

    def _request_json(self, route: str) -> dict[str, Any]:
        last_error: Exception | None = None

        for attempt in range(self._config.maximum_attempts):
            try:
                response = self._client.get(
                    route,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": self._config.user_agent,
                    },
                )
                if response.status_code in TRANSIENT_STATUS_CODES:
                    last_error = ProviderUnavailableError(
                        f"Scryfall returned transient status {response.status_code}."
                    )
                else:
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, dict):
                        raise ProviderResponseError("Scryfall response root must be a JSON object.")
                    return payload
            except httpx.TransportError as error:
                last_error = error

            if attempt + 1 < self._config.maximum_attempts:
                delay = self._config.retry_base_seconds * (2**attempt)
                self._sleep(delay)

        raise ProviderUnavailableError(
            "Scryfall metadata request failed after bounded retries."
        ) from last_error

    @staticmethod
    def _parse_bulk_descriptor(item: dict[str, Any]) -> BulkDataDescriptor:
        provider_object_id = _required_provider_text(item, "id")
        source_type = _required_provider_text(item, "type")
        updated_at = _required_provider_text(item, "updated_at")
        download_uri = _required_provider_text(item, "download_uri")
        content_type = _required_provider_text(item, "content_type")
        if not download_uri.startswith("https://"):
            raise ProviderResponseError("Scryfall bulk download URI must use HTTPS.")

        compressed_size = item.get("compressed_size")
        if compressed_size is not None and (
            not isinstance(compressed_size, int) or compressed_size < 0
        ):
            raise ProviderResponseError("Bulk compressed_size must be nonnegative.")

        content_encoding = item.get("content_encoding")
        if content_encoding is not None and not isinstance(content_encoding, str):
            raise ProviderResponseError("Bulk content_encoding must be text or null.")

        return BulkDataDescriptor(
            provider_object_id=provider_object_id,
            source_type=source_type,
            updated_at=updated_at,
            download_uri=download_uri,
            content_type=content_type,
            content_encoding=content_encoding,
            compressed_size=compressed_size,
        )


def _required_provider_text(item: dict[str, Any], key: str) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value:
        raise ProviderResponseError(f"Scryfall bulk descriptor has invalid field: {key}.")
    return value
