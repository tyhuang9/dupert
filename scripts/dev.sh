#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy .env.example to .env and fill in the local development values first."
  exit 1
fi

backend_pid=""
frontend_pid=""

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

set -a
set +u
# shellcheck disable=SC1090
source "$ENV_FILE"
set -u
set +a

echo "Starting backend on http://localhost:8000"
(
  cd "$ROOT_DIR/backend"
  ./gradlew bootRun
) &
backend_pid=$!

echo "Starting frontend on http://localhost:3000"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host localhost --port 3000
) &
frontend_pid=$!

echo "TripPlanner dev is starting."
echo "Open http://localhost:3000"
echo "Press Ctrl+C to stop both processes."

set +e
wait -n "$backend_pid" "$frontend_pid"
status=$?
set -e

exit "$status"
