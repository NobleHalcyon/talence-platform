# Talence Canonical Contracts

These contracts are normative companions to the numbered canon.

- `device-api.openapi.yaml` — stable external machine API surface
- `device-inventory-batch.schema.json` — inventory mutation request
- `device-run-summary.schema.json` — run summary request
- `catalog-snapshot-manifest.schema.json` — robot catalog manifest
- `edge-catalog-schema.sql` — immutable SQLite catalog snapshot schema consumed by robots

Generated clients and runtime validators should be derived from these files. Implementation may add response fields only when backward compatible and reflected here.
