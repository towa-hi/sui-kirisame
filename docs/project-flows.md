# Kirisame diagrams

Behavior: [contract](../move/kirisame/sources/kirisame.move). Rationale: [constitution](constitution.md). Where they differ, these diagrams follow the contract.

## Actors and trust

```mermaid
flowchart TB
    Supplier["Supplier<br/>Supplies physical umbrellas<br/>Earns usage and sale revenue"]
    User["User<br/>Owns the physical umbrella while held<br/>Inspects immediately after purchase"]
    Station["Station operator · StationCap<br/>Attests physical docking and quarantine<br/>Earns station revenue"]
    Admin["Administration · AdminCap<br/>Oversees stations, settles funds<br/>Reviews condition and handles disposal"]
    Contract["Shared Station and Umbrella objects<br/>Contract enforces state, capabilities and escrow"]
    Supplier -->|"Create · exact 0.03 SUI bond into escrow"| Contract
    User -->|"Checkout · exact 0.1 SUI purchase"| Contract
    User -.->|"Physical return or rejection"| Station
    Supplier -.->|"Physical first deposit"| Station
    Station -->|"Dock or quarantine · authorized cap"| Contract
    Admin -->|"Create, transfer or remove stations"| Contract
    Admin -->|"Review, settle or retire umbrellas"| Contract
    Contract -.-> Trust["Physical condition depends on human attestation<br/>User flags problems → station confirms → admin judges"]
```

## Umbrella lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: user_create_umbrella · supplier bond escrowed
    Created --> Docked: station_dock_umbrella · first deposit
    Docked --> Held: user_undock_umbrella · purchase escrowed
    Held --> Docked: station_dock_umbrella · inspection ended, buyback positive
    Held --> Quarantined: station_quarantine_umbrella · before deadline, buyer refunded
    Held --> Sold: admin_settle_pending_payments · buyback zero
    Held --> Sold: station_dock_umbrella · buyback zero, no docking
    Quarantined --> Retired: admin_retire_umbrella · Paid or Forfeited, both balances empty
    Docked --> Retired: admin_retire_station_umbrella · station Removing, hold refunded

    note right of Held
        Inspection deadline = checkout + 2 minutes
        Time alone never changes state
    end note
    note right of Sold
        Terminal · balances empty
        Final buyer remains holder
    end note
    note right of Retired
        Terminal · balances empty
        Current station cleared
    end note
```

## Inspection and price

```mermaid
flowchart LR
    Checkout["Checkout · t = 0<br/>P = 100,000,000 MIST<br/>1 SUI = 1,000,000,000 MIST"]
    Inspect["0 ≤ t &lt; 2 minutes<br/>Quarantine allowed<br/>Normal return aborts"]
    Boundary["t = 2 minutes<br/>Quarantine closed<br/>Return allowed · usage = 0"]
    Usage["2 minutes &lt; t &lt; 24 hours + 2 minutes<br/>Usage grows linearly<br/>Buyback = P − usage"]
    Sale["t ≥ 24 hours + 2 minutes<br/>Usage = P · buyback = 0<br/>Sweep or docking attempt → Sold"]
    Checkout --> Inspect --> Boundary --> Usage --> Sale
    Formula["Contract arithmetic · MIST and milliseconds<br/>elapsed = min(max(now − deadline, 0), 86,400,000)<br/>usage = floor(P × elapsed / 86,400,000)"]
    Usage --- Formula
```

## Purchase, return and revenue

```mermaid
flowchart TB
    Purchase["user_undock_umbrella<br/>Purchase P → active_escrow<br/>Prior condition hold remains separate"]
    Trigger["After inspection<br/>station_dock_umbrella at an Active station"]
    Decision{"Buyback B = P − usage"}
    Purchase --> Trigger --> Decision
    Prior["Pay prior Pending hold once<br/>To its recorded owner"]
    Sale["finalize_sale<br/>Pay prior Pending hold once<br/>Revenue R = full purchase P"]
    Decision -->|"B &gt; 0"| Prior
    Decision -->|"B = 0"| Sale
    Prior --> Return["Revenue R = usage<br/>Hold H = min(B, 30,000,000 MIST)"]
    Return --> Buyer["Returning holder receives B − H<br/>H → pending_condition for that holder<br/>New Pending record · cycle = owner_count<br/>Clear holder · Docked · station count +1"]
    Return --> Split["Admin A = floor(R × 10 / 100)<br/>Remaining Q = R − A<br/>Supplier S = floor(Q × 70 / 100)"]
    Sale --> Split
    Split --> Mode{"Revenue source"}
    Mode -->|"Normal return"| Stations["Checkout C = floor(Q × 15 / 100)<br/>Return station = Q − S − C<br/>Nominal total shares: 10 / 63 / 13.5 / 13.5 %"]
    Mode -->|"Final sale"| CheckoutStation["Checkout station = Q − S<br/>Nominal total shares: 10 / 63 / 27 %<br/>Sold · no docking or return payout"]
    Recipients["Admin and checkout addresses saved at checkout<br/>Return payout uses receiving station's current address<br/>Integer remainder goes to the final station recipient"]
    Split --- Recipients
