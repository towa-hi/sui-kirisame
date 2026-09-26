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

# Seed both stations with two Alice-supplied umbrellas each.
python3 - <<'PY'
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import tomllib


def cli(*args, json_output=True):
    command = ["sui", "client", *args]
    if json_output:
        command.append("--json")
    result = subprocess.run(command, text=True, capture_output=True, check=True)
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    return json.loads(result.stdout) if json_output else result.stdout.strip()


def owned_caps(objects, package):
    """Support both current CLI BCS objects and older parsed object responses."""
    found = []
    for obj in objects:
        data = obj.get("data", {})
        move = data.get("Move", {})
        tag = move.get("type_", {})
        tag = tag.get("Other", {}) if isinstance(tag, dict) else {}
        if (tag.get("address", "").removeprefix("0x") == package.removeprefix("0x")
                and tag.get("module") == "umbrella" and tag.get("name") == "AdminCap"):
            found.append("0x" + bytes(move["contents"][:32]).hex())
        elif data.get("type") == f"{package}::umbrella::AdminCap":
            found.append(data["objectId"])
    return found


def created(tx, type_name):
    ids = [obj["objectId"] for obj in tx.get("objectChanges", [])
           if obj.get("type") == "created" and obj.get("objectType") == type_name]
    if len(ids) != 1:
        raise RuntimeError(f"Expected one created {type_name}; found {ids}. See transaction logs.")
    return ids[0]


def main():
    # Pin every subsequent CLI invocation to the environment selected at startup.
    env = cli("active-env", json_output=False)
    published = tomllib.loads(Path("Published.toml").read_text())
    deployment = published["published"][env]
    package = deployment["published-at"]
    original = deployment["original-id"]
    chain = cli("--client.env", env, "chain-identifier", "--format", "hex", json_output=False)
    if chain != deployment["chain-id"]:
        raise RuntimeError("Active network does not match Published.toml chain ID")

    addresses = cli("addresses")["addresses"]

    def resolve(alias):
        matches = [address for name, address in addresses if alias in (name, address)]
        if len(matches) != 1:
            raise RuntimeError(f"No unique local signing account for {alias!r}")
        return matches[0]

    admin, station, supplier = map(resolve, ("mono", "station", "alice-supplier"))
    if len({admin, station, supplier}) != 3:
        raise RuntimeError("Admin, station, and supplier must be distinct accounts")
    caps = owned_caps(cli("--client.env", env, "objects", admin), original)
    if len(caps) != 1:
        raise RuntimeError(f"Expected one AdminCap for this deployment; found {caps}")

    # Each transaction uses a 0.1 SUI gas budget; the supplier also splits a 0.03 SUI bond.
    for address, required in ((admin, 200_000_000), (station, 200_000_000), (supplier, 520_000_000)):
        coins = cli("--client.env", env, "gas", address)
        coins = coins.get("gasCoins", []) if isinstance(coins, dict) else coins
        if max((int(c["mistBalance"]) for c in coins), default=0) < required:
            raise RuntimeError(f"{address} needs one gas coin with at least {required} MIST")

    logs = Path(tempfile.mkdtemp(prefix="kirisame-init-"))
    print(f"Network: {env}\nPackage: {package}\nTransaction logs: {logs}", flush=True)

    def transact(label, sender, commands):
        command = ["sui", "client", "--client.env", env, "ptb", "--sender", f"@{sender}",
                   *commands, "--gas-budget", "100000000", "--json"]
        print(f"{label} (execute)", flush=True)
        result = subprocess.run(command, capture_output=True, text=True)
        (logs / f"{label}.log").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(f"{label} failed: {result.stdout}\n{result.stderr}")
        tx = json.loads(result.stdout)
        if tx.get("effects", {}).get("status", {}).get("status") != "success":
            raise RuntimeError(f"{label} did not succeed; inspect {logs}")
        print(f"  Digest: {tx['digest']}", flush=True)
        return tx

    def call(name, *values):
        return ["--move-call", f"{package}::umbrella::{name}", *values]

    # Demo coordinates for both stations use the existing approximate Toranomon location.
    # Encoded like the dapp: (degrees + offset) * 1e6.
    stations = []
    for slug, name in (("toranomon", "Toranomon Station"), ("ethglobal", "EthGlobal Station")):
        station_commands = call("admin_create_station", f"@{caps[0]}", json.dumps(name),
                                '"Toranomon, Minato, Tokyo"', "125670200", "319749800", f"@{station}")
        tx = transact(f"{slug}-station", admin, station_commands)
        station_id = created(tx, f"{original}::umbrella::Station")
        station_cap = created(tx, f"{original}::umbrella::StationCap")
        umbrellas = {}
        for color_name, color in (("Black", 1), ("Vinyl", 0)):
            umbrella_name = f"Alice {name} {color_name}"
            commands = ["--split-coins", "gas", "[30000000]", "--assign", "bond",
                        *call("user_create_umbrella", "bond.0", str(color), json.dumps(umbrella_name))]
            tx = transact(f"{slug}-{color_name.lower()}", supplier, commands)
            umbrellas[color_name.lower()] = created(tx, f"{original}::umbrella::Umbrella")
        commands = []
        for umbrella in umbrellas.values():
            commands += call("station_dock_umbrella", f"@{station_cap}", f"@{station_id}",
                             f"@{umbrella}", "0", "@0x6")
        transact(f"{slug}-dock-both", station, commands)
        stations.append({"name": name, "station": station_id, "station_cap": station_cap,
                         "umbrellas": umbrellas})
    summary = {"network": env, "package": package, "station_account": station,
               "supplier": supplier, "stations": stations}
    (logs / "result.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("Both stations created; two Alice-supplied umbrellas docked at each.\n" + json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Error: {error}", file=sys.stderr)
        print("Earlier transactions may have succeeded. Inspect the printed logs before rerunning.", file=sys.stderr)
        sys.exit(1)
PY
