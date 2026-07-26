import httpx
import pytest

from talence_catalog.config import WorkerConfig
from talence_catalog.provider.scryfall import ScryfallProvider


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

    provider = ScryfallProvider(config, client=client, sleep=delays.append)
    descriptor = provider.discover_all_cards()

    assert descriptor.source_type == "all_cards"
    assert descriptor.compressed_size == 123
    assert len(requests) == 2
    assert requests[-1].headers["Accept"] == "application/json"
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

    with pytest.raises(httpx.HTTPStatusError):
        provider.discover_all_cards()
    assert request_count == 1
