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

## Quarantine review

An inspection-window rejection refunds the current buyer immediately and freezes
the prior condition hold as `AwaitingReview`. Rejection may concern wear, a ratty
appearance or other undesirability; it is not limited to intentional damage.

`umbrella::admin_review_quarantined_umbrella(&AdminCap, &Station, &mut Umbrella,
expected_owner_count, approve_refund, &mut TxContext)` requires AdminCap, allowing
the collecting admin to review umbrellas from any station without its StationCap.
The supplied Station must match the recorded receiving station, so the caller
cannot substitute a different maintenance reserve. Approval records `RefundApproved`;
the same admin sweep pays the prior owner and records `Paid`. Otherwise the review
pays the fixed maintenance reserve and records `Forfeited`. Decisions are final,
and neither outcome reactivates the umbrella. The current buyer keeps their full
refund regardless of the review result.

There is no automatic review timeout or maximum docked waiting period in this
change. Unreviewed holds remain escrowed; those deadline policies are still open.

## Retirement and replacement

`umbrella::admin_retire_umbrella(&AdminCap, &mut Umbrella, expected_owner_count)`
permanently marks a QUARANTINED umbrella RETIRED after its condition result is
PAID or FORFEITED and both escrow balances are empty. An approved refund must
be swept before retirement. Review, sweep and retirement can be composed in one
transaction. Retirement clears the current station so the item leaves inventory,
but preserves the object ID, supplier and latest condition record. The old QR
remains a read-only retired record. Repeated retirement and other custody actions
abort; the existing sweep skips retired records.

There is no reactivation function. An admin-funded replacement uses the existing
`user_create_umbrella` supply flow with a fresh bond, a new object ID and QR, and
normal station activation. The admin becomes the new record's supplier and
receives its supplier revenue. The old record and its settled funds stay separate.
