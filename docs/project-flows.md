# Kirisame contract flows

These diagrams reflect the [current contract](../move/kirisame/sources/kirisame.move). Design authority remains the [constitution](../../sui-stack-hello-world/docs/actor-responsibilities.md).

## Umbrella custody

```mermaid
stateDiagram-v2
    [*] --> Created: user_create_umbrella / bond
    Created --> Docked: station_dock_umbrella
    Docked --> Held: user_undock_umbrella / purchase
    Held --> Docked: station_dock_umbrella / ended inspection and positive buyback
    Held --> Quarantined: station_quarantine_umbrella / before inspection deadline
    Held --> Sold: admin_settle_pending_payments / zero buyback
    Quarantined --> Retired: admin_retire_umbrella / Paid or Forfeited and empty balances
    Docked --> Retired: admin_retire_station_umbrella / station Removing
```

Docking, checkout and quarantine require an Active station. Station attestations require its StationCap; admin actions require AdminCap. Inspection starts at checkout inside Held. Time passing never changes stored state. Sold retains the final buyer; Retired clears the current station. Neither can re-enter circulation.

## Condition funds

```mermaid
flowchart TD
    Pending["Pending: supplier bond or prior user's return hold"] --> Purchase["Next purchase; hold stays escrowed"]
    Purchase --> Outcome{"Inspection outcome"}
    Outcome -->|Deadline passes| Eligible["Eligible for admin sweep or normal return payout"]
    Eligible --> Paid["Paid to recorded condition owner"]
    Outcome -->|Station confirms rejection before deadline| Review["Buyer refunded in full; prior hold AwaitingReview"]
    Review --> Decision{"Admin final review"}
    Decision -->|Approve| Approved["RefundApproved; funds remain escrowed"]
    Approved -->|Admin sweep| Paid
    Decision -->|Forfeit| Reserve["Forfeited; paid to receiving station reserve"]
    Pending -->|Docked at Removing station; admin retires item| Paid
```

Quarantine review can concern wear or undesirability. Rejection alone does not forfeit the hold. Approved refunds require settlement; neither review outcome reactivates the item. A normal return creates a new condition record for the returning user. There is no customer claim action or automatic timeout.

## Admin settlement

```mermaid
flowchart TD
    Sweep["admin_settle_pending_payments / one umbrella"] --> State{"Current state"}
    State -->|Quarantined| Approved{"RefundApproved?"}
    Approved -->|Yes| Refund["Pay prior hold; record Paid; keep Quarantined"]
    Approved -->|No| Skip["No-op"]
    State -->|Held| Deadline{"Inspection ended?"}
    Deadline -->|No| Skip
    Deadline -->|Yes| Prior["Pay pending prior hold once"]
    Prior --> Zero{"Buyback zero?"}
    Zero -->|No| Keep["Keep Held, purchase escrow and timer"]
    Zero -->|Yes| Split["Purchase revenue: admin 10%, supplier 63%, checkout station 27%"]
    Split --> Sold["Sold; empty balances; retain final buyer"]
    State -->|Created, Docked, Sold or Retired| Skip
```

Normal returns independently split usage revenue: nominally 10% admin, 63% supplier, 13.5% checkout station and 13.5% return station. The buyer receives buyback above the new condition hold. Payouts use the contract’s integer rounding. Settlement needs an admin transaction; the contract does not run a background timer.

## Station removal

```mermaid
flowchart TD
    Active["Active station"] --> Remove["admin_remove_station: block docking, checkout and new quarantine"]
    Remove --> Count{"Docked count zero?"}
    Count -->|Yes| Removed["Removed"]
    Count -->|No| Removing["Removing"]
    Removing --> Retire["admin_retire_station_umbrella: refund hold; retire matching docked item"]
    Retire --> Decrement["Decrement docked count"]
    Decrement --> Count
```

Retirement is mandatory work before completion, not an automatic loop over shared objects. Admins may process bounded batches. Held items are unaffected and may return to another Active station; existing quarantine reviews and payments remain possible. The retained station capability cannot bypass status checks. Physical collection is an operator/admin responsibility.
