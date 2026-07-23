#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_SCRIPT="$ROOT_DIR/scripts/db.sh"
COMPOSE_FILE="$ROOT_DIR/compose.local.yml"

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq "$expected" "$file" || {
    echo "Expected $file to contain: $expected" >&2
    exit 1
  }
}

bash -n "$DB_SCRIPT"
assert_contains "$COMPOSE_FILE" 'image: postgres:${DUPERT_POSTGRES_MAJOR:-16}-alpine'
assert_contains "$COMPOSE_FILE" '127.0.0.1:${DUPERT_POSTGRES_PORT:-5432}:5432'
assert_contains "$COMPOSE_FILE" 'name: dupert_local_postgres_data'
assert_contains "$COMPOSE_FILE" 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB'
assert_contains "$ROOT_DIR/backend/.env.example" 'DATABASE_URL=postgresql://dupert:dupert_local_dev_password@localhost:5432/dupert'

set +e
missing_docker_output="$(PATH= /bin/bash "$DB_SCRIPT" status 2>&1)"
missing_docker_status=$?
unsafe_reset_output="$(/bin/bash "$DB_SCRIPT" reset </dev/null 2>&1)"
unsafe_reset_status=$?
set -e

[[ $missing_docker_status -ne 0 ]] || {
  echo "Expected the missing-Docker contract to fail." >&2
  exit 1
}
[[ "$missing_docker_output" == *"Docker is required for the local database"* ]] || {
  echo "Missing-Docker guidance was not shown." >&2
  exit 1
}
[[ $unsafe_reset_status -ne 0 ]] || {
  echo "Expected non-interactive reset to be refused." >&2
  exit 1
}
[[ "$unsafe_reset_output" == *"Refusing to reset without an interactive terminal"* ]] || {
  echo "Unsafe reset guidance was not shown." >&2
  exit 1
}

echo "Local database configuration contracts passed."
