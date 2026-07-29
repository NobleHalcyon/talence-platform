from __future__ import annotations

from datetime import UTC, datetime, timedelta


def parse_timestamp(value: str, *, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO-8601 date-time.") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a UTC offset.")
    return parsed.astimezone(UTC)


def format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("Timestamp must include a UTC offset.")
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def stale_after_timestamp(observed_at: str, *, stale_after_hours: int) -> str:
    if stale_after_hours <= 0:
        raise ValueError("stale_after_hours must be greater than zero.")
    observed = parse_timestamp(observed_at, label="provider observed timestamp")
    return format_timestamp(observed + timedelta(hours=stale_after_hours))


def utc_now_timestamp() -> str:
    return format_timestamp(datetime.now(UTC))
