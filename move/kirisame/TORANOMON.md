Run from the repository root with Python 3.11+ and the configured Sui CLI:

```sh
python3 move/kirisame/create-toranomon.py --check
python3 move/kirisame/create-toranomon.py
```

The script uses the active Sui environment and its deployment in `Published.toml`.
It checks the chain ID and discovers that deployment's AdminCap. It leaves the
active address unchanged and signs with the local CLI keys:

- `mono` creates Toranomon station, with `station` as its payout address and StationCap owner.
- `bob-borrower` creates one black and one vinyl umbrella, posting 0.03 SUI each.
- `station` docks both umbrellas in one transaction using its StationCap.

Override account aliases with `--admin`, `--station`, and `--bob` if needed.
Fund admin and station with at least one 0.1 SUI gas coin each, and Bob with one
0.26 SUI coin. These are conservative gas-budget requirements; unused gas is retained.
The station uses an approximate Toranomon location (35.670200, 139.749800).

`--check` only reads chain state and dry-runs creation; it does not submit transactions.
Docking depends on newly created objects and runs only in normal mode.
Each normal run creates a **new** station and two new umbrellas. The four
transactions are not atomic as a group. If any step fails, inspect the printed
temporary log directory before rerunning to avoid duplicates. The directory
contains transaction responses and, on success, `result.json` with all object IDs.
