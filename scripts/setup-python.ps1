$ErrorActionPreference = "Stop"

py -3.13 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -e ".\services\catalog-worker[dev]"

Write-Host "Python 3.13 environment ready at .venv"
