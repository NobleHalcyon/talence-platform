import pytest

from talence_catalog.config import ConfigurationError, WorkerConfig


def test_configuration_uses_safe_non_secret_defaults() -> None:
    config = WorkerConfig.from_environment({})

    assert "Talence" in config.user_agent
    assert config.maximum_download_bytes > 0
    assert config.database_url is None


def test_configuration_rejects_unidentified_user_agent() -> None:
    with pytest.raises(ConfigurationError, match="identify Talence"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_USER_AGENT": "generic-client"})


def test_database_url_is_excluded_from_repr() -> None:
    config = WorkerConfig.from_environment(
        {
            "TALENCE_DATABASE_URL": "postgresql://sensitive.example/private",
        }
    )

    assert "sensitive" not in repr(config)
