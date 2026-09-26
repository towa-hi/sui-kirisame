Run from the repository root with Python 3.11+ and the configured Sui CLI:

```sh
bash move/kirisame/publish-and-init.sh
```

The script publishes a fresh contract in the active Sui environment, updates
`Published.toml`, the frontend package defaults, and the README deployment link,
then initializes that deployment. It restores the previous active address on exit.
All initialization logic is embedded in the shell script.

- `mono` creates `Toranomon Station` and `EthGlobal Station`, with `station` as
  both stations' payout address and StationCap owner.
- `alice-supplier` creates four umbrellas, posting a 0.03 SUI bond for each:
  one Black and one Vinyl umbrella for each station.
- `station` docks each pair at its assigned station using that station's StationCap.

Both stations use the approximate Toranomon demo location (35.670200, 139.749800).
Before initialization, the script checks for a single gas coin with at least
0.2 SUI for `mono`, 0.2 SUI for `station`, and 0.52 SUI for `alice-supplier`.
The admin also needs gas for publication before these checks. These are conservative
gas-budget requirements; unused gas is retained.

Each run publishes a new package and creates two new stations and four new umbrellas.
Publication and the eight initialization transactions are not atomic as a group.
If a step fails, inspect the printed temporary log directory before rerunning.
It contains initialization transaction responses and, on success, `result.json`
with both stations, capabilities, the supplier, and all umbrella IDs.
