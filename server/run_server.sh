#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"
echo "🚀 Starting Somphea Reak Studio API Backend on port 5000..."
python3 server.py
