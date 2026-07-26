#!/usr/bin/env bash
set -euo pipefail

python3.13 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e "./services/catalog-worker[dev]"

printf '%s\n' "Python 3.13 environment ready at .venv"
