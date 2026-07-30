# Scryfall live bulk discovery fix

Date: 2026-07-29

Branch: `fix/scryfall-live-bulk-descriptor`

## Root cause and live contract

The worker reproduced the reported `provider_failed` result against the live
API with an explicit Talence user agent and the configured Accept header. The
failure was an outdated parser assumption, not a transient provider response.
Talence requested the bulk list, selected `all_cards`, and then required the
legacy `download_uri` and `content_type` fields. The current list and
individual descriptor both omit those fields and expose a gzipped JSONL source
through `jsonl_download_uri`.

The minimum sanitized descriptor observed from both endpoints was:

```json
{
  "object": "bulk_data",
  "id": "<provider UUID>",
  "type": "all_cards",
  "updated_at": "2026-07-29T21:27:56.280+00:00",
  "uri": "https://api.scryfall.com/bulk-data/<provider UUID>",
  "name": "All Cards",
  "description": "<provider description>",
  "jsonl_download_uri": "https://data.scryfall.io/all-cards/<timestamp>.jsonl.gz",
  "compressed_size": 389772467
}
```

The observed download returned `Content-Type: application/gzip`, no HTTP
`Content-Encoding`, and a `Content-Length` equal to `compressed_size`. The
descriptor contained no `download_uri`, `content_type`, `content_encoding`, or
legacy `size` field.

## Implementation

- Discovery now calls the supported, type-specific
  `GET https://api.scryfall.com/bulk-data/all-cards` endpoint. It requires a
  `bulk_data` object whose type is exactly `all_cards`, a non-empty
  `jsonl_download_uri`, and a positive integer `compressed_size`.
- The download contract is explicitly `application/gzip` plus gzipped JSONL.
  Raw response bytes stream into the existing atomic size-bounded downloader;
  gzip decompression and one-object-per-line JSON parsing are incremental.
- JSONL errors include only a bounded line number and never echo provider card
  payloads. Legacy fixture JSON arrays continue through the network-free
  `ijson` path.
- A live import cannot start from the CLI unless the operator explicitly
  supplies `TALENCE_CATALOG_USER_AGENT` with a Talence identifier and monitored
  HTTPS or mailto contact.
- Live data exposed several independent schema edge cases after descriptor
  discovery was repaired:
  - printing-level legality differences collapse deterministically using
    `banned`, `restricted`, `legal`, then `not_legal` precedence;
  - third-party identifiers reused for multiple entities are marked during
    bounded staging and omitted atomically rather than assigned arbitrarily;
  - a price is omitted when its implied finish is not offered by the printing;
  - provider set metadata that claims both foil-only and nonfoil-only is treated
    as mixed/unspecified;
  - a legitimate punctuation-only card name such as `_____` retains a
    deterministic, wildcard-safe `symbol` plus UTF-8 hex search value in Python
    and PostgreSQL.
- The existing Phase 6 browser journey now applies the `m10` filter when it
  asserts the Magic 2010 Lightning Bolt printing, avoiding fixture-sized
  first-page ranking assumptions while preserving the same journey.

## Security and atomicity retained

- Metadata remains HTTPS-only and paced below ten requests per second with
  bounded transient retries and no retry of permanent failures.
- Bulk URLs and every redirect remain HTTPS-only, credential-free,
  explicit-port-free, and restricted to `data.scryfall.io`.
- Declared and streamed byte limits remain enforced. Downloads use an atomic
  temporary file and are removed after the run.
- Browser code makes no paid or provider catalog request and receives no worker
  database credential.
- Missing prices remain absent; no path converts them to zero.
- All normalized rows remain private and import-scoped until validation.
  Promotion and ambiguous-ID cleanup share one advisory-locked transaction.
  Any discovery, download, parse, validation, or promotion failure leaves the
  active catalog pointer and public rows unchanged.

## Live disposable-Supabase evidence

The final clean live run succeeded and atomically promoted
`mtg-20260729T212756Z-92a04b7e-s1`:

- source records: 538,418;
- sets: 1,047;
- oracle cards: 38,416;
- printings: 538,418;
- faces: 550,373;
- legalities: 883,568;
- unambiguous external IDs: 1,295,457;
- ambiguous external IDs omitted: 3,425;
- non-null, finish-compatible prices: 355,673;
- rejected records: 0.

An immediate second live command completed in 1.640 seconds with
`status: unchanged`, `promoted: false`, the same source/import identity, and no
bulk download. A deliberately empty candidate then failed with
`normalization_failed`; the live active import ID and catalog version were
identical before and after. The authenticated Phase 6 Chromium journey passed
against the live catalog and rendered the real Magic 2010 Lightning Bolt
printing. A direct live-data check found 427,342 active printings with no price
row, zero price rows whose finish was unavailable on their printing, and the
two punctuation-only names represented by wildcard-safe normalized values.

No downloaded bulk file, provider payload, local database contents, personal
operator address, or credential is committed.

## Exact operator command

Run from the repository root after opening the reviewed database sync gate:

```powershell
$env:TALENCE_DATABASE_URL = "<direct PostgreSQL worker URL>"
$env:TALENCE_CATALOG_USER_AGENT = "Talence-Catalog-Worker/0.2 (+https://your-domain.example/contact)"
.\.venv\Scripts\python.exe -m talence_catalog live-import --trigger-type manual
```

Replace the user-agent placeholder with an operator-controlled monitored
contact. Keep the database URL and any future worker credentials in protected
server-side environment configuration.

## Validation

- Current descriptor, endpoint, malformed URI, scheme/host/credential/port,
  redirect, size, retry, permanent-failure, content-type, and raw gzip tests are
  network-free.
- Gzipped JSONL normalization, sanitized failure, legality reconciliation,
  ambiguous-ID reconciliation, finish-aware prices, contradictory set flags,
  punctuation-only names, fixture import, unchanged detection, and atomic
  promotion have regression coverage.
- Sanitized provider/normalization/importer regression selection: 75 passed.
- `.\.venv\Scripts\python.exe -m pytest services\catalog-worker\tests`: 113
  passed and four expected environment-gated integration tests skipped.
- PostgreSQL worker integration selection with `TALENCE_DATABASE_URL`: two
  passed, including cross-batch legality/external-ID reconciliation and failed
  candidate preservation.
- `npm run test:supabase`: 31 files and 811 pgTAP assertions passed. This suite
  caught and prevented an intermediate raw-punctuation fallback that could
  have retained SQL wildcard meaning.
- `npm run test:e2e:phase6-live --workspace @talence/web`: one complete
  authenticated Chromium private-beta journey passed against the live catalog.
- `npm run ci`: canonical/architecture/secret/release guards, both dependency
  audits, formatting, lint, types, 241 web tests, 20 package tests, 18 admin
  tests, 113 Python tests, contract checks, production build, browser-bundle
  scan, and production security-header smoke test passed.
- `git diff --check`: passed.

The first pgTAP invocation could not find `docker.exe` in the inherited VS Code
`PATH` even though Docker Desktop was healthy. Prepending the verified
`Programs\DockerDesktop\resources\bin` directory for that process allowed the
complete suite to run.
