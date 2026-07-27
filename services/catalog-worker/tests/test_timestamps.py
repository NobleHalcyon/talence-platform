import pytest

from talence_catalog.timestamps import stale_after_timestamp


def test_price_stale_after_is_derived_from_provider_observation() -> None:
    assert (
        stale_after_timestamp(
            "2026-07-26T07:00:00-05:00",
            stale_after_hours=36,
        )
        == "2026-07-28T00:00:00Z"
    )


def test_price_stale_after_rejects_naive_observation() -> None:
    with pytest.raises(ValueError, match="UTC offset"):
        stale_after_timestamp(
            "2026-07-26T12:00:00",
            stale_after_hours=36,
        )
