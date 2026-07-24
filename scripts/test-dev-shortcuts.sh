#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/dupert-dev-shortcuts-test.XXXXXX")"
TEST_TEMP="$(cd "$TEST_TEMP" && pwd -P)"
TEST_ROOT="$TEST_TEMP/repo"
FAKE_BIN="$TEST_TEMP/bin"
BACKEND_SCRIPT="$TEST_ROOT/scripts/backend.sh"
STATE_FILE="$TEST_ROOT/.dupert/runtime/backend.state"
FAKE_LOG="$TEST_TEMP/commands.log"
FAKE_STOPPED="$TEST_TEMP/stopped"
trap 'rm -rf "$TEST_TEMP"' EXIT

mkdir -p "$TEST_ROOT/scripts" "$TEST_ROOT/backend" "$FAKE_BIN"
cp "$PACKAGE_ROOT/scripts/backend.sh" "$BACKEND_SCRIPT"
: >"$TEST_ROOT/backend/.env"
: >"$TEST_ROOT/backend/gradlew"
chmod +x "$TEST_ROOT/backend/gradlew"

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
if [[ "$1" == "-TERM" && "${FAKE_TERM_STOPS:-true}" == "true" ]]; then
  touch "${FAKE_STOPPED:?}"
elif [[ "$1" == "-KILL" ]]; then
  touch "${FAKE_STOPPED:?}"
  [[ "${FAKE_KILL_RACE:-false}" == "true" ]] && exit 1
fi
EOF
cat >"$FAKE_BIN/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$FAKE_BIN/ps" "$FAKE_BIN/perl" "$FAKE_BIN/kill" "$FAKE_BIN/sleep"

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
  PATH="$FAKE_BIN:$PATH" FAKE_LOG="$FAKE_LOG" FAKE_STOPPED="$FAKE_STOPPED" FAKE_STATE="$STATE_FILE" FAKE_STALE_FLAG="$TEST_TEMP/stale" \
    FAKE_TERM_STOPS="${FAKE_TERM_STOPS_OVERRIDE:-true}" FAKE_KILL_RACE="${FAKE_KILL_RACE_OVERRIDE:-false}" \
    FAKE_COMMAND="${FAKE_COMMAND_OVERRIDE:-$TEST_ROOT/backend/gradlew bootRun}" /bin/bash "$BACKEND_SCRIPT" "$@"
}

bash -n "$BACKEND_SCRIPT"
(cd "$PACKAGE_ROOT" && node - <<'EOF'
const scripts = require('./package.json').scripts
const expected = {
  startdb: 'bash scripts/db.sh up',
  stopdb: 'bash scripts/db.sh down',
  startback: 'bash scripts/backend.sh start',
  stopback: 'bash scripts/backend.sh stop',
}
for (const [name, command] of Object.entries(expected)) {
  if (scripts[name] !== command) throw new Error(`${name} must map to ${command}`)
}
EOF
)

: >"$FAKE_LOG"
backend start >/dev/null
[[ -f "$STATE_FILE" ]] || { echo "Start did not create state." >&2; exit 1; }
wait_for_perl
assert_contains "$FAKE_LOG" 'perl -MPOSIX=setsid -e POSIX::setsid() or die "setsid: $!"; exec @ARGV /bin/bash'
assert_contains "$FAKE_LOG" "$BACKEND_SCRIPT run"
backend start >"$TEST_TEMP/duplicate.out"
assert_contains "$TEST_TEMP/duplicate.out" 'Backend is already running'
[[ "$(grep -c '^perl ' "$FAKE_LOG")" -eq 1 ]] || { echo "Duplicate start launched another backend." >&2; exit 1; }

rm -f "$FAKE_STOPPED" "$TEST_TEMP/stale"; : >"$FAKE_LOG"
printf 'root_dir=%s\npid=123\npgid=9001\n' "$TEST_ROOT" >"$STATE_FILE"
FAKE_STALE_ONCE=true backend start >/dev/null
wait_for_perl
[[ "$(grep -c '^perl ' "$FAKE_LOG")" -eq 1 ]] || { echo "Stale state did not launch a replacement backend." >&2; exit 1; }

printf 'root_dir=%s\npid=123\npgid=9001\n' "$TEST_ROOT" >"$STATE_FILE"
FAKE_COMMAND_OVERRIDE='/tmp/not-dupert/gradlew bootRun' capture_failure backend stop
[[ "$LAST_OUTPUT" == *"does not identify this worktree's backend process group"* ]] || { echo "$LAST_OUTPUT" >&2; exit 1; }
[[ -f "$STATE_FILE" ]] || { echo "Unowned state was unexpectedly removed." >&2; exit 1; }

rm -f "$STATE_FILE" "$FAKE_STOPPED"; : >"$FAKE_LOG"
backend start >/dev/null
backend stop >"$TEST_TEMP/stop.out"
assert_contains "$TEST_TEMP/stop.out" 'Backend stopped.'
assert_contains "$FAKE_LOG" 'kill -TERM -- -9001'
[[ ! -f "$STATE_FILE" ]] || { echo "Stop did not remove state." >&2; exit 1; }

rm -f "$STATE_FILE" "$FAKE_STOPPED"; : >"$FAKE_LOG"
backend start >/dev/null
FAKE_TERM_STOPS_OVERRIDE=false FAKE_KILL_RACE_OVERRIDE=true backend stop >"$TEST_TEMP/kill-race.out"
assert_contains "$FAKE_LOG" 'kill -KILL -- -9001'
assert_contains "$TEST_TEMP/kill-race.out" 'Backend stopped after KILL.'
[[ ! -f "$STATE_FILE" ]] || { echo "Confirmed KILL-race exit left stale state." >&2; exit 1; }

echo "Development shortcut contracts passed."
