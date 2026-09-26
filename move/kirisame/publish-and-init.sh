#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Check the config writer's dependency before submitting a transaction.
python3 -c 'import tomllib'

previous_address="$(sui client active-address | tr -d '[:space:]')"

restore_address() {
  sui client switch --address "$previous_address"
}
trap restore_address EXIT

# Module init runs inside publish and sends AdminCap to the sender.
sui client switch --address mono

: > Published.toml

sui client publish --gas-budget 100000000 "$@"

# Published.toml was cleared above, so it must contain exactly this publication.
python3 - <<'PY'
from pathlib import Path
import re
import tomllib
from urllib.parse import quote

published = tomllib.loads(Path("Published.toml").read_text()).get("published", {})
if len(published) != 1:
    raise SystemExit("Expected one published package; frontend config was not updated.")
environment, deployment = next(iter(published.items()))
package = deployment.get("published-at", "")
original = deployment.get("original-id", "")
if not all(re.fullmatch(r"0x[0-9a-fA-F]{64}", value) for value in (package, original)):
    raise SystemExit("Invalid published package IDs; frontend config was not updated.")

config = Path("../../dapp/src/deployment.ts")
readme = Path("../../README.md")
readme_text = readme.read_text()
deployment_section = re.compile(r"<!-- deployment:start -->.*?<!-- deployment:end -->", re.DOTALL)
if len(deployment_section.findall(readme_text)) != 1:
    raise SystemExit("Expected one README deployment section; deployment files were not updated.")
explorer = f"https://suiscan.xyz/{quote(environment, safe='')}/object/{package}"
readme_text = deployment_section.sub(lambda _: (
    "<!-- deployment:start -->\n"
    f"Current deployment ({quote(environment, safe='')}): [View contract on Sui Explorer]({explorer}).\n"
    "<!-- deployment:end -->"
), readme_text)
original_default = "packageId" if original == package else f"(process.env.KIRISAME_PACKAGE_ID ? packageId : '{original}')"
config.write_text(
    f"export const packageId = process.env.KIRISAME_PACKAGE_ID || '{package}';\n"
    f"export const originalId = process.env.KIRISAME_ORIGINAL_PACKAGE_ID || {original_default};\n"
)
readme.write_text(readme_text)
print(f"Updated {config} to package {package}")
print(f"Updated {readme} deployment link")
PY
