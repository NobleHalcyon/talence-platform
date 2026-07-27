import json
from pathlib import Path

import pytest

from talence_catalog.cli import entrypoint


def test_status_reports_phase_2_capabilities_without_database(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TALENCE_DATABASE_URL", raising=False)
    assert entrypoint(["status"]) == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["database_configured"] is False
    assert payload["phase"] == 2
    assert payload["capabilities"]["fixture_import"] is True
    assert payload["capabilities"]["fixture_network_access"] is False
    assert payload["capabilities"]["live_provider_import"] is True
    assert payload["capabilities"]["catalog_promotion"] is True


def test_fixture_import_dry_run_is_network_and_database_free(
    cards_fixture_path: Path,
    sets_fixture_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TALENCE_DATABASE_URL", raising=False)
    assert (
        entrypoint(
            [
                "fixture-import",
                "--dry-run",
                "--cards",
                str(cards_fixture_path),
                "--sets",
                str(sets_fixture_path),
            ]
        )
        == 0
    )
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["status"] == "validated"
    assert payload["mode"] == "fixture_dry_run"
    assert payload["database_writes"] is False
    assert payload["network_requests"] is False
    assert payload["promoted"] is False
    assert payload["record_counts"]["printings"] == 4


def test_fixture_import_requires_database_without_dry_run(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TALENCE_DATABASE_URL", raising=False)

    assert entrypoint(["fixture-import"]) == 2

    payload = json.loads(capsys.readouterr().err)
    assert payload["status"] == "failed"
    assert payload["error_code"] == "configuration_invalid"
    assert payload["promoted"] is False
