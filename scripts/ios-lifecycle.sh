#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
STATE_DIR="$ROOT_DIR/.dupert"
STATE_FILE="$STATE_DIR/ios-lifecycle.json"
APP_ID="io.github.tyhuang9.dupert"

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

state_value() {
  local key="$1"
  [[ -f "$STATE_FILE" ]] || return 0
  node -e 'const fs=require("fs"); const state=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(state[process.argv[2]] ?? ""));' "$STATE_FILE" "$key"
}

write_state() {
  local udid="$1" booted_by_shortcut="$2"
  mkdir -p "$STATE_DIR"
  node -e '
    const fs = require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      repositoryRoot: process.argv[2], simulatorUdid: process.argv[3], bootedByShortcut: process.argv[4] === "true",
    }, null, 2) + "\n");
  ' "$STATE_FILE" "$ROOT_DIR" "$udid" "$booted_by_shortcut"
}

find_device() {
  local selector="$1" rows matches
  rows="$(device_rows)"
  matches="$(printf '%s\n' "$rows" | awk -F '\t' -v selector="$selector" '$1 == selector || $2 == selector')"
  [[ -n "$matches" ]] || fail "No available simulator matches DUPERT_IOS_SIMULATOR=$selector."
  [[ "$(printf '%s\n' "$matches" | wc -l | tr -d ' ')" == "1" ]] || fail "DUPERT_IOS_SIMULATOR=$selector is ambiguous; use its UDID."
  printf '%s\n' "$matches"
}

select_device() {
  local stored_udid stored_root rows matches
  stored_udid="$(state_value simulatorUdid)"
  stored_root="$(state_value repositoryRoot)"

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

  if [[ "$state" != "Booted" ]]; then
    echo "Booting $name ($udid)"
    xcrun simctl boot "$udid"
    xcrun simctl bootstatus "$udid" -b
    booted_by_shortcut="true"
  fi

  # Preserve ownership across repeated starts, even if a caller now provides the UDID explicitly.
  if [[ "$(state_value repositoryRoot)" == "$ROOT_DIR" && "$(state_value simulatorUdid)" == "$udid" && "$(state_value bootedByShortcut)" == "true" ]]; then
    booted_by_shortcut="true"
  fi
  write_state "$udid" "$booted_by_shortcut"

  (
    cd "$FRONTEND_DIR"
    npm run sync:native:development
    npx cap run ios --target "$udid" --no-sync
  )
}

stop() {
  [[ -f "$STATE_FILE" ]] || { echo "No iOS shortcut state for this worktree."; return 0; }

  local recorded_root udid booted_by_shortcut state
  recorded_root="$(state_value repositoryRoot)"
  udid="$(state_value simulatorUdid)"
  booted_by_shortcut="$(state_value bootedByShortcut)"
  [[ "$recorded_root" == "$ROOT_DIR" && -n "$udid" ]] || fail "Ignoring iOS shortcut state that does not belong to this worktree."

  state="$(device_rows | awk -F '\t' -v udid="$udid" '$1 == udid { print $3 }')"
  if [[ "$state" == "Booted" ]]; then
    xcrun simctl terminate "$udid" "$APP_ID" || true
    if [[ "$booted_by_shortcut" == "true" ]]; then
      xcrun simctl shutdown "$udid"
    fi
  fi
  rm -f "$STATE_FILE"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) fail "usage: $0 {start|stop}" ;;
esac
