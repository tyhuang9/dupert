#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_SCRIPT="$ROOT_DIR/scripts/backend.sh"
RUNTIME_DIR="$ROOT_DIR/.dupert/runtime"
STATE_FILE="$RUNTIME_DIR/backend.state"
FAKE_BIN="$(mktemp -d "${TMPDIR:-/tmp}/dupert-dev-shortcuts-test.XXXXXX")"
FAKE_LOG="$FAKE_BIN/commands.log"
FAKE_STOPPED="$FAKE_BIN/stopped"
TEST_ENV_CREATED=false
if [[ ! -f "$ROOT_DIR/backend/.env" ]]; then
  : >"$ROOT_DIR/backend/.env"
  TEST_ENV_CREATED=true
fi
trap 'rm -rf "$FAKE_BIN" "$ROOT_DIR/.dupert"; $TEST_ENV_CREATED && rm -f "$ROOT_DIR/backend/.env"' EXIT
mkdir -p "$RUNTIME_DIR"

cat >"$FAKE_BIN/ps" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${FAKE_STALE_ONCE:-}" && ! -f "${FAKE_STALE_FLAG:?}" ]]; then
  touch "$FAKE_STALE_FLAG"
  exit 0
fi
if [[ "$*" == *"-p"* ]]; then
  if [[ "$*" == *"pgid="* ]]; then echo 9001
  elif [[ "$*" == *"pid="* ]]; then awk -F= '/^pid=/{print $2}' "${FAKE_STATE:?}"
  else echo "${FAKE_COMMAND:?}"; fi
elif [[ ! -f "${FAKE_STOPPED:?}" ]]; then
  awk -F= '/^pid=/{print $2}' "${FAKE_STATE:?}"
fi
EOF
cat >"$FAKE_BIN/perl" <<'EOF'
#!/usr/bin/env bash
printf 'perl %s\n' "$*" >>"${FAKE_LOG:?}"
exit 0
EOF
cat >"$FAKE_BIN/kill" <<'EOF'
#!/usr/bin/env bash
printf 'kill %s\n' "$*" >>"${FAKE_LOG:?}"
[[ "$1" == "-0" ]] && exit 0
[[ "$1" == "-TERM" ]] && touch "${FAKE_STOPPED:?}"
EOF
chmod +x "$FAKE_BIN/ps" "$FAKE_BIN/perl" "$FAKE_BIN/kill"

assert_contains() { grep -Fq "$2" "$1" || { echo "Expected $1 to contain: $2" >&2; exit 1; }; }
wait_for_perl() {
  for _ in {1..20}; do
    grep -q '^perl ' "$FAKE_LOG" && return
    sleep 0.01
  done
  echo "Backend launcher did not run." >&2
  exit 1
}
capture_failure() {
  set +e; LAST_OUTPUT="$("$@" 2>&1)"; LAST_STATUS=$?; set -e
  [[ $LAST_STATUS -ne 0 ]] || { echo "Expected command to fail: $*" >&2; exit 1; }
}
backend() {
  PATH="$FAKE_BIN:$PATH" FAKE_LOG="$FAKE_LOG" FAKE_STOPPED="$FAKE_STOPPED" FAKE_STATE="$STATE_FILE" FAKE_STALE_FLAG="$FAKE_BIN/stale" \
    FAKE_COMMAND="${FAKE_COMMAND_OVERRIDE:-$ROOT_DIR/backend/gradlew bootRun}" /bin/bash "$BACKEND_SCRIPT" "$@"
}

bash -n "$BACKEND_SCRIPT"
node -e 'const p=require("./package.json").scripts; if (p.startdb !== "bash scripts/db.sh up" || p.stopdb !== "bash scripts/db.sh down") process.exit(1)'

rm -f "$STATE_FILE" "$FAKE_STOPPED"; : >"$FAKE_LOG"
backend start >/dev/null
[[ -f "$STATE_FILE" ]] || { echo "Start did not create state." >&2; exit 1; }
wait_for_perl
backend start >"$FAKE_BIN/duplicate.out"
assert_contains "$FAKE_BIN/duplicate.out" 'Backend is already running'
[[ "$(grep -c '^perl ' "$FAKE_LOG")" -eq 1 ]] || { echo "Duplicate start launched another backend." >&2; exit 1; }

rm -f "$FAKE_STOPPED" "$FAKE_BIN/stale"; : >"$FAKE_LOG"
printf 'root_dir=%s\npid=123\npgid=9001\n' "$ROOT_DIR" >"$STATE_FILE"
FAKE_STALE_ONCE=true backend start >/dev/null
wait_for_perl
[[ "$(grep -c '^perl ' "$FAKE_LOG")" -eq 1 ]] || { echo "Stale state did not launch a replacement backend." >&2; exit 1; }

printf 'root_dir=%q\npid=123\npgid=9001\n' "$ROOT_DIR" >"$STATE_FILE"
FAKE_COMMAND_OVERRIDE='/tmp/not-dupert/gradlew bootRun' capture_failure backend stop
[[ "$LAST_OUTPUT" == *"does not identify this worktree's backend process group"* ]] || { echo "$LAST_OUTPUT" >&2; exit 1; }
[[ -f "$STATE_FILE" ]] || { echo "Unowned state was unexpectedly removed." >&2; exit 1; }

rm -f "$STATE_FILE" "$FAKE_STOPPED"; : >"$FAKE_LOG"
backend start >/dev/null
backend stop >"$FAKE_BIN/stop.out"
assert_contains "$FAKE_BIN/stop.out" 'Backend stopped.'
assert_contains "$FAKE_LOG" 'kill -TERM -- -9001'
[[ ! -f "$STATE_FILE" ]] || { echo "Stop did not remove state." >&2; exit 1; }

echo "Development shortcut contracts passed."