```

## Condition hold and quarantine review

```mermaid
flowchart TB
    Initial["Creation: supplier's 0.03 SUI bond<br/>Normal return: holder's min(buyback, 0.03 SUI)"]
    Pending["Pending<br/>Funds escrowed for recorded owner"]
    Initial --> Pending
    Pending -->|"Next checkout"| Inspection["Prior hold stays escrowed<br/>New buyer inspects for 2 minutes"]
    Inspection -->|"Inspection ended + admin sweep or return"| Paid["Paid<br/>Prior hold sent once to recorded owner"]
    Pending -->|"Docked at Removing station + admin retirement"| Paid
    Inspection -->|"Station attests quarantine before deadline"| Review["Quarantined · AwaitingReview<br/>Full purchase refunded to buyer immediately<br/>Only prior condition hold awaits judgment"]
    Review --> Judge{"admin_review_quarantined_umbrella<br/>Final human decision"}
    Judge -->|"Approve refund"| Approved["RefundApproved<br/>Hold remains escrowed"]
    Approved -->|"admin_settle_pending_payments"| PaidReview["Paid<br/>Hold sent to recorded owner"]
    Judge -->|"Deny refund"| Forfeited["Forfeited<br/>Hold sent immediately to receiving station's<br/>fixed maintenance_reserve"]
    PaidReview --> Retire["Still Quarantined<br/>admin_retire_umbrella → Retired<br/>Requires both balances empty"]
    Forfeited --> Retire
    Rationale["Rejection alone does not establish fault<br/>Admin assesses wear, damage and suitability<br/>No review outcome returns the item to circulation"]
    Judge --- Rationale
```

## Admin settlement

```mermaid
flowchart TB
    Sweep["admin_settle_pending_payments<br/>AdminCap · one umbrella per call"] --> State{"Umbrella state"}
    State -->|"Created / Docked / Sold / Retired"| Noop["No-op"]
    State -->|"Quarantined"| Approved{"RefundApproved?"}
    Approved -->|"No"| Noop
    Approved -->|"Yes"| Refund["Pay condition hold to recorded owner<br/>Mark Paid · remain Quarantined"]
    State -->|"Held"| Deadline{"now ≥ inspection deadline?"}
    Deadline -->|"No"| Noop
    Deadline -->|"Yes"| Zero{"Buyback zero?"}
    Zero -->|"No"| Held["Pay Pending prior hold once<br/>Remain Held<br/>Purchase escrow and deadline unchanged"]
    Zero -->|"Yes"| Sold["Pay Pending prior hold once<br/>Split purchase revenue<br/>Sold · retain buyer · balances empty"]
    Operations["Administration must submit transactions<br/>No automatic timer or customer claim action<br/>A hold on an Active station's Docked item waits for reuse"]
    Sweep --- Operations
```

## Station authority and removal

```mermaid
flowchart TB
    Create["admin_create_station · AdminCap<br/>Shared Active station · docked_count = 0<br/>StationCap sent to payout address<br/>Reserve fixed to creation transaction sender"]
    Active["Active station"]
    Create --> Active
    Active --> Transfer["admin_transfer_station · AdminCap<br/>Issue replacement cap to new owner<br/>Replace authorized_cap and payout address"]
    Transfer --> Revoked["Old caps fail authorization<br/>Reserve and existing checkout snapshots unchanged"]
    Revoked --> Active
    Active --> Access["Dock and quarantine: matching authorized StationCap<br/>Checkout: user purchase, no StationCap<br/>All three require Active and expected_owner_count"]
    Active --> Remove["admin_remove_station · AdminCap<br/>Block docking, checkout and new quarantine"]
    Remove --> Count{"docked_count = 0?"}
    Count -->|"Yes"| Removed["Removed"]
    Count -->|"No"| Removing["Removing"]
    Removing --> Retire["admin_retire_station_umbrella · AdminCap<br/>One matching Docked umbrella per call<br/>Require empty active escrow · refund condition hold<br/>Retired · clear station · docked_count −1"]
    Retire --> Count
    Remove -.-> Unaffected["Held items can return to another Active station<br/>Existing quarantine reviews and settlement remain available<br/>Quarantined items do not count as docked stock"]
    Retire -.-> Physical["Administration and operators arrange physical collection<br/>Contract retirement does not collect umbrellas"]
```
