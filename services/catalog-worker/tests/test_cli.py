import json
from pathlib import Path

import pytest

from talence_catalog.cli import entrypoint


def test_status_reports_phase_5_capabilities_without_database(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TALENCE_DATABASE_URL", raising=False)
    assert entrypoint(["status"]) == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["database_configured"] is False
    assert payload["phase"] == 5
    assert payload["capabilities"]["fixture_import"] is True
    assert payload["capabilities"]["fixture_network_access"] is False
    assert payload["capabilities"]["live_provider_import"] is True
    assert payload["capabilities"]["catalog_promotion"] is True
    assert payload["capabilities"]["snapshot_sqlite_generation"] is True
    assert payload["capabilities"]["snapshot_artifact_upload"] is True
    assert payload["capabilities"]["snapshot_manifest_publication"] is True


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


def test_snapshot_publish_requires_database_and_storage_configuration_before_io(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TALENCE_DATABASE_URL", raising=False)
    monkeypatch.delenv("TALENCE_SNAPSHOT_STORAGE_ROOT", raising=False)

    assert entrypoint(["snapshot-publish"]) == 2

    payload = json.loads(capsys.readouterr().err)
    assert payload["status"] == "failed"
    assert payload["error_code"] == "configuration_invalid"
    assert "TALENCE_DATABASE_URL" in payload["message"]

    monkeypatch.setenv(
        "TALENCE_DATABASE_URL",
        "postgresql://worker:secret@hosted.example/database",
    )
    monkeypatch.setenv("TALENCE_SNAPSHOT_STORAGE_BACKEND", "local")
    assert entrypoint(["snapshot-publish"]) == 2

    payload = json.loads(capsys.readouterr().err)
    assert payload["error_code"] == "configuration_invalid"
    assert "TALENCE_SNAPSHOT_STORAGE_ROOT" in payload["message"]
    assert "secret" not in payload["message"]
