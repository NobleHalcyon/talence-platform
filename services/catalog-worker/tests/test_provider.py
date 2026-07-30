import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.download import DownloadSizeExceededError
from talence_catalog.provider.scryfall import (
    SCRYFALL_ACCEPT_HEADER,
    SCRYFALL_ALL_CARDS_ROUTE,
    SCRYFALL_JSONL_CONTENT_ENCODING,
    SCRYFALL_JSONL_CONTENT_TYPE,
    BulkDataDescriptor,
    ProviderResponseError,
    ProviderUnavailableError,
    ScryfallProvider,
)


def _descriptor_payload(**overrides: object) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "object": "bulk_data",
        "id": "00000000-0000-4000-8000-000000000001",
        "type": "all_cards",
        "updated_at": "2026-07-29T21:27:56.280+00:00",
        "uri": ("https://api.scryfall.com/bulk-data/00000000-0000-4000-8000-000000000001"),
        "name": "All Cards",
        "description": "Sanitized live-contract regression descriptor.",
        "jsonl_download_uri": (
            "https://data.scryfall.io/all-cards/all-cards-20260729212756.jsonl.gz"
        ),
        "compressed_size": 389_772_467,
    }
    payload.update(overrides)
    return payload


def _download_descriptor(
    *,
    download_uri: str = "https://data.scryfall.io/all-cards.jsonl.gz",
    compressed_size: int = 100,
) -> BulkDataDescriptor:
    return BulkDataDescriptor(
        provider_object_id="bulk-object",
        source_type="all_cards",
        updated_at="2026-07-29T21:27:56.280+00:00",
        download_uri=download_uri,
        content_type=SCRYFALL_JSONL_CONTENT_TYPE,
        content_encoding=SCRYFALL_JSONL_CONTENT_ENCODING,
        compressed_size=compressed_size,
        file_format="jsonl_gzip",
    )


def test_bulk_discovery_uses_current_per_type_jsonl_contract_and_bounded_retry(
    bulk_descriptor_fixture_path: Path,
) -> None:
    requests: list[httpx.Request] = []
    fixture = json.loads(bulk_descriptor_fixture_path.read_text(encoding="utf-8"))

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(200, request=request, json=fixture)

    config = WorkerConfig.from_environment(
        {
            "TALENCE_CATALOG_USER_AGENT": ("Talence-Test/0.1 (+https://talence.example/tests)"),
            "TALENCE_CATALOG_MAXIMUM_ATTEMPTS": "2",
        }
    )
    delays: list[float] = []
    monotonic_time = [0.0]

    def sleep(delay: float) -> None:
        delays.append(delay)
        monotonic_time[0] += delay

    provider = ScryfallProvider(
        config,
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(handler),
        ),
        sleep=sleep,
        monotonic=lambda: monotonic_time[0],
    )

    descriptor = provider.discover_all_cards()

    assert descriptor.source_type == "all_cards"
    assert descriptor.download_uri == fixture["jsonl_download_uri"]
    assert descriptor.content_type == SCRYFALL_JSONL_CONTENT_TYPE
    assert descriptor.content_encoding == SCRYFALL_JSONL_CONTENT_ENCODING
    assert descriptor.compressed_size == fixture["compressed_size"]
    assert descriptor.file_format == "jsonl_gzip"
    assert len(requests) == 2
    assert all(request.url.path == SCRYFALL_ALL_CARDS_ROUTE for request in requests)
    assert requests[-1].headers["Accept"] == SCRYFALL_ACCEPT_HEADER
    assert requests[-1].headers["User-Agent"].startswith("Talence-Test/")
    assert delays == [config.retry_base_seconds]


def test_permanent_provider_rejection_is_not_retried() -> None:
    request_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return httpx.Response(404, request=request)

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(handler),
        ),
        sleep=lambda _: pytest.fail("permanent failure must not sleep/retry"),
    )

    with pytest.raises(ProviderResponseError, match="status 404"):
        provider.discover_all_cards()
    assert request_count == 1


