from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from talence_catalog.config import WorkerConfig
from talence_catalog.download import (
    DownloadResult,
    DownloadSizeExceededError,
    stream_to_file,
)

SCRYFALL_API_BASE_URL = "https://api.scryfall.com"
SCRYFALL_ACCEPT_HEADER = "application/json;q=0.9,*/*;q=0.8"
SCRYFALL_BULK_HOSTS = frozenset({"data.scryfall.io"})
TRANSIENT_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})
MAXIMUM_BULK_REDIRECTS = 5


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
    dependency_sha256: str | None = None


class ScryfallProvider:
    """Narrow Scryfall metadata client with injectable, network-free tests."""

    def __init__(
        self,
        config: WorkerConfig,
        *,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        base_url: str = SCRYFALL_API_BASE_URL,
    ) -> None:
        if not base_url.startswith("https://"):
            raise ValueError("Scryfall provider base URL must use HTTPS.")
        self._config = config
        self._sleep = sleep
        self._monotonic = monotonic
        self._last_metadata_request_at: float | None = None
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

        matches = [
            item for item in data if isinstance(item, dict) and item.get("type") == "all_cards"
        ]
        if len(matches) != 1:
            raise ProviderResponseError(
                "Scryfall must return exactly one all_cards bulk descriptor."
            )
        return self._parse_bulk_descriptor(matches[0])

    def fetch_sets(self) -> tuple[dict[str, Any], ...]:
        payload = self._request_json("/sets")
        data = payload.get("data")
        if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
            raise ProviderResponseError("Scryfall set metadata is missing a data array.")
        return tuple(data)

    def download_bulk(
        self,
        descriptor: BulkDataDescriptor,
        destination: Path,
    ) -> DownloadResult:
        """Stream an HTTPS bulk object to an atomic bounded temporary destination."""

        if descriptor.source_type != "all_cards":
            raise ValueError("Only the exact all_cards bulk source may be downloaded.")
        _validate_scryfall_bulk_uri(descriptor.download_uri)
        if (
            descriptor.compressed_size is not None
            and descriptor.compressed_size > self._config.maximum_download_bytes
        ):
            raise DownloadSizeExceededError(
                "Provider-declared bulk size exceeds TALENCE_CATALOG_MAX_DOWNLOAD_BYTES."
            )

        last_error: Exception | None = None
        for attempt in range(self._config.maximum_attempts):
            download_uri = descriptor.download_uri
            redirect_count = 0
            try:
                while True:
                    with self._client.stream(
                        "GET",
                        download_uri,
                        headers=self._headers(),
                        follow_redirects=False,
                    ) as response:
                        _validate_scryfall_bulk_uri(str(response.url))
                        if response.is_redirect:
                            location = response.headers.get("Location")
                            if not location:
                                raise ProviderResponseError(
                                    "Scryfall bulk redirect is missing a Location header."
                                )
                            redirect_count += 1
                            if redirect_count > MAXIMUM_BULK_REDIRECTS:
                                raise ProviderResponseError(
                                    "Scryfall bulk download exceeded the redirect limit."
                                )
                            download_uri = urljoin(str(response.url), location)
                            _validate_scryfall_bulk_uri(download_uri)
                            continue
                        if response.status_code in TRANSIENT_STATUS_CODES:
                            last_error = ProviderUnavailableError(
                                f"Scryfall returned transient status {response.status_code}."
                            )
                            break

                        self._raise_for_permanent_status(response)
                        self._validate_download_headers(response)
                        return stream_to_file(
                            response.iter_bytes(),
                            destination,
                            maximum_bytes=self._config.maximum_download_bytes,
                        )
            except httpx.TransportError as error:
                last_error = error

            if attempt + 1 < self._config.maximum_attempts:
                self._sleep(self._config.retry_base_seconds * (2**attempt))

        raise ProviderUnavailableError(
            "Scryfall bulk download failed after bounded retries."
        ) from last_error

    def _request_json(self, route: str) -> dict[str, Any]:
        last_error: Exception | None = None

        for attempt in range(self._config.maximum_attempts):
            self._wait_for_metadata_slot()
            try:
                response = self._client.get(
                    route,
                    headers=self._headers(),
                )
                if response.status_code in TRANSIENT_STATUS_CODES:
                    last_error = ProviderUnavailableError(
                        f"Scryfall returned transient status {response.status_code}."
                    )
                else:
                    self._raise_for_permanent_status(response)
                    try:
                        payload = response.json()
                    except ValueError as error:
                        raise ProviderResponseError(
                            "Scryfall metadata response is not valid JSON."
                        ) from error
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

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": SCRYFALL_ACCEPT_HEADER,
            "User-Agent": self._config.user_agent,
        }

    @staticmethod
    def _raise_for_permanent_status(response: httpx.Response) -> None:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise ProviderResponseError(
                f"Scryfall rejected the request with status {response.status_code}."
            ) from error

    def _wait_for_metadata_slot(self) -> None:
        now = self._monotonic()
        if self._last_metadata_request_at is not None:
            elapsed = now - self._last_metadata_request_at
            remaining = self._config.metadata_minimum_interval_seconds - elapsed
            if remaining > 0:
                self._sleep(remaining)
                now += remaining
        self._last_metadata_request_at = now

    def _validate_download_headers(self, response: httpx.Response) -> None:
        content_length = response.headers.get("Content-Length")
        if content_length is not None:
            try:
                declared_size = int(content_length)
            except ValueError as error:
                raise ProviderResponseError(
                    "Scryfall bulk response has an invalid Content-Length."
                ) from error
            if declared_size > self._config.maximum_download_bytes:
                raise DownloadSizeExceededError(
                    "Scryfall bulk response exceeds TALENCE_CATALOG_MAX_DOWNLOAD_BYTES."
                )

        content_type = response.headers.get("Content-Type")
        if content_type is not None and "json" not in content_type.casefold():
            raise ProviderResponseError(
                f"Scryfall bulk response has unexpected Content-Type: {content_type}."
            )

    @staticmethod
    def _parse_bulk_descriptor(item: dict[str, Any]) -> BulkDataDescriptor:
        provider_object_id = _required_provider_text(item, "id")
        source_type = _required_provider_text(item, "type")
        updated_at = _required_provider_text(item, "updated_at")
        download_uri = _required_provider_text(item, "download_uri")
        content_type = _required_provider_text(item, "content_type")
        _validate_scryfall_bulk_uri(download_uri)

        compressed_size = item.get("size", item.get("compressed_size"))
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


def _validate_scryfall_bulk_uri(value: str) -> None:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise ProviderResponseError("Scryfall bulk download URI is invalid.") from error

    if (
        parsed.scheme.casefold() != "https"
        or parsed.hostname is None
        or parsed.hostname.casefold() not in SCRYFALL_BULK_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
    ):
        raise ProviderResponseError(
            "Scryfall bulk download URI must use HTTPS on an approved Scryfall bulk host."
        )
