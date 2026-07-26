from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from talence_catalog.normalize.card import NormalizationError
from talence_catalog.normalize.catalog import normalize_catalog_file

FIXTURE_OBSERVED_AT = "2026-07-26T12:00:00Z"
FIXTURE_INGESTED_AT = "2026-07-26T12:05:00Z"


def fixture_cards_path() -> Path:
    return Path(__file__).resolve().parents[2] / "fixtures" / "scryfall" / "all_cards.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="talence-catalog",
        description="Talence fixture-first catalog worker foundation.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    for command, help_text in (
        (
            "fixture-import",
            "Normalize a local fixture without writing or promoting database state.",
        ),
        ("validate", "Validate and summarize a local Scryfall card array."),
    ):
        command_parser = subcommands.add_parser(command, help=help_text)
        command_parser.add_argument(
            "--cards",
            type=Path,
            default=fixture_cards_path(),
            help="Path to a local top-level Scryfall card array.",
        )
        command_parser.add_argument(
            "--observed-at",
            default=FIXTURE_OBSERVED_AT,
            help="Provider observation timestamp assigned to fixture prices.",
        )
        command_parser.add_argument(
            "--ingested-at",
            default=FIXTURE_INGESTED_AT,
            help="Talence ingestion timestamp assigned during normalization.",
        )

    subcommands.add_parser(
        "status",
        help="Report implemented and intentionally unavailable worker capabilities.",
    )
    return parser


def entrypoint(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)

    if arguments.command == "status":
        _print_json(
            {
                "worker_version": "0.1.0",
                "phase": 0,
                "capabilities": {
                    "fixture_normalization": True,
                    "streamed_download_foundation": True,
                    "snapshot_schema_validation": True,
                    "live_provider_import": False,
                    "postgres_staging": False,
                    "catalog_promotion": False,
                    "artifact_upload": False,
                },
                "database_writes": False,
            }
        )
        return 0

    try:
        catalog = normalize_catalog_file(
            arguments.cards,
            observed_at=arguments.observed_at,
            ingested_at=arguments.ingested_at,
        )
    except (FileNotFoundError, NormalizationError, OSError) as error:
        _print_json(
            {
                "status": "failed",
                "error": type(error).__name__,
                "message": str(error),
                "database_writes": False,
            },
            stream=sys.stderr,
        )
        return 2

    result: dict[str, object] = {
        "status": "validated",
        "source": str(arguments.cards.resolve()),
        "record_counts": catalog.record_counts(),
        "database_writes": False,
        "promoted": False,
    }
    if arguments.command == "fixture-import":
        result["mode"] = "fixture_validation_only"
        result["note"] = "Phase 0 does not connect to PostgreSQL or promote catalog state."
    _print_json(result)
    return 0


def _print_json(payload: object, *, stream: TextIO | None = None) -> None:
    print(
        json.dumps(payload, indent=2, sort_keys=True),
        file=sys.stdout if stream is None else stream,
    )
