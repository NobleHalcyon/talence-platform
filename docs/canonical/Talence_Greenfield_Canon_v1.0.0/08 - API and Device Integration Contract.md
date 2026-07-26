# 08 — API and Device Integration Contract

Version: 1.0.0  
Status: Locked

## 1. API purpose

The API serves:

- approved machines;
- future mobile scanners;
- controlled administrative tooling;
- future third-party integrations.

The browser may use the same route handlers where useful, but human UI implementation details do not redefine the external contract.

## 2. Base path and versioning

Base path:

`/api/v1`

Breaking payload or semantic changes require a new major path. Additive optional fields may be introduced within v1 when old clients remain valid.

Every response includes or echoes a correlation/request ID.

## 3. Response shape

Success:

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid"
  }
}
```

Error:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "human-readable summary",
    "details": {}
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

`details` never contains secrets, stack traces, SQL, or unrelated tenant data.

## 4. Device credential format

Recommended raw format:

`tlc_dev_<credential-id-prefix>_<base64url-random-secret>`

Properties:

- at least 256 bits of random secret material;
- prefix identifies a candidate credential row without being sufficient for auth;
- raw secret shown once;
- SHA-256 digest of the full secret, or HMAC-SHA-256 with a server-held pepper, stored in `app_private`;
- constant-time digest comparison;
- independently revocable and rotatable;
- no human refresh token on a device.

Transport:

`Authorization: Bearer <device-credential>`

All requests require HTTPS.

## 5. Device authorization sequence

For every device request:

1. apply Vercel/firewall route limits;
2. parse credential prefix and secret;
3. find active credential by prefix;
4. compare digest in constant time;
5. require credential not expired/revoked;
6. require device active;
7. update last-used/last-seen using a bounded write strategy;
8. verify requested collection grant and permission;
9. verify workspace consistency;
10. verify feature/quota guard;
11. perform the operation through an atomic database function.

A failed check returns the least revealing stable error appropriate to the client.

## 6. Idempotency

Mutation endpoints require:

`Idempotency-Key: <client-generated-unique-key>`

Rules:

- scope is device plus endpoint/resource;
- server canonicalizes and hashes the validated request body;
- first accepted request stores key, hash, and result;
- identical replay returns the stored result and an idempotent-replay indicator;
- same key with a different body returns `409 idempotency_conflict`;
- in-progress duplicate may return the original result when available or `409 request_in_progress`;
- retention must exceed the expected device offline/retry window.

## 7. Pagination

- keyset/cursor pagination;
- default limit 50;
- maximum limit 200 unless an endpoint states otherwise;
- opaque cursor;
- stable deterministic ordering;
- no page-number contract for large catalogs.

## 8. Human/admin endpoints

The exact web UI may use Server Actions, but these stable operations are required:

### Admission administration

- `POST /api/v1/admin/invited-users`
- `GET /api/v1/admin/invited-users`
- `POST /api/v1/admin/invited-users/{id}/send`
- `POST /api/v1/admin/invited-users/{id}/revoke`

Platform-admin only.

### Catalog operations

- `GET /api/v1/admin/catalog/status`
- `POST /api/v1/admin/catalog/sync`
- `GET /api/v1/admin/catalog/imports/{id}`

The sync endpoint queues/triggers work; it does not perform a bulk import inside the request.

## 9. Catalog endpoints for admitted humans

At minimum:

- `GET /api/v1/catalog/search`
- `GET /api/v1/catalog/cards/{card_id}`
- `GET /api/v1/catalog/cards/{card_id}/printings`
- `GET /api/v1/catalog/printings/{printing_id}`
- `GET /api/v1/catalog/sets`
- `GET /api/v1/catalog/sets/{set_id_or_code}`
- `GET /api/v1/catalog/status`

Anonymous access is denied during private beta.

## 10. Collection and deck operations

Human operations may be exposed through Server Actions or routes, but their semantics are canonical:

- create/archive/restore collections;
- list/search balances;
- apply inventory transaction;
- transfer inventory;
- reverse transaction;
- stage/preview/commit import;
- create/edit/archive decks;
- calculate ownership and validation.

Direct update of inventory balances or immutable transaction rows is never an API operation.

## 11. Device endpoints

### `GET /api/v1/device/me`

Returns:

- device ID/name/type/status;
- workspace ID;
- granted collection IDs and permissions;
- server time;
- API version.

### `POST /api/v1/device/heartbeat`

Request:

- client software version;
- firmware version optional;
- installed catalog snapshot version;
- bounded health/status fields.

Does not accept motion state as cloud authority.

### `GET /api/v1/device/catalog/manifest`

Query/headers include:

- current snapshot version optional;
- client version;
- supported snapshot schema versions.

Returns either:

- `up_to_date: true`, or
- immutable snapshot metadata and short-lived signed download URL.

### `POST /api/v1/device/collections/{collection_id}/inventory-batches`

Required permission: `inventory_write`.

Headers:

- device credential;
- idempotency key.

Body:

- schema version;
- catalog snapshot version;
- occurred time;
- optional external run ID;
- array of printing-level quantity deltas;
- bounded metadata.

Validation:

- collection grant;
- maximum line count and body size;
- known active printing IDs;
- valid finish and condition;
- nonzero bounded deltas;
- resulting quantities nonnegative;
- body hash/idempotency;
- optional snapshot compatibility warning/error policy.

Commit:

- one device-sync batch;
- one inventory transaction;
- all transaction lines;
- all materialized balance changes;
- atomic success or no change.

### `POST /api/v1/device/runs`

Required permission: `run_summary_write`.

Body includes:

- external run ID;
- collection ID;
- status;
- snapshot version;
- start/end times;
- total/recognized/unrecognized/posted counts;
- optional safe diagnostic code.

Idempotent by device + external run ID.

### `GET /api/v1/device/collections/{collection_id}/inventory`

Optional P1 endpoint, permission `inventory_read`.

Returns bounded/current balances for synchronization or collection-aware robot rules. Pagination required.

## 12. Device inventory line contract

Canonical line:

```json
{
  "line_id": "client-stable-line-id",
  "printing_id": "uuid",
  "finish": "nonfoil",
  "condition": "near_mint",
  "quantity_delta": 1
}
```

Rules:

- `line_id` unique within the batch;
- printing ID is the Talence/Scryfall-compatible printing UUID from the snapshot;
- quantity delta is signed, nonzero, and within configured bounds;
- finish and condition use canonical values;
- exact physical instance IDs may appear only in bounded metadata until per-copy provenance is ratified.

## 13. Unknown or stale catalog behavior

If a device submits an unknown printing:

- reject the batch atomically with `catalog_printing_unknown`;
- include the unknown IDs in bounded details;
- include latest compatible snapshot version when available;
- do not silently create catalog rows;
- allow the device to update catalog and retry with the same semantic operation but a new idempotency key unless no transaction was stored. The implementation must document exact retry behavior.

If snapshot is old but IDs remain valid, accept or warn according to a configurable minimum-compatible version. Do not reject solely because a newer snapshot exists.

## 14. Rate and size controls

Initial configurable bounds:

- heartbeat: low per-minute limit per device;
- inventory batches: bounded per minute and per day;
- maximum request body;
- maximum 500 lines per batch initially;
- maximum absolute delta per line;
- signed URL duration;
- catalog downloads per device/day;
- failed credential attempts per source.

The exact values are operations configuration, not hardcoded in components.

## 15. API observability

Log:

- request/correlation ID;
- route and API version;
- result code;
- device ID after successful auth;
- collection/resource ID where safe;
- duration;
- line count/body size category;
- idempotent replay indicator.

Never log:

- raw credential;
- authorization header;
- secret digest;
- entire inventory body by default;
- user auth token;
- signed artifact URL.

## 16. Prohibited device operations

No device endpoint may:

- start physical motion remotely;
- upload arbitrary SQL/catalog rows;
- patch current prices;
- grant itself collection access;
- create human users;
- mutate workspace membership;
- alter an accepted inventory transaction;
- treat cloud run status as the robot execution checkpoint.

## 17. Contract artifacts

The machine-readable OpenAPI and JSON Schema files in `contracts/` are part of canon. Generated clients must be derived from them rather than hand-maintained incompatible payload types.
