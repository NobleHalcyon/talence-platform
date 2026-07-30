import pytest

from talence_catalog.config import ConfigurationError, WorkerConfig


def test_configuration_uses_safe_non_secret_defaults() -> None:
    config = WorkerConfig.from_environment({})

    assert "Talence" in config.user_agent
    assert config.user_agent_explicitly_configured is False
    assert config.maximum_download_bytes > 0
    assert config.metadata_minimum_interval_seconds >= 0.1
    assert config.price_stale_after_hours == 36
    assert config.database_url is None
    assert config.snapshot_maximum_bytes == 1_073_741_824
    assert config.snapshot_storage_bucket == "catalog-snapshots"
    assert not hasattr(config, "maximum_rejected_records")


def test_configuration_rejects_unidentified_user_agent() -> None:
    with pytest.raises(ConfigurationError, match="identify Talence"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_USER_AGENT": "generic-client"})


def test_configuration_requires_user_agent_contact_context() -> None:
    with pytest.raises(ConfigurationError, match="contact/reference"):
        WorkerConfig.from_environment({"TALENCE_CATALOG_USER_AGENT": "Talence-Catalog-Worker/0.2"})


def test_configuration_records_an_explicit_operator_user_agent() -> None:
    config = WorkerConfig.from_environment(
        {
            "TALENCE_CATALOG_USER_AGENT": (
                "Talence-Catalog-Worker/0.2 (+https://operator.example/contact)"
            )
        }
    )

    assert config.user_agent_explicitly_configured is True


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


def test_snapshot_size_override_cannot_exceed_storage_and_database_ceiling() -> None:
    with pytest.raises(ConfigurationError, match="at most 1073741824"):
        WorkerConfig.from_environment({"TALENCE_SNAPSHOT_MAX_BYTES": "1073741825"})


def test_snapshot_timeout_must_be_finite() -> None:
    with pytest.raises(ConfigurationError, match="greater than zero"):
        WorkerConfig.from_environment({"TALENCE_SNAPSHOT_STORAGE_TIMEOUT_SECONDS": "nan"})


def test_snapshot_secret_key_is_excluded_from_repr() -> None:
    config = WorkerConfig.from_environment(
        {
            "SUPABASE_SECRET_KEY": "sensitive-storage-key",
        }
    )

    assert "sensitive-storage-key" not in repr(config)


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        (
            "TALENCE_SNAPSHOT_STORAGE_BUCKET",
            "other-bucket",
            "must be catalog-snapshots",
        ),
        (
            "TALENCE_SNAPSHOT_API_CONTRACT_VERSION",
            "latest",
            "must use the vN shape",
        ),
        (
            "TALENCE_SNAPSHOT_MINIMUM_CLIENT_VERSION",
            "soon",
            "canonical version shape",
        ),
    ],
)
def test_snapshot_publication_identity_configuration_is_validated_before_upload(
    name: str,
    value: str,
    message: str,
) -> None:
    with pytest.raises(ConfigurationError, match=message):
        WorkerConfig.from_environment({name: value})
