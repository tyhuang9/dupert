#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.local.yml"
PROJECT_NAME="dupert-local-db"
VOLUME_NAME="dupert_local_postgres_data"

usage() {
  cat <<'EOF'
Usage: npm run db:<command> [-- --force]

Commands:
  up       Start PostgreSQL and wait until it is healthy.
  down     Stop PostgreSQL, preserving its data volume.
  status   Show the local PostgreSQL container status.
  logs     Follow local PostgreSQL logs.
  reset    Delete only Dupert's local PostgreSQL data volume, then start a fresh database.

Set DUPERT_POSTGRES_MAJOR (default: 16) or DUPERT_POSTGRES_PORT (default: 5432)
before running a command to override the local image major or host port.
EOF
}

fail() {
  echo "$1" >&2
  exit 1
}

require_docker_compose() {
  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker is required for the local database. Install and start Docker Desktop, then run npm run db:up."
  fi

  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 is required. Update Docker Desktop or install the Docker Compose plugin, then run npm run db:up."
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not running. Start Docker Desktop, wait for it to finish starting, then run npm run db:up."
  fi
}

compose() {
  docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

confirm_reset() {
  if [[ "${1:-}" == "--force" ]]; then
    return
  fi

  if [[ -n "${1:-}" ]]; then
    fail "Unknown reset option: $1. Use --force for non-interactive reset."
  fi

  if [[ ! -t 0 ]]; then
    fail "Refusing to reset without an interactive terminal. Re-run npm run db:reset -- --force only if you intend to delete Dupert's local database."
  fi

  echo "This permanently deletes the local Dupert PostgreSQL volume ($VOLUME_NAME)."
  read -r -p "Type RESET to continue: " confirmation
  [[ "$confirmation" == "RESET" ]] || fail "Reset cancelled."
}

reset() {
  local volume_project
  local volume_name

  compose down >/dev/null

  if ! docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
    echo "Local database volume is already absent."
    compose up --detach --wait
    return
  fi

  volume_project="$(docker volume inspect "$VOLUME_NAME" --format '{{ index .Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
  volume_name="$(docker volume inspect "$VOLUME_NAME" --format '{{ index .Labels "com.docker.compose.volume" }}' 2>/dev/null || true)"
  [[ "$volume_project" == "$PROJECT_NAME" && "$volume_name" == "postgres_data" ]] \
    || fail "Refusing to delete $VOLUME_NAME because it is not this project's Compose volume."

  docker volume rm "$VOLUME_NAME" >/dev/null
  echo "Deleted Dupert's local PostgreSQL data."
  compose up --detach --wait
}

command="${1:-help}"
shift || true

case "$command" in
  help|-h|--help)
    usage
    ;;
  reset)
    [[ $# -le 1 ]] || fail "Usage: npm run db:reset -- --force"
    confirm_reset "${1:-}"
    require_docker_compose
    reset
    ;;
  up)
    [[ $# -eq 0 ]] || fail "Usage: npm run db:up"
    require_docker_compose
    compose up --detach --wait
    ;;
  down)
    [[ $# -eq 0 ]] || fail "Usage: npm run db:down"
    require_docker_compose
    compose down
    ;;
  status)
    [[ $# -eq 0 ]] || fail "Usage: npm run db:status"
    require_docker_compose
    compose ps
    ;;
  logs)
    [[ $# -eq 0 ]] || fail "Usage: npm run db:logs"
    require_docker_compose
    compose logs --follow --tail=100
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
