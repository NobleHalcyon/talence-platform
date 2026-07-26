# Talence Catalog Worker

This Python 3.13 package is the Phase 0 foundation for the server-side Scryfall
catalog pipeline. It currently provides:

- injected, mockable Scryfall metadata access with bounded retry;
- streamed temporary-file download and SHA-256 accounting;
- streaming fixture normalization for sets, oracle cards, printings, faces,
  legalities, external IDs, and non-null current prices;
- canonical SQLite schema creation and integrity checks;
- honest fixture validation and capability-status CLI commands.

It does **not** connect to PostgreSQL, promote a catalog, upload artifacts, or
perform a live import yet. The `fixture-import` command validates and summarizes
the staged representation only and reports that no database mutation occurred.

Windows setup:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy src
```
