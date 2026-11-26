#!/usr/bin/env bash
# Run from the plugin root. Uses only disposable daemon, Pi, and workspace data.
set -euo pipefail
if [[ $# -gt 1 || ( $# -eq 1 && $1 != --try ) ]]; then
  printf 'Usage: bash test/paseo-smoke.sh [--try]\n' >&2
  exit 2
fi
root=$PWD
port=${PASEO_OM_TEST_PORT:-16767}
base=$(mktemp -d /tmp/paseo-om-host-XXXXXX)
cleanup() {
  paseo daemon stop --home "$base/paseo" >/dev/null 2>&1 || true
  rm -rf -- "$base"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$base/paseo" "$base/pi" "$base/work"
if [[ -n ${PASEO_OM_TEST_PI:-} ]]; then
  printf '#!/bin/sh\nexec "%s" --no-extensions -e "%s/pi/index.ts" "$@"\n' \
    "$PASEO_OM_TEST_PI" "$root" > "$base/pi-test"
else
  printf '#!/bin/sh\nexec "%s" "%s/node_modules/.bin/pi" --no-extensions -e "%s/pi/index.ts" "$@"\n' \
    "$(command -v node)" "$root" "$root" > "$base/pi-test"
fi
chmod +x "$base/pi-test"
printf '{"version":1,"pluginsEnabled":true,"features":{"webUi":{"enabled":true}},"daemon":{"listen":"127.0.0.1:%s","relay":{"enabled":false}}}\n' \
  "$port" > "$base/paseo/config.json"
HOME="$base" PI_OFFLINE=1 OPENAI_API_KEY=not-a-real-key PI_COMMAND="$base/pi-test" PI_CODING_AGENT_DIR="$base/pi" \
  paseo daemon start --home "$base/paseo" --timeout 15
paseo plugin install "$root" --home "$base/paseo"
PASEO_OM_TEST_DIR="$base" PASEO_OM_TEST_PORT="$port" node test/paseo-smoke.mjs "$@"
if [[ ${1:-} == --try ]]; then
  printf 'Press Enter or Ctrl+C here when done to remove the sandbox.\n'
  read -r || true
fi
