#!/usr/bin/env bash
set -Eeuo pipefail

# Use the external command so lifecycle checks can be exercised with a fake process table.
enable -n kill 2>/dev/null || true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"
RUNTIME_DIR="$ROOT_DIR/.dupert/runtime"
STATE_FILE="$RUNTIME_DIR/backend.state"
LOG_FILE="$RUNTIME_DIR/backend.log"

fail() {
  echo "$1" >&2
  exit 1
}

read_state() {
  local line
  [[ -f "$STATE_FILE" ]] || return 1
  root_dir=""
  pid=""
  pgid=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      root_dir=*) root_dir="${line#root_dir=}" ;;
      pid=*) pid="${line#pid=}" ;;
      pgid=*) pgid="${line#pgid=}" ;;
      *) return 1 ;;
    esac
  done <"$STATE_FILE"
  [[ "$root_dir" == "$ROOT_DIR" && "$pid" =~ ^[1-9][0-9]*$ && "$pgid" =~ ^[1-9][0-9]*$ ]]
}

owned_process_group() {
  local actual_pgid command
  actual_pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')" || return 1
  [[ "$actual_pgid" == "$pgid" ]] || return 1
  command="$(ps -o command= -p "$pid" 2>/dev/null)" || return 1
  [[ "$command" == *"$BACKEND_DIR/gradlew bootRun"* || "$command" == *"$ROOT_DIR/scripts/backend.sh run"* ]] || return 1
  ps -o pid= -g "$pgid" 2>/dev/null | grep -Eq "^[[:space:]]*$pid[[:space:]]*$"
}

process_exists() {
  ps -o pid= -p "$1" 2>/dev/null | grep -Eq "^[[:space:]]*$1[[:space:]]*$"
}

group_has_processes() {
  ps -o pid= -g "$pgid" 2>/dev/null | grep -q '[0-9]'
}

finish_stop() {
  rm -f "$STATE_FILE"
  echo "$1"
}

clear_stale_state() {
  if ! read_state; then
    rm -f "$STATE_FILE"
    return
  fi

  if ! process_exists "$pid"; then
    rm -f "$STATE_FILE"
    return
  fi

  owned_process_group || fail "Refusing to use $STATE_FILE: it does not identify this worktree's backend process group."
}

start() {
  [[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE. Copy backend/.env.example to backend/.env and fill in the backend values first."
  [[ -x "$BACKEND_DIR/gradlew" ]] || fail "Missing executable $BACKEND_DIR/gradlew."
  command -v perl >/dev/null 2>&1 || fail "Perl is required to create an isolated backend process group."
  mkdir -p "$RUNTIME_DIR"

  if [[ -f "$STATE_FILE" ]]; then
    clear_stale_state
    if [[ -f "$STATE_FILE" ]]; then
      echo "Backend is already running (PID $pid; log: $LOG_FILE)."
      return
    fi
  fi

  perl -MPOSIX=setsid -e 'POSIX::setsid() or die "setsid: $!"; exec @ARGV' \
    /bin/bash "$0" run >>"$LOG_FILE" 2>&1 &
  pid=$!
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ "$pgid" =~ ^[1-9][0-9]*$ ]] || fail "Could not determine the backend process group; see $LOG_FILE."
  printf 'root_dir=%s\npid=%s\npgid=%s\n' "$ROOT_DIR" "$pid" "$pgid" >"$STATE_FILE"
  echo "Backend started (PID $pid; log: $LOG_FILE)."
}

stop() {
  [[ -f "$STATE_FILE" ]] || {
    echo "Backend is not running."
    return
  }
  read_state || fail "Refusing to stop: $STATE_FILE is invalid."
  if ! process_exists "$pid"; then
    rm -f "$STATE_FILE"
    echo "Removed stale backend state."
    return
  fi
  owned_process_group || fail "Refusing to stop: $STATE_FILE does not identify this worktree's backend process group."

  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in {1..30}; do
    group_has_processes || { finish_stop "Backend stopped."; return; }
    sleep 0.1
  done

  if ! owned_process_group; then
    group_has_processes || { finish_stop "Backend stopped."; return; }
    fail "Refusing to send KILL: the recorded backend process group is no longer owned by this worktree. State was preserved."
  fi
  kill -KILL -- "-$pgid" 2>/dev/null || true
  for _ in {1..10}; do
    group_has_processes || { finish_stop "Backend stopped after KILL."; return; }
    sleep 0.1
  done
  fail "Could not confirm that the backend process group stopped after KILL. State was preserved."
}

run() {
  cd "$BACKEND_DIR"
  set -a
  set +u
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-local}"
  set -u
  set +a
  exec "$BACKEND_DIR/gradlew" bootRun
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  run) run ;;
  *) echo "Usage: $0 {start|stop}" >&2; exit 1 ;;
esac
