# sui-kirisame
Real world sharing protocol for sui

refer to docs/mvp-plan.md for initial documentation

FOR ROBOTS:
use publish-and-init.sh to deploy a new contract

## Periodic settlement

`umbrella::admin_settle_pending_payments(&AdminCap, &mut Umbrella, &Clock, &mut TxContext)`
settles a HELD umbrella once its buyback reaches zero. It releases any pending
prior condition hold, pays 70% of purchase escrow to the supplier and the remainder
to the checkout station, and marks the umbrella SOLD. Both balances are emptied;
the final holder and latest condition result remain available. Ineligible umbrellas
and repeated calls are no-ops. SOLD umbrellas cannot be docked or purchased again.
