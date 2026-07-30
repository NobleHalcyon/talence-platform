# Talence Catalog Worker

Python 3.13 worker for Talence's trusted Scryfall catalog and current-price
pipeline. Fixture and live imports share the same PostgreSQL staging,
validation, and atomic-promotion boundary. Phase 5 can export the active
generation into the canonical robot SQLite schema, upload the immutable
artifact, and atomically publish its manifest.

## Safety properties

- Live mode discovers exactly Scryfall `all_cards` through
  `GET https://api.scryfall.com/bulk-data/all-cards` and separately reads
  authoritative set metadata.
- Fixture mode opens only the supplied local files; it cannot instantiate the
  Scryfall client or make a network request.
- Metadata and bulk requests require HTTPS, a descriptive contact-bearing
  `User-Agent`, and
  `Accept: application/json;q=0.9,*/*;q=0.8`.
- Metadata requests are paced below 10 requests/second. Transient retries use
  bounded exponential backoff; permanent HTTP failures are not retried.
- The current descriptor must expose a positive `compressed_size` and an
  HTTPS `jsonl_download_uri`. Gzipped JSONL bytes stream through a size-bounded
  atomic temporary file while calculating the literal `all_cards` SHA-256.
- Bulk downloads are restricted to the official `data.scryfall.io` host.
  Redirect targets are validated before they are requested.
- Gzip decompression and JSONL parsing are incremental; the legacy fixture JSON
  array remains incremental through `ijson`. PostgreSQL writes are bounded by
  `TALENCE_CATALOG_BATCH_SIZE`.
- Normalization and database validation are fail-fast. One rejected source
  record fails the whole candidate import; there is no rejection-tolerance
  setting.
- Set, oracle-card, printing, face, legality, external-ID, and non-null price
  rows are isolated by import ID until database validation succeeds.
- Running imports heartbeat through their database lease after each bounded
  batch. A new worker may recover a running lease only after its
  database-owned 30-minute heartbeat window expires.
- Promotion is one advisory-locked database transaction. A download, parse,
  validation, or promotion failure leaves the previously active catalog
  unchanged.
- Snapshot generation holds the same catalog advisory lock in a read-only,
  repeatable-read transaction and streams rows in primary-key order.
- Snapshot metadata uses the combined cards-and-sets catalog identity. A
  forced re-promotion of the same source therefore produces identical bytes.
- The generated SQLite file must pass `quick_check`, foreign-key validation,
  schema-version, record-count, FTS, and polymorphic external-ID checks before
  upload.
- Snapshot artifacts use the immutable
  `mtg/<catalog-version>/catalog.sqlite` path in the private
  `catalog-snapshots` bucket. An existing object is accepted only when its
  complete byte size and SHA-256 match.
- Artifact upload completes before the database publication RPC. A stale
  catalog generation or publication failure preserves the prior database
  pointer, while an exact retry reuses the uploaded bytes.
- The reference robot client verifies size, SHA-256, SQLite integrity,
  snapshot metadata, and a bounded cloud printing-ID sample before switching
  its local current pointer; it retains the prior compatible snapshot.
- Failures for admin-queued work are persisted even when discovery, set
  normalization, download, or source registration fails before the queue item
  can be claimed. Failure-recording errors are surfaced to the operator.
- Identical source replay is a successful no-op only when that source identity
  is already active, unless `--force` is supplied. Re-selecting a historical
  source promotes it again instead of reporting the different active catalog
  as unchanged.
- An unchanged admin-queued live import is completed as a successful,
  replay-safe no-op after provider metadata and set normalization, before the
  bulk card file is downloaded. A queue item marked `requested_force` continues
  through the full download and import path.
- Missing provider prices create no row and are never converted to zero.
- A provider price whose implied finish is unavailable on that printing also
  creates no row. Reused third-party IDs that resolve to multiple entities are
  omitted rather than assigned arbitrarily; their omission count is returned
  in validation and promotion results.

The catalog input identity covers both sources without losing their
provenance:

1. `catalog_source_files.sha256` is the literal downloaded `all_cards` SHA-256.
2. `dependency_sha256` is a deterministic hash of the normalized set fields
   Talence consumes.
3. `catalog_identity_sha256` is
   `SHA-256(bytes(all_cards SHA) || bytes(sets SHA))`.
4. The canonical version is
   `mtg-<provider-observed-UTC>-<catalog-identity-prefix>-s1`.

Changing consumed set metadata therefore defeats unchanged-source detection
and produces a new catalog version even when `all_cards` is byte-identical.

## Windows setup

