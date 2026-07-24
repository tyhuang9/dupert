#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
STATE_DIR="$ROOT_DIR/.dupert"
STATE_FILE="$STATE_DIR/ios-lifecycle.json"
APP_ID="io.github.tyhuang9.dupert"
GIT_COMMON_DIR="$(git -C "$ROOT_DIR" rev-parse --git-common-dir)"
[[ "$GIT_COMMON_DIR" == /* ]] || GIT_COMMON_DIR="$ROOT_DIR/$GIT_COMMON_DIR"
RESERVATIONS_DIR="$GIT_COMMON_DIR/dupert-ios-shortcuts"
PENDING_RESERVATION=""

fail() {
  echo "iOS shortcut: $*" >&2
  exit 1
}

require_start_dependencies() {
  [[ "$(uname -s)" == "Darwin" ]] || fail "macOS with Xcode Simulator is required."
  command -v xcode-select >/dev/null 2>&1 || fail "Xcode is not installed or xcode-select is unavailable."
  xcode-select -p >/dev/null 2>&1 || fail "Select Xcode first with: sudo xcode-select --switch /Applications/Xcode.app"
  command -v xcrun >/dev/null 2>&1 || fail "xcrun is unavailable; install Xcode and its command-line tools."
  xcrun --find simctl >/dev/null 2>&1 || fail "Xcode Simulator tools are unavailable."
  [[ -f "$FRONTEND_DIR/.env.native-development.local" ]] || fail "Missing frontend/.env.native-development.local; copy frontend/.env.native-development.example first."
  [[ -x "$FRONTEND_DIR/node_modules/.bin/cap" ]] || fail "Missing frontend dependencies; run npm install in frontend/."
}

devices_json() {
  xcrun simctl list devices available -j
}

device_rows() {
  devices_json | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk).on("end", () => {
      const devices = Object.values(JSON.parse(input).devices ?? {}).flat();
      for (const device of devices) {
        if (device.isAvailable !== false) console.log([device.udid, device.name, device.state].join("\t"));
      }
    });
  '
}

read_state() {
  [[ -f "$STATE_FILE" && ! -L "$STATE_DIR" && ! -L "$STATE_FILE" ]] || return 1
  node -e '
    const fs = require("fs");
    try {
      const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof state.repositoryRoot !== "string" || !state.repositoryRoot ||
          typeof state.simulatorUdid !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(state.simulatorUdid) ||
          typeof state.bootedByShortcut !== "boolean") process.exit(1);
      process.stdout.write([state.repositoryRoot, state.simulatorUdid, state.bootedByShortcut].join("\t"));
    } catch { process.exit(1); }
  ' "$STATE_FILE"
}

write_state() {
  local udid="$1" booted_by_shortcut="$2" temporary_state
  [[ ! -L "$STATE_DIR" && ! -L "$STATE_FILE" ]] || fail "Refusing to write iOS shortcut state through a symbolic link."
  umask 077
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  temporary_state="$(mktemp "$STATE_DIR/ios-lifecycle.XXXXXX")"
  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      repositoryRoot: process.argv[2], simulatorUdid: process.argv[3], bootedByShortcut: process.argv[4] === "true",
    }, null, 2) + "\n");
  ' "$temporary_state" "$ROOT_DIR" "$udid" "$booted_by_shortcut"
  mv "$temporary_state" "$STATE_FILE"
}

reservation_path() {
  printf '%s/%s--%s.lock\n' "$RESERVATIONS_DIR" "$1" "$APP_ID"
}

reservation_owner() {
  local reservation="$1" owner_file
  owner_file="$reservation/owner.json"
  [[ -d "$reservation" && ! -L "$reservation" && -f "$owner_file" && ! -L "$owner_file" ]] || return 1
  node -e '
    const fs = require("fs");
    try {
      const owner = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof owner.repositoryRoot !== "string" || !owner.repositoryRoot) process.exit(1);
      process.stdout.write(owner.repositoryRoot);
    } catch { process.exit(1); }
  ' "$owner_file"
}

reserve_device() {
  local udid="$1" reservation owner="" stored_state="" stored_root="" stored_udid="" stored_booted=""
  reservation="$(reservation_path "$udid")"
  [[ ! -L "$RESERVATIONS_DIR" ]] || fail "Refusing to use a symbolic-link reservation directory."
  umask 077
  mkdir -p "$RESERVATIONS_DIR"
  chmod 700 "$RESERVATIONS_DIR"

  if mkdir "$reservation" 2>/dev/null; then
    node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ repositoryRoot: process.argv[2] }) + "\n", { mode: 0o600 });' "$reservation/owner.json" "$ROOT_DIR"
    PENDING_RESERVATION="$reservation"
    return
  fi

  owner="$(reservation_owner "$reservation")" || fail "Simulator reservation is invalid; refusing to take ownership."
  if stored_state="$(read_state)"; then
    IFS=$'\t' read -r stored_root stored_udid stored_booted <<< "$stored_state"
  fi
  [[ "$owner" == "$ROOT_DIR" && "$stored_root" == "$ROOT_DIR" && "$stored_udid" == "$udid" ]] || fail "Simulator $udid is reserved by another worktree or start is already in progress."
}

release_reservation() {
  local udid="$1" reservation owner
  reservation="$(reservation_path "$udid")"
  owner="$(reservation_owner "$reservation")" || fail "Simulator reservation is missing or invalid; preserving local state."
  [[ "$owner" == "$ROOT_DIR" ]] || fail "Simulator reservation belongs to another worktree; preserving local state."
  rm -f "$reservation/owner.json"
  rmdir "$reservation"
}

cleanup_pending_reservation() {
  local owner=""
  if [[ -n "$PENDING_RESERVATION" ]] && owner="$(reservation_owner "$PENDING_RESERVATION")" && [[ "$owner" == "$ROOT_DIR" ]]; then
    rm -f "$PENDING_RESERVATION/owner.json"
    rmdir "$PENDING_RESERVATION" 2>/dev/null || true
  fi
}

trap 'status=$?; trap - EXIT; cleanup_pending_reservation; exit "$status"' EXIT

find_device() {
  local selector="$1" rows matches
  rows="$(device_rows)"
  matches="$(printf '%s\n' "$rows" | awk -F '\t' -v selector="$selector" '$1 == selector || $2 == selector')"
  [[ -n "$matches" ]] || fail "No available simulator matches DUPERT_IOS_SIMULATOR=$selector."
  [[ "$(printf '%s\n' "$matches" | wc -l | tr -d ' ')" == "1" ]] || fail "DUPERT_IOS_SIMULATOR=$selector is ambiguous; use its UDID."
  printf '%s\n' "$matches"
}

select_device() {
  local stored_state="" stored_root="" stored_udid="" stored_booted="" rows matches
  if stored_state="$(read_state)"; then
    IFS=$'\t' read -r stored_root stored_udid stored_booted <<< "$stored_state"
  fi

  if [[ -n "${DUPERT_IOS_SIMULATOR:-}" ]]; then
    find_device "$DUPERT_IOS_SIMULATOR"
    return
  fi

  if [[ "$stored_root" == "$ROOT_DIR" && -n "$stored_udid" ]]; then
    matches="$(device_rows | awk -F '\t' -v udid="$stored_udid" '$1 == udid && $3 == "Booted"')"
    if [[ -n "$matches" ]]; then
      printf '%s\n' "$matches"
      return
    fi
  fi

  rows="$(device_rows)"
  matches="$(printf '%s\n' "$rows" | awk -F '\t' '$2 ~ /^iPhone/ && $3 == "Booted"')"
  [[ -n "$matches" ]] || fail "Set DUPERT_IOS_SIMULATOR to an available simulator UDID or name, or boot one iPhone Simulator first."
  [[ "$(printf '%s\n' "$matches" | wc -l | tr -d ' ')" == "1" ]] || fail "Multiple iPhone Simulators are booted; set DUPERT_IOS_SIMULATOR to a UDID or name."
  printf '%s\n' "$matches"
}

start() {
  require_start_dependencies

  local row udid name state booted_by_shortcut="false"
  row="$(select_device)"
  IFS=$'\t' read -r udid name state <<< "$row"
  reserve_device "$udid"

  if [[ "$state" != "Booted" ]]; then
    echo "Booting $name ($udid)"
    xcrun simctl boot "$udid"
    xcrun simctl bootstatus "$udid" -b
    booted_by_shortcut="true"
  fi

  # Preserve ownership across repeated starts, even if a caller now provides the UDID explicitly.
  local stored_state="" stored_root="" stored_udid="" stored_booted=""
  if stored_state="$(read_state)"; then
    IFS=$'\t' read -r stored_root stored_udid stored_booted <<< "$stored_state"
    if [[ "$stored_root" == "$ROOT_DIR" && "$stored_udid" == "$udid" && "$stored_booted" == "true" ]]; then
      booted_by_shortcut="true"
    fi
  fi
  (
    cd "$FRONTEND_DIR"
    npm run sync:native:development
    npx cap run ios --target "$udid" --no-sync
  )
  write_state "$udid" "$booted_by_shortcut"
  PENDING_RESERVATION=""
}

stop() {
  [[ -f "$STATE_FILE" ]] || { echo "No iOS shortcut state for this worktree."; return 0; }

  local recorded_state recorded_root udid booted_by_shortcut state terminate_output reservation owner
  recorded_state="$(read_state)" || fail "Invalid iOS shortcut state; preserving it without changing any simulator."
  IFS=$'\t' read -r recorded_root udid booted_by_shortcut <<< "$recorded_state"
  [[ "$recorded_root" == "$ROOT_DIR" ]] || fail "iOS shortcut state belongs to another worktree; preserving it without changing any simulator."
  reservation="$(reservation_path "$udid")"
  owner="$(reservation_owner "$reservation")" || fail "Simulator reservation is missing or invalid; preserving local state."
  [[ "$owner" == "$ROOT_DIR" ]] || fail "Simulator reservation belongs to another worktree; preserving local state."

  state="$(device_rows | awk -F '\t' -v udid="$udid" '$1 == udid { print $3 }')"
  if [[ "$state" == "Booted" ]]; then
    if ! terminate_output="$(xcrun simctl terminate "$udid" "$APP_ID" 2>&1)"; then
      if [[ "$terminate_output" != *"domain=NSPOSIXErrorDomain, code=3"* || "$terminate_output" != *"No such process"* ]]; then
        [[ -z "$terminate_output" ]] || echo "$terminate_output" >&2
        fail "Could not terminate Dupert; preserving state and leaving the simulator running."
      fi
    fi
  fi
  release_reservation "$udid"
  rm -f "$STATE_FILE"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) fail "usage: $0 {start|stop}" ;;
esac
