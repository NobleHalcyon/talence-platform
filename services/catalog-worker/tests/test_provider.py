from pathlib import Path

import httpx
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.download import DownloadSizeExceededError
from talence_catalog.provider.scryfall import (
    SCRYFALL_ACCEPT_HEADER,
    BulkDataDescriptor,
    ProviderResponseError,
    ScryfallProvider,
)


def test_bulk_discovery_uses_required_headers_and_bounded_retry() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(
            200,
            request=request,
            json={
                "data": [
                    {
                        "id": "bulk-object",
                        "type": "all_cards",
                        "updated_at": "2026-07-26T12:00:00Z",
                        "download_uri": "https://data.scryfall.io/all-cards.json",
                        "content_type": "application/json",
                        "content_encoding": "gzip",
                        "compressed_size": 123,
                    }
                ]
            },
        )

    client = httpx.Client(
        base_url="https://api.scryfall.com",
        transport=httpx.MockTransport(handler),
    )
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
        client=client,
        sleep=sleep,
        monotonic=lambda: monotonic_time[0],
    )
    descriptor = provider.discover_all_cards()

    assert descriptor.source_type == "all_cards"
    assert descriptor.compressed_size == 123
    assert len(requests) == 2
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


def test_bulk_discovery_rejects_ambiguous_all_cards_descriptors() -> None:
    descriptor = {
        "id": "bulk-object",
        "type": "all_cards",
        "updated_at": "2026-07-26T12:00:00Z",
        "download_uri": "https://data.scryfall.io/all-cards.json",
        "content_type": "application/json",
        "content_encoding": None,
        "size": 123,
    }
    client = httpx.Client(
        base_url="https://api.scryfall.com",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                request=request,
                json={"data": [descriptor, dict(descriptor)]},
            )
        ),
    )
    provider = ScryfallProvider(WorkerConfig.from_environment({}), client=client)

    with pytest.raises(ProviderResponseError, match="exactly one all_cards"):
        provider.discover_all_cards()


def test_bulk_discovery_rejects_non_scryfall_download_host() -> None:
    client = httpx.Client(
        base_url="https://api.scryfall.com",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                request=request,
                json={
                    "data": [
                        {
                            "id": "bulk-object",
                            "type": "all_cards",
                            "updated_at": "2026-07-26T12:00:00Z",
                            "download_uri": "https://downloads.example/all-cards.json",
                            "content_type": "application/json",
                            "content_encoding": None,
                            "size": 123,
                        }
                    ]
                },
            )
        ),
    )
    provider = ScryfallProvider(WorkerConfig.from_environment({}), client=client)

    with pytest.raises(ProviderResponseError, match="approved Scryfall bulk host"):
        provider.discover_all_cards()


def test_bulk_download_streams_with_required_headers(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    payload = b'[{"object":"card"}]'

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            request=request,
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(payload)),
            },
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    descriptor = BulkDataDescriptor(
        provider_object_id="bulk-object",
        source_type="all_cards",
        updated_at="2026-07-26T12:00:00Z",
        download_uri="https://data.scryfall.io/all-cards.json",
        content_type="application/json",
        content_encoding=None,
        compressed_size=len(payload),
    )

    result = provider.download_bulk(descriptor, tmp_path / "all_cards.json")

    assert result.byte_size == len(payload)
    assert result.path.read_bytes() == payload
    assert requests[0].headers["Accept"] == SCRYFALL_ACCEPT_HEADER
    assert "Talence" in requests[0].headers["User-Agent"]


def test_bulk_download_follows_allowlisted_redirect(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []
    payload = b'[{"object":"card"}]'

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/start.json":
            return httpx.Response(
                302,
                request=request,
                headers={"Location": "https://data.scryfall.io/final.json"},
            )
        return httpx.Response(
            200,
            request=request,
            content=payload,
            headers={"Content-Type": "application/json"},
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    descriptor = BulkDataDescriptor(
        provider_object_id="bulk-object",
        source_type="all_cards",
        updated_at="2026-07-26T12:00:00Z",
        download_uri="https://data.scryfall.io/start.json",
        content_type="application/json",
        content_encoding=None,
        compressed_size=len(payload),
    )

    result = provider.download_bulk(descriptor, tmp_path / "all_cards.json")

    assert result.path.read_bytes() == payload
    assert [request.url.host for request in requests] == [
        "data.scryfall.io",
        "data.scryfall.io",
    ]


def test_bulk_download_rejects_redirect_host_before_request(tmp_path: Path) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host != "data.scryfall.io":
            pytest.fail(f"redirect target must not be requested: {request.url}")
        return httpx.Response(
            302,
            request=request,
            headers={"Location": "https://downloads.example/all-cards.json"},
        )

    provider = ScryfallProvider(
        WorkerConfig.from_environment({}),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    descriptor = BulkDataDescriptor(
        provider_object_id="bulk-object",
        source_type="all_cards",
        updated_at="2026-07-26T12:00:00Z",
        download_uri="https://data.scryfall.io/start.json",
        content_type="application/json",
        content_encoding=None,
        compressed_size=100,
    )

    with pytest.raises(ProviderResponseError, match="approved Scryfall bulk host"):
        provider.download_bulk(descriptor, tmp_path / "all_cards.json")

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
    descriptor = BulkDataDescriptor(
        provider_object_id="bulk-object",
        source_type="all_cards",
        updated_at="2026-07-26T12:00:00Z",
        download_uri="https://data.scryfall.io/all-cards.json",
        content_type="application/json",
        content_encoding=None,
        compressed_size=11,
    )

    with pytest.raises(DownloadSizeExceededError, match="Provider-declared"):
        provider.download_bulk(descriptor, tmp_path / "all_cards.json")
