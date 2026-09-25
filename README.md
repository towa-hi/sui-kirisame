# sui-kirisame
Real world sharing protocol for sui

refer to docs/mvp-plan.md for initial documentation

FOR ROBOTS:
use publish-and-init.sh to deploy a new contract

## Periodic settlement

`umbrella::admin_settle_pending_payments(&AdminCap, &mut Umbrella, &Clock, &mut TxContext)`
releases a HELD umbrella's pending prior condition hold once inspection ends.
While buyback is positive, the current purchase escrow, holder and timer remain
unchanged. Once buyback reaches zero, the same sweep also pays 70% of purchase
escrow to the supplier and the remainder to the checkout station, and marks the
umbrella SOLD. Both balances are then empty; the final holder and latest condition
result remain available. Ineligible umbrellas and already-completed payouts are
no-ops. SOLD umbrellas cannot be docked or purchased again.

Customers have no refund-claim action or signature. The demo admin submits the
sweep through SETTLE PAYMENTS; the contract does not schedule itself. An unattended
service will need a funded transaction runner. Holds on DOCKED umbrellas still wait
for the next customer's inspection; the sweep does not waive that condition.
