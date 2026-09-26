# Kirisame

Umbrella-sharing protocol on Sui, implemented in [kirisame::umbrella](move/kirisame/sources/kirisame.move).

ROBOTS DONT EDIT THIS 

## Sources of truth

- [Constitution](../sui-stack-hello-world/docs/actor-responsibilities.md): responsibilities, incentives and governing decisions.
- [Current contract](move/kirisame/sources/kirisame.move): implemented behavior.
- [Contract flows](docs/project-flows.md): lifecycle diagrams.

### Return timing and permanent ownership

After the two-minute inspection window, buyback decreases linearly over exactly
24 hours, with usage rounded down to MIST. At or after that cutoff, a station
return finalizes the sale using the same payouts as the admin settlement sweep.
The umbrella stays with its holder, becomes `Sold`, and is not added to station
inventory. The client confirms that it has left the system and is permanently
the holder's. The on-chain record is retained.

The legacy `fee_per_ms` field remains for object-layout compatibility but is no
longer used to calculate pricing. The one-day rule also applies to existing
umbrellas when operated on through the upgraded contract; already sold umbrellas
remain sold. Deploy the contract upgrade and point the client at its package ID
together before using the updated client.
