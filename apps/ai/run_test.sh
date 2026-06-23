#!/usr/bin/env bash
set -e
export PATH="/Users/alidiaby/.local/bin:$PATH"
cd "$(dirname "$0")"
uv run pytest
