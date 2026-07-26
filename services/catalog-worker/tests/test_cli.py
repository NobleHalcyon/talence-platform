import json
from pathlib import Path

import pytest

from talence_catalog.cli import entrypoint


def test_status_is_honest_about_unimplemented_live_capabilities(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert entrypoint(["status"]) == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["database_writes"] is False
    assert payload["capabilities"]["fixture_normalization"] is True
    assert payload["capabilities"]["live_provider_import"] is False
    assert payload["capabilities"]["catalog_promotion"] is False


def test_fixture_import_reports_validation_only(
    cards_fixture_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert entrypoint(["fixture-import", "--cards", str(cards_fixture_path)]) == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["status"] == "validated"
    assert payload["mode"] == "fixture_validation_only"
    assert payload["database_writes"] is False
    assert payload["promoted"] is False
    assert payload["record_counts"]["printings"] == 4