From `services\catalog-worker`:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy src
```

From the repository root, the same checks can use the root virtual
environment:

```powershell
.\.venv\Scripts\python.exe -m ruff check services\catalog-worker
.\.venv\Scripts\python.exe -m ruff format --check services\catalog-worker
.\.venv\Scripts\python.exe -m mypy services\catalog-worker\src
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests
```

## Commands

Offline validation, with no database and no network:

```powershell
talence-catalog validate
talence-catalog fixture-import --dry-run
```

Complete fixture promotion into local Supabase:

```powershell
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
talence-catalog fixture-import
```

The fixture command defaults to `fixtures\scryfall\all_cards.json` and
`fixtures\scryfall\sets.json`; override them with `--cards` and `--sets`.

Live mode is an explicit operator action:

```powershell
$env:TALENCE_DATABASE_URL = "<direct PostgreSQL worker URL>"
$env:TALENCE_CATALOG_USER_AGENT = "Talence-Catalog-Worker/0.2 (+https://your-domain.example/contact)"
.\.venv\Scripts\python.exe -m talence_catalog live-import --trigger-type manual
```

Run that block from the repository root. The live command refuses to start
unless the operator explicitly supplies the contact-bearing user agent; the
checked-in example is a placeholder, not a production identity.

Use `--force` only for a deliberate replay. A queued admin request can be
claimed with `--queued-import-id <uuid>`. Do not put the database URL on the
command line, where it may be exposed through process inspection.

Status reports local capabilities and, when `TALENCE_DATABASE_URL` is set, the
database sync switch, active version, latest successful source metadata, and
next queued request:

```powershell
talence-catalog status
```

Publish the active catalog to a local immutable artifact root:

```powershell
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$env:TALENCE_SNAPSHOT_STORAGE_BACKEND = "local"
$env:TALENCE_SNAPSHOT_STORAGE_ROOT = "C:\talence-snapshots"
talence-catalog snapshot-publish
```

For the private production bucket, use the server-only Supabase project URL
and secret key:

```powershell
$env:TALENCE_SNAPSHOT_STORAGE_BACKEND = "supabase"
$env:SUPABASE_URL = "https://project-ref.supabase.co"
$env:SUPABASE_SECRET_KEY = "<worker secret key>"
talence-catalog snapshot-publish
```

The upload is create-only and is verified by downloading and hashing the
private object before the database pointer is published. Never expose the
database URL or Supabase secret key to browser code.

Snapshot `generated_at` is the catalog provider-observation timestamp encoded
in the catalog-version identity. It is intentionally independent of the
worker's mutable download wall clock so rebuilding the same version remains
byte-identical. Snapshot price `ingested_at` uses the same reproducible
catalog-generation timestamp; price `observed_at` remains the provider
observation carried by each price row.

## Configuration

`TALENCE_DATABASE_URL` is required for live import, fixture promotion, and
snapshot publication. A production snapshot publication also requires
`SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The remaining settings are
non-secret operational bounds:

- `TALENCE_CATALOG_USER_AGENT`
- `TALENCE_CATALOG_MAX_DOWNLOAD_BYTES`
- `TALENCE_CATALOG_REQUEST_TIMEOUT_SECONDS`
- `TALENCE_CATALOG_MAXIMUM_ATTEMPTS`
- `TALENCE_CATALOG_RETRY_BASE_SECONDS`
- `TALENCE_CATALOG_METADATA_MINIMUM_INTERVAL_SECONDS` (must be greater than
  `0.1`)
- `TALENCE_CATALOG_BATCH_SIZE`
- `TALENCE_CATALOG_PRICE_STALE_AFTER_HOURS` (default `36`)
- `TALENCE_CATALOG_TEMP_DIRECTORY`
- `TALENCE_SNAPSHOT_STORAGE_BACKEND` (`local` or `supabase`; default `local`)
- `TALENCE_SNAPSHOT_STORAGE_ROOT` (required for the local adapter)
- `TALENCE_SNAPSHOT_STORAGE_BUCKET` (must remain `catalog-snapshots` for
  publication)
- `TALENCE_SNAPSHOT_API_CONTRACT_VERSION` (default `v1`)
- `TALENCE_SNAPSHOT_MINIMUM_CLIENT_VERSION` (default `0.1.0`)
- `TALENCE_SNAPSHOT_MAX_BYTES` (default and maximum `1073741824`)
- `TALENCE_SNAPSHOT_BATCH_SIZE` (default `5000`)
- `TALENCE_SNAPSHOT_STORAGE_TIMEOUT_SECONDS` (default `120`)

The database URL and artifact-storage credentials are worker-only and must
never use a browser-visible environment variable.

## Local snapshot integration

After the local Supabase migrations have been reset and started, run the
named snapshot integration path from the repository root:

```powershell
$env:TALENCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests\test_snapshot_database_integration.py -m integration
```

The test hard-refuses hosted, hostname-based, nonstandard-port, and
non-`postgres` database targets. It promotes the fixture catalog, generates
and publishes the populated SQLite artifact, samples cloud/edge printing IDs,
replays publication, then force-promotes the same source and proves the
artifact bytes remain identical.

## GitHub workflow gate

`.github/workflows/catalog-sync.yml` permits a manual, secret-free fixture
validation. The live job remains explicitly disabled, has no production
secret wiring, and has no schedule. Enabling it requires the product owner's
human setup gate: configure protected worker secrets, approve the first live
import, then deliberately remove the job guard and add the chosen daily
schedule.
