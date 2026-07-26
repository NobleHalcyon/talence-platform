import os
import shutil
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest


@pytest.fixture
def tmp_path() -> Iterator[Path]:
    configured_root = os.environ.get("TALENCE_PYTEST_TEMP_ROOT")
    temporary_root = (
        Path(configured_root)
        if configured_root
        else Path(__file__).resolve().parents[1] / ".test-tmp"
    )
    temporary_root.mkdir(parents=True, exist_ok=True)
    test_directory = temporary_root / f"case-{uuid4().hex}"
    test_directory.mkdir()
    try:
        yield test_directory
    finally:
        shutil.rmtree(test_directory)
        if not configured_root:
            temporary_root.rmdir()


@pytest.fixture
def cards_fixture_path() -> Path:
    return Path(__file__).resolve().parents[1] / "fixtures" / "scryfall" / "all_cards.json"


@pytest.fixture
def canonical_snapshot_schema_path() -> Path:
    return (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "canonical"
        / "edge-catalog-schema.sql"
    )
