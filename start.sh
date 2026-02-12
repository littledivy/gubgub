#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$ROOT/data/recordings" "$ROOT/data/chrome-profiles" "$ROOT/data/models"

export RECORDINGS_DIR="$ROOT/data/recordings"
export PROFILES_DIR="$ROOT/data/chrome-profiles"

echo "building worker..."
cd "$ROOT"
go build -o worker .

echo "starting worker on :8089..."
./worker &
WORKER_PID=$!

echo "starting web app..."
cd "$ROOT/www"
DEV_LANDING=1 WORKER_URL="http://localhost:8089" deno task start &
WWW_PID=$!

trap "kill $WORKER_PID $WWW_PID 2>/dev/null" EXIT INT TERM

wait
