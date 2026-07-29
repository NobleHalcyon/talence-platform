from __future__ import annotations

import ipaddress
from urllib.parse import urlparse


def require_disposable_local_supabase_database(database_url: str) -> str:
    """Reject integration targets outside the standard local Supabase database."""

    try:
        parsed = urlparse(database_url)
        hostname = parsed.hostname
        port = parsed.port
        address = ipaddress.ip_address(hostname) if hostname is not None else None
    except (ValueError, TypeError) as error:
        raise ValueError(
            "Snapshot integration requires the disposable loopback Supabase database."
        ) from error

    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or address is None
        or not address.is_loopback
        or port != 54322
        or parsed.path != "/postgres"
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Snapshot integration requires the disposable loopback Supabase database.")
    return database_url
