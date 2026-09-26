#!/usr/bin/env python3
"""Create a real Toranomon station and two Bob-supplied umbrellas using Sui CLI."""

import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin", default="mono", help="Admin key alias (default: mono)")
    parser.add_argument("--station", default="station", help="Station key alias")
    parser.add_argument("--bob", default="bob-borrower", help="Bob key alias")
    parser.add_argument("--check", action="store_true", help="Preflight and dry-run creation only; no transactions")
    args = parser.parse_args()

    # Pin every subsequent CLI invocation to the environment selected at startup.
    env = cli("active-env", json_output=False)
    published = tomllib.loads(Path(__file__).with_name("Published.toml").read_text())
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

    admin, station, bob = map(resolve, (args.admin, args.station, args.bob))
    if len({admin, station, bob}) != 3:
        raise RuntimeError("Admin, station, and Bob must be distinct accounts")
    caps = owned_caps(cli("--client.env", env, "objects", admin), original)
    if len(caps) != 1:
        raise RuntimeError(f"Expected one AdminCap for this deployment; found {caps}")

    # Each transaction uses a 0.1 SUI gas budget; Bob also splits a 0.03 SUI bond.
    for address, required in ((admin, 100_000_000), (station, 100_000_000), (bob, 260_000_000)):
        coins = cli("--client.env", env, "gas", address)
        coins = coins.get("gasCoins", []) if isinstance(coins, dict) else coins
        if max((int(c["mistBalance"]) for c in coins), default=0) < required:
            raise RuntimeError(f"{address} needs one gas coin with at least {required} MIST")

    logs = Path(tempfile.mkdtemp(prefix="kirisame-toranomon-"))
    print(f"Network: {env}\nPackage: {package}\nTransaction logs: {logs}", flush=True)

    def transact(label, sender, commands, dry_run=False):
        command = ["sui", "client", "--client.env", env, "ptb", "--sender", f"@{sender}",
                   *commands, "--gas-budget", "100000000", "--json"]
        if dry_run:
            command.append("--dry-run")
        print(f"{label} ({'dry run' if dry_run else 'execute'})", flush=True)
        result = subprocess.run(command, capture_output=True, text=True)
        (logs / f"{label}.log").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(f"{label} failed: {result.stdout}\n{result.stderr}")
        # Sui 1.80 prints human-readable dry runs even with --json.
        if dry_run:
            if "execution status: success" not in result.stdout:
                raise RuntimeError(f"Dry-run success was not confirmed; inspect {logs}")
            return None
        tx = json.loads(result.stdout)
        if tx.get("effects", {}).get("status", {}).get("status") != "success":
            raise RuntimeError(f"{label} did not succeed; inspect {logs}")
        print(f"  Digest: {tx['digest']}", flush=True)
        return tx

    def call(name, *values):
        return ["--move-call", f"{package}::umbrella::{name}", *values]

    # Approximate Toranomon location, encoded like the dapp: (degrees + offset) * 1e6.
    station_commands = call("admin_create_station", f"@{caps[0]}", '"Toranomon"',
                            '"Toranomon, Minato, Tokyo"', "125670200", "319749800", f"@{station}")

    def umbrella_commands(color):
        return ["--split-coins", "gas", "[30000000]", "--assign", "bond",
                *call("user_create_umbrella", "bond.0", str(color))]

    if args.check:
        transact("station", admin, station_commands, True)
        transact("black", bob, umbrella_commands(1), True)
        transact("vinyl", bob, umbrella_commands(0), True)
        print("Preflight passed. Creation dry runs passed; docking requires the created objects.")
        return

    tx = transact("station", admin, station_commands)
    station_id = created(tx, f"{original}::umbrella::Station")
    station_cap = created(tx, f"{original}::umbrella::StationCap")
    umbrellas = {}
    for name, color in (("black", 1), ("vinyl", 0)):
        tx = transact(name, bob, umbrella_commands(color))
        umbrellas[name] = created(tx, f"{original}::umbrella::Umbrella")
    commands = []
    for umbrella in umbrellas.values():
        commands += call("station_dock_umbrella", f"@{station_cap}", f"@{station_id}",
                         f"@{umbrella}", "0", "@0x6")
    transact("dock-both", station, commands)
    summary = {"network": env, "package": package, "station": station_id,
               "station_cap": station_cap, "station_account": station, "supplier": bob, **umbrellas}
    (logs / "result.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("Both umbrellas docked.\n" + json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Error: {error}", file=sys.stderr)
        print("Earlier transactions may have succeeded. Inspect the printed logs before rerunning.", file=sys.stderr)
        sys.exit(1)
