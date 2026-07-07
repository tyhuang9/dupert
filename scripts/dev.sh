#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV_FILE="$ROOT_DIR/backend/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/frontend/.env"

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "Missing $BACKEND_ENV_FILE"
  echo "Copy backend/.env.example to backend/.env and fill in the backend values first."
  exit 1
fi

if [[ ! -f "$FRONTEND_ENV_FILE" ]]; then
  echo "Missing $FRONTEND_ENV_FILE"
  echo "Copy frontend/.env.example to frontend/.env and fill in the frontend values first."
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

echo "Starting backend on http://localhost:8000"
(
  cd "$ROOT_DIR/backend"
  set -a
  set +u
  # shellcheck disable=SC1090
  source "$BACKEND_ENV_FILE"
  export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-local}"
  set -u
  set +a
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
