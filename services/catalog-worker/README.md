# Talence Catalog Worker

Python 3.13 worker for Talence's trusted Scryfall catalog and current-price
pipeline. Phase 2 supports fixture and live imports through the same
PostgreSQL staging, validation, and atomic-promotion boundary.

## Safety properties

- Live mode selects exactly Scryfall `all_cards` and separately reads
  authoritative set metadata.
- Fixture mode opens only the supplied local files; it cannot instantiate the
  Scryfall client or make a network request.
- Metadata and bulk requests require HTTPS, a descriptive contact-bearing
  `User-Agent`, and
  `Accept: application/json;q=0.9,*/*;q=0.8`.
- Metadata requests are paced below 10 requests/second. Transient retries use
  bounded exponential backoff; permanent HTTP failures are not retried.
- Bulk bytes stream through a size-bounded atomic temporary file while
  calculating the literal `all_cards` SHA-256.
- Bulk downloads are restricted to the official `data.scryfall.io` host.
  Redirect targets are validated before they are requested.
- `ijson` parses cards incrementally and PostgreSQL writes are bounded by
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
$env:TALENCE_CATALOG_USER_AGENT = "Talence-Catalog-Worker/0.2 (+https://your-domain.example/contact)"
$env:TALENCE_DATABASE_URL = "<direct PostgreSQL worker URL>"
talence-catalog live-import
```

Use `--force` only for a deliberate replay. A queued admin request can be
claimed with `--queued-import-id <uuid>`. Do not put the database URL on the
command line, where it may be exposed through process inspection.

Status reports local capabilities and, when `TALENCE_DATABASE_URL` is set, the
database sync switch, active version, latest successful source metadata, and
next queued request:

```powershell
talence-catalog status
```

## Configuration

`TALENCE_DATABASE_URL` is the only required live/fixture-promotion secret. The
remaining settings are non-secret operational bounds:

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

The database URL and future artifact-storage credentials are worker-only and
must never use a browser-visible environment variable.

## GitHub workflow gate

`.github/workflows/catalog-sync.yml` permits a manual, secret-free fixture
validation. The live job remains explicitly disabled, has no production
secret wiring, and has no schedule. Enabling it requires the product owner's
human setup gate: configure protected worker secrets, approve the first live
import, then deliberately remove the job guard and add the chosen daily
schedule.

SQLite snapshot population/upload remains Phase 5. The existing snapshot
schema and integrity helpers are retained but are not presented as a Phase 2
capability.
