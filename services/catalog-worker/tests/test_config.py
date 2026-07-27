import pytest

from talence_catalog.config import ConfigurationError, WorkerConfig


def test_configuration_uses_safe_non_secret_defaults() -> None:
    config = WorkerConfig.from_environment({})

    assert "Talence" in config.user_agent
    assert config.maximum_download_bytes > 0
    assert config.metadata_minimum_interval_seconds >= 0.1
    assert config.price_stale_after_hours == 36
    assert config.database_url is None
    assert not hasattr(config, "maximum_rejected_records")


def test_configuration_rejects_unidentified_user_agent() -> None:
    with pytest.raises(ConfigurationError, match="identify Talence"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_USER_AGENT": "generic-client"})


def test_configuration_requires_user_agent_contact_context() -> None:
    with pytest.raises(ConfigurationError, match="contact/reference"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_USER_AGENT": "Talence-Catalog-Worker/0.2"})


def test_configuration_cannot_exceed_scryfall_metadata_rate_guidance() -> None:
    with pytest.raises(ConfigurationError, match="below 10"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS": "0.1"})


def test_database_url_is_excluded_from_repr() -> None:
    config = WorkerConfig.from_environment(
        {
            "TALENCE_DATABASE_URL": "postgresql://sensitive.example/private",
        }
    )

    assert "sensitive" not in repr(config)
