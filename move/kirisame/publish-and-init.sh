#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

previous_address="$(sui client active-address | tr -d '[:space:]')"

restore_address() {
  sui client switch --address "$previous_address"
}
trap restore_address EXIT

# Module init runs inside publish and sends AdminCap to the sender.
sui client switch --address mono

: > Published.toml

sui client publish --gas-budget 100000000 "$@"