@pytest.mark.parametrize("case", ["missing", "null", "empty"])
def test_bulk_discovery_rejects_missing_or_malformed_jsonl_download_uri(
    case: str,
) -> None:
    payload = _descriptor_payload()
    if case == "missing":
        payload.pop("jsonl_download_uri")
    elif case == "null":
        payload["jsonl_download_uri"] = None
    else:
        payload["jsonl_download_uri"] = ""

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, request=request, json=payload)
            ),
        ),
    )

    with pytest.raises(
        ProviderResponseError,
        match="invalid field: jsonl_download_uri",
    ):
        provider.discover_all_cards()


def test_bulk_discovery_rejects_wrong_per_type_descriptor() -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    request=request,
                    json=_descriptor_payload(type="oracle_cards"),
                )
            ),
        ),
    )

    with pytest.raises(ProviderResponseError, match="unexpected bulk type"):
        provider.discover_all_cards()


@pytest.mark.parametrize(
    "download_uri",
    [
        "http://data.scryfall.io/all-cards.jsonl.gz",
        "https://downloads.example/all-cards.jsonl.gz",
        "https://user@data.scryfall.io/all-cards.jsonl.gz",
        "https://user:password@data.scryfall.io/all-cards.jsonl.gz",
        "https://data.scryfall.io:444/all-cards.jsonl.gz",
    ],
)
def test_bulk_discovery_rejects_unsafe_download_urls(download_uri: str) -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    request=request,
                    json=_descriptor_payload(jsonl_download_uri=download_uri),
                )
            ),
        ),
    )

    with pytest.raises(ProviderResponseError, match="approved Scryfall bulk host"):
        provider.discover_all_cards()


@pytest.mark.parametrize("compressed_size", [None, 0, -1, True, "389772467"])
def test_bulk_discovery_requires_positive_integer_compressed_size(
    compressed_size: object,
) -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            base_url="https://api.scryfall.com",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    request=request,
                    json=_descriptor_payload(compressed_size=compressed_size),
                )
            ),
        ),
    )

    with pytest.raises(ProviderResponseError, match="positive integer"):
        provider.discover_all_cards()


