#!/usr/bin/env bash
set -e
export PATH="/Users/alidiaby/.local/bin:$PATH"
cd "$(dirname "$0")"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
