#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV_FILE="$ROOT_DIR/backend/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/frontend/.env"

IMAGE_NAME="${BACKEND_DOCKER_IMAGE:-dupert-backend:local}"
CONTAINER_NAME="${BACKEND_DOCKER_CONTAINER:-dupert-backend-dev}"
BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-8000}"
BACKEND_CONTAINER_PORT="${BACKEND_CONTAINER_PORT:-10000}"
BACKEND_PROFILE="${BACKEND_PROFILE:-local}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not on PATH."
  exit 1
fi

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

frontend_pid=""
backend_log_pid=""
backend_container_started="false"

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  if [[ -n "$backend_log_pid" ]] && kill -0 "$backend_log_pid" 2>/dev/null; then
    kill "$backend_log_pid" 2>/dev/null || true
  fi

  if [[ "$backend_container_started" == "true" ]]; then
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  wait "$frontend_pid" "$backend_log_pid" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

echo "Building backend Docker image $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/backend/Dockerfile" "$ROOT_DIR/backend"

echo "Starting backend container on http://localhost:$BACKEND_HOST_PORT"
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  --env-file "$BACKEND_ENV_FILE" \
  -e SPRING_PROFILES_ACTIVE="$BACKEND_PROFILE" \
  -e PORT="$BACKEND_CONTAINER_PORT" \
  -p "$BACKEND_HOST_PORT:$BACKEND_CONTAINER_PORT" \
  "$IMAGE_NAME" >/dev/null
backend_container_started="true"

docker logs -f "$CONTAINER_NAME" &
backend_log_pid=$!

echo "Starting frontend on http://localhost:3000"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host localhost --port 3000
) &
frontend_pid=$!

echo "Dupert Docker dev is starting."
echo "Backend health: http://localhost:$BACKEND_HOST_PORT/actuator/health"
echo "Open http://localhost:3000"
echo "Press Ctrl+C to stop the frontend and backend container."

set +e
wait -n "$frontend_pid" "$backend_log_pid"
status=$?
set -e

exit "$status"