def test_bulk_download_streams_raw_gzip_with_required_headers(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    payload = b"\x1f\x8b\x08\x00sanitized-gzip-bytes"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            request=request,
            stream=httpx.ByteStream(payload),
            headers={
                "Content-Type": SCRYFALL_JSONL_CONTENT_TYPE,
                "Content-Length": str(len(payload)),
            },
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    descriptor = _download_descriptor(compressed_size=len(payload))

    result = provider.download_bulk(descriptor, tmp_path / "all_cards.jsonl.gz")

    assert result.byte_size == len(payload)
    assert result.path.read_bytes() == payload
    assert requests[0].headers["Accept"] == SCRYFALL_ACCEPT_HEADER
    assert "Talence" in requests[0].headers["User-Agent"]


def test_bulk_download_retries_transient_status_then_succeeds(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    delays: list[float] = []
    payload = b"compressed-jsonl"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(
            200,
            request=request,
            stream=httpx.ByteStream(payload),
            headers={"Content-Type": SCRYFALL_JSONL_CONTENT_TYPE},
        )

    config = WorkerConfig.from_environment({"TALENCE_CATALOG_MAXIMUM_ATTEMPTS": "2"})
    provider = ScryfallProvider(
        config,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=delays.append,
    )

    result = provider.download_bulk(
        _download_descriptor(compressed_size=len(payload)),
        tmp_path / "all_cards.jsonl.gz",
    )

    assert result.path.read_bytes() == payload
    assert len(requests) == 2
    assert delays == [config.retry_base_seconds]


def test_bulk_download_permanent_failure_is_not_retried(tmp_path: Path) -> None:
    request_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return httpx.Response(403, request=request)

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=lambda _: pytest.fail("permanent failure must not sleep/retry"),
    )

    with pytest.raises(ProviderResponseError, match="status 403"):
        provider.download_bulk(
            _download_descriptor(),
            tmp_path / "all_cards.jsonl.gz",
        )
    assert request_count == 1


def test_bulk_download_follows_allowlisted_redirect(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    payload = b"compressed-jsonl"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/start.jsonl.gz":
            return httpx.Response(
                302,
                request=request,
                headers={"Location": "https://data.scryfall.io/final.jsonl.gz"},
            )
        return httpx.Response(
            200,
            request=request,
            stream=httpx.ByteStream(payload),
            headers={"Content-Type": SCRYFALL_JSONL_CONTENT_TYPE},
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    descriptor = _download_descriptor(
        download_uri="https://data.scryfall.io/start.jsonl.gz",
        compressed_size=len(payload),
    )

    result = provider.download_bulk(descriptor, tmp_path / "all_cards.jsonl.gz")

    assert result.path.read_bytes() == payload
    assert [request.url.host for request in requests] == [
        "data.scryfall.io",
        "data.scryfall.io",
    ]


@pytest.mark.parametrize(
    "redirect_uri",
    [
        "http://data.scryfall.io/final.jsonl.gz",
        "https://downloads.example/final.jsonl.gz",
        "https://user@data.scryfall.io/final.jsonl.gz",
        "https://user:password@data.scryfall.io/final.jsonl.gz",
        "https://data.scryfall.io:444/final.jsonl.gz",
    ],
)
def test_bulk_download_rejects_unsafe_redirect_before_request(
    tmp_path: Path,
    redirect_uri: str,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) > 1:
            pytest.fail(f"redirect target must not be requested: {request.url}")
        return httpx.Response(
            302,
            request=request,
            headers={"Location": redirect_uri},
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ProviderResponseError, match="approved Scryfall bulk host"):
        provider.download_bulk(
            _download_descriptor(download_uri="https://data.scryfall.io/start.jsonl.gz"),
            tmp_path / "all_cards.jsonl.gz",
        )

    assert len(requests) == 1


def test_provider_declared_oversized_bulk_is_rejected_before_network(
    tmp_path: Path,
) -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({"TALENCE_CATALOG_MAX_DOWNLOAD_BYTES": "10"}),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: pytest.fail(f"unexpected network request: {request.url}")
            )
        ),
    )

    with pytest.raises(DownloadSizeExceededError, match="Provider-declared"):
        provider.download_bulk(
            _download_descriptor(compressed_size=11),
            tmp_path / "all_cards.jsonl.gz",
        )


def test_bulk_response_declared_oversized_is_rejected(tmp_path: Path) -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({"TALENCE_CATALOG_MAX_DOWNLOAD_BYTES": "10"}),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    request=request,
                    content=b"small",
                    headers={
                        "Content-Type": SCRYFALL_JSONL_CONTENT_TYPE,
                        "Content-Length": "11",
                    },
                )
            )
        ),
    )

    with pytest.raises(DownloadSizeExceededError, match="response exceeds"):
        provider.download_bulk(
            _download_descriptor(compressed_size=10),
            tmp_path / "all_cards.jsonl.gz",
        )


def test_bulk_response_rejects_unexpected_content_type(tmp_path: Path) -> None:
    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    request=request,
                    content=b"not-gzip",
                    headers={"Content-Type": "application/json"},
                )
            )
        ),
    )

    with pytest.raises(ProviderResponseError, match="unexpected Content-Type"):
        provider.download_bulk(
            _download_descriptor(),
            tmp_path / "all_cards.jsonl.gz",
        )


def test_exhausted_transient_download_returns_bounded_error(tmp_path: Path) -> None:
    request_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return httpx.Response(503, request=request)

    provider = ScryfallProvider(
        WorkerConfig.from_environment({"TALENCE_CATALOG_MAXIMUM_ATTEMPTS": "2"}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=lambda _: None,
    )

    with pytest.raises(ProviderUnavailableError, match="bounded retries"):
        provider.download_bulk(
            _download_descriptor(),
            tmp_path / "all_cards.jsonl.gz",
        )
    assert request_count == 2
