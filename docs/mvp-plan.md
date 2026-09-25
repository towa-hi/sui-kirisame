# Kirisame MVP plan

The demo uses one dapp with two tabs: **CLIENT** and **STATION**. One phone runs the client view; another runs the station view. **John is both the protocol admin and the station operator for demo purposes.** Station registration requires `AdminCap`. Physical deposits and returns require only the selected station's `StationCap`. He operates the station phone and manually scans umbrellas to simulate the sensors a physical station would eventually have.

**The demo has no application server or background worker.** Both tabs read the chain directly. John uses **SETTLE PAYMENTS** on the STATION tab only to distribute escrow for zero-buyback purchases and record SOLD.

All payments, supplier collateral, condition holds, refunds, revenue and transaction gas use **native SUI on Sui Testnet**. No separate payment token is needed.


## 1. Begin with the supplier

Alice has an umbrella she wants to add to the network. She uses the same CLIENT tab as customers; there is no separate supplier app.

1. Alice connects her wallet and presses **SUPPLY UMBRELLA**.
2. A modal explains the supplier collateral, how it is released, and how she earns usage revenue.
3. Alice confirms, signs a transaction, and pays the supplier collateral: 0.03 SUI under the demo parameters below.
4. The contract creates a shared umbrella object, records Alice as its supplier, and holds her collateral. Its state is `CREATED`: registered, but not yet available to buy.
5. After the transaction succeeds, the modal displays a printable QR tag containing a URL such as `https://<dapp-host>/u/<umbrella-object-id>`.
6. Alice prints the tag, attaches it to the umbrella, and hands it to John at the station.
7. John chooses the station he is operating and presses **SCAN RETURNED OR SUPPLIED UMBRELLA**.
8. John scans the tag. The dapp reads the umbrella from the chain and recognizes it as new supply.
9. John signs the station activation transaction. It records the physical deposit at the selected station and changes the umbrella to `DOCKED`.
10. After success, John places the umbrella in the normal bin. It appears in the station inventory and becomes buyable.

There are two transactions with different jobs. Alice registers the umbrella's identity and collateral; John registers its arrival at a station. The QR can be printed between these steps because the first transaction already created the permanent object ID. A QR alone does not make an umbrella buyable.

### What the supplier owns and earns

Alice remains the recorded supplier across later purchases and returns. She earns the supplier share when a normal return or zero-buyback sale settles a purchase. Returning to a different station does not change the supplier.

Her initial collateral protects the first customer against unusable supply:

| First customer's outcome | What happens to Alice's collateral |
| --- | --- |
| Inspection ends without rejection | Becomes claimable; paid by Alice’s claim, the buyer’s eligible normal return, or zero-buyback settlement. Expiry alone does not pay it. |
| Station confirms a fault return within the inspection window | Sent to the maintenance reserve |
| Nobody purchases the umbrella | Remains pending |
| Alice registers it but never deposits it | Remains pending; cancellation is outside this MVP |

After the first successful inspection, future condition holds come from returning customers' refunds. Alice does not post a new bond every time the same umbrella is bought. The MVP has no supplier asset-withdrawal, repair, or deactivation flow; claiming eligible supplier collateral remains supported.

The supply modal needs **CONFIRM**, **DENY**, and, after success, **PRINT QR**. The client view also needs a small **Supplied umbrellas** section so Alice can reopen the same QR after closing the modal or refreshing. Reprinting must never create another umbrella or charge another bond. Show the object ID and URL in text alongside the QR.

## 2. The station and its two bins

A station has a display name, a unique ID, a human-readable location name, latitude and longitude, an authorized operator, and a payout address. Physically, the demo station has:

- A **normal bin** for umbrellas available to purchase, whether newly supplied or returned.
- A **quarantine bin** for umbrellas rejected during inspection. These cannot be purchased.

John's scans stand in for detecting an umbrella entering either bin. The scanner identifies the umbrella; the signed transaction records the custody change. The contract decides whether that change is allowed and how money moves.

### Register and select a station

John, acting as the demo admin, opens **STATION → REGISTER NEW STATION**, enters the display name `yoyogi`, a human-readable location name, and its latitude and longitude, then presses **CONFIRM**. He signs using the admin Sui account. After the transaction succeeds, a result modal shows the new station ID.

John, now acting as the station operator, opens **SET CURRENT STATION**, chooses `yoyogi` from the dropdown, and presses **CONFIRM**. The station phone now shows Yoyogi's inventory and targets Yoyogi in subsequent scan transactions.

Station registration and planned SETTLE PAYMENTS require this deployment's `AdminCap`. Selection remains a local preference with no transaction. Deposit, normal-return and quarantine scanners require only the selected station's `StationCap`, validated onchain against the receiving station. Chain data remains public.

For this demo, newly registered stations issue their capability to the registering admin wallet, and default their payout address to that wallet. John can therefore operate multiple demo stations with one wallet. The dropdown lists all registered stations, labels ones the wallet cannot operate, and explains why their scan actions are unavailable. These are the demo defaults.

### Station screen

| Display or button | Behavior |
| --- | --- |
| Current station name, ID and location | Show the selected station's display name, human-readable location and map coordinates, or “No station selected.” |
| Normal-bin inventory | Live list of `DOCKED` umbrellas at this station; distinguish newly supplied and returned items using `owner_count` (zero for new supply, positive for returned items). |
| Quarantine-bin inventory | Live list of `QUARANTINED` umbrellas physically recorded at this station. |
| **SCAN RETURNED OR SUPPLIED UMBRELLA** | Disabled without a current station. Opens a QR scanner modal; new supply activates, an eligible purchased umbrella returns. |
| **SCAN QUARANTINED UMBRELLA** | Disabled without a current station. Opens a QR scanner modal for a customer's fault return during inspection. |
| **REGISTER NEW STATION** | Opens fields for display name, human-readable location, latitude and longitude with **CONFIRM / DENY**. Confirm requests the admin signature; success opens the station-ID modal. |
| **SETTLE PAYMENTS** | Reads all registered umbrellas, previews only zero-buyback purchase settlements, then requests John’s signature for bounded transactions. No physical scan or current-station selection required. |
| **SET CURRENT STATION** | Opens the station dropdown with **CONFIRM / DENY**. Confirm changes only this device's selection. |

Docking and quarantine require only the selected station’s StationCap. Recheck access on wallet/account changes and before each submission. “Quarantined” in the second scan button means putting a currently purchased umbrella into quarantine; scanning an already quarantined umbrella must not refund it again.

Inventory must reflect confirmed chain state. Remove umbrellas when checkout succeeds; add them when activation or return succeeds. A quarantined umbrella must record its receiving station so it appears in the correct quarantine bin. When reads fail, show a stale/offline indicator rather than implying the inventory is current.

### How the normal-bin scanner chooses an action

| Scanned umbrella state | Action |
| --- | --- |
| `CREATED` | Activate new supply at the selected station. |
| `HELD`, inspection ended and positive buyback | Pay any still-pending prior hold and settle the normal return in one transaction. |
| `HELD`, zero buyback | Reject the return even before payment settlement. Show “Sold — payment settlement pending.” |
| `HELD`, inspection window still open | Explain that normal return is unavailable until inspection ends; a faulty item can use the quarantine scanner. |
| `DOCKED` | Show “Already deposited”; do not create a duplicate deposit or silently move it between stations. |
| `QUARANTINED` or `SOLD` | No normal-bin action. SOLD is a permanently invalid, read-only record. |

After decoding a QR, pause scanning and display the umbrella, selected station, and proposed action before requesting John's signature. Keep the selected station fixed for that operation. Prevent repeated camera frames from creating duplicate prompts. On success, show the transaction result and refresh inventory; on denial or failure, allow retry without presenting the item as successfully deposited.

## 3. The client screen and purchasing

The CLIENT tab serves both customers and suppliers. Its main page shows the connected wallet's money and umbrellas.

| Display or button | Behavior |
| --- | --- |
| Balance | Available SUI balance, used for both payments and gas. Show estimated transaction gas separately as a cost, not as a second token balance. Escrow and pending refunds are not spendable balance. |
| Currently purchased umbrellas | List umbrellas whose active holder is this wallet, in HELD, including its initial inspection window. At zero buyback, label it “Sold — payment settlement pending” and disable return actions. |
| Per-umbrella information | Umbrella ID, checkout station name, inspection or usage status, time until buyback reaches zero, estimated refund now, and condition hold. |
| Pending refunds | Itemized supplier collateral or return condition holds belonging to this wallet, plus a total, successor inspection status, and **CLAIM REFUND** when eligible. |
| Finalized purchases | Umbrellas kept by this wallet after zero-buyback sale settlement; show SOLD / Invalid, with no return, purchase or other action. |
| Latest refund results | Show “Refund paid” or “Return quarantined” from each umbrella where this wallet is last owner. A later normal return replaces that record. |
| Supplied umbrellas | Minimal list for reopening printable QR tags and seeing whether the umbrella is awaiting deposit or already in circulation. |
| **PURCHASE UMBRELLA** | Opens the camera scanner and sends the decoded umbrella to its purchase confirmation page. |
| **SUPPLY UMBRELLA** | Opens the supply modal described in section 1; a successful supply transaction reveals the printable QR. |

The purchase and supply buttons live on the client main page. This resolves the two purchase entry routes in the demo:

- **Default phone camera:** scan an umbrella tag → open its URL → go directly to its purchase confirmation page.
- **Dapp camera:** CLIENT → **PURCHASE UMBRELLA** → scan a tag → go to that same confirmation page.

Opening an umbrella URL must not ask Bob to scan the umbrella a second time.

### Purchase confirmation page

Show the umbrella ID, supplier, current station, availability, purchase price, usage rate, maximum condition hold, and these inspection terms:

> You have two minutes after purchase to inspect this umbrella. If it is faulty, physically return it to the station immediately. The station’s quarantine transaction must execute before the inspection window ends for a full purchase refund; handing it back or starting a scan alone is not enough. Usage charges start when the window ends. A normal return may leave part of your refund pending. After the next customer's inspection ends without rejection, you can claim that amount; their normal return or final purchase settlement also pays it if still pending.

The page has **CONFIRM / DENY**. If Bob needs to connect his wallet, preserve the umbrella URL through that step. Confirm requests his signature for the exact purchase payment; deny returns to the client main page without sending a transaction. Purchase is enabled only while the latest known state is `DOCKED`, and the contract enforces that rule again at execution.

The purchase transaction records HELD immediately. After confirmation, show the inspection countdown and add the umbrella to Bob's current purchases. The station view removes it from the normal-bin list and shows that release is permitted. John lets Bob take it. No second transaction is needed to release the umbrella physically.

For unavailable umbrellas, the same URL shows their status rather than a usable purchase action. An existing holder sees their current purchase information.

### What “time left” means

Normal returns are allowed only after inspection ends and while buyback is strictly positive. The return period ends when the time-based buyback reaches zero, whether or not payment settlement has run.

- During inspection, show **Inspection remaining** and **Full refund through station quarantine**. Normal return is unavailable during this window.
- After inspection, show **Time until buyback reaches 0 SUI** and **Estimated refund if returned now**.
- Split that estimate into **Paid now** and **Pending condition hold**. Do not present both as immediately spendable money.
- At zero buyback, show 0 SUI and zero remaining buyback time. The purchase is eligible for final settlement through SETTLE PAYMENTS. Reaching zero alone does not transfer funds. Returns are already prohibited at this point, including before settlement. Once settled, show SOLD / Invalid; the buyer keeps the physical umbrella and the retained onchain record is permanently unusable.

The on-screen clock is an estimate. The contract uses Sui Clock at transaction execution for the actual fee and inspection deadline.

## 4. Bob's two return paths

Every confirmed purchase includes a two-minute inspection window. “Approves the umbrella” means confirming the purchase, not a separate acceptance transaction. After the window, the holder is responsible for damage and cannot use the full-refund fault-return path. A normal return retains the successor-checked condition hold; no additional damage charge or dispute flow is introduced. There is no ACCEPT button, shortened inspection option, or normal return while the window is open.

### Path A: Bob rejects the umbrella

1. Bob inspects it immediately and finds a fault.
2. He physically gives it back to John before the inspection window ends.
3. John presses **SCAN QUARANTINED UMBRELLA** and scans the tag.
4. The station phone shows a fault-return action and requests John's signature.
5. The transaction must execute before the onchain deadline. It verifies the station capability and umbrella state.
6. The contract refunds Bob's entire purchase, sends the prior condition hold to the maintenance reserve, and changes the umbrella to `QUARANTINED` at John's selected station.
7. John sees success and puts it in the quarantine bin. Both phones refresh.

For a first purchase, the forfeited prior hold is Alice's supplier collateral. On later purchases, it is the previous customer's condition hold. Bob receives no extra reward for rejecting. Starting the scan before the deadline does not guarantee a refund if the transaction executes after it.

### Path B: Bob uses and returns the umbrella

1. Bob's inspection window ends without rejection. The umbrella is already HELD from purchase; no transaction changes that state or starts the timer. Alice's collateral becomes claimable, and Bob's later normal return pays it if she has not claimed it.
2. Bob returns five minutes after purchase and gives the umbrella back to John.
3. John presses **SCAN RETURNED OR SUPPLIED UMBRELLA**, scans the tag, and signs the normal-return transaction.
4. The contract calculates Bob's usage fee and remaining refund, records the condition hold in Bob's name, and makes the umbrella `DOCKED` at the receiving station.
5. After success, John puts it in the normal bin. Bob's client shows **Refund pending — waiting for the next customer's inspection**. At the current rate, this example leaves 0.03 SUI pending and pays 0.0106 SUI immediately.
6. Carl walks up and scans this umbrella's QR with his default camera. He opens the same purchase confirmation page Bob used, confirms, and signs his purchase.
7. Carl now has his own two-minute inspection window. Bob's pending entry changes to **Next customer inspecting**, with that deadline. Carl's purchase alone does not release Bob's refund.

The story branches again:

### Path B1: Carl rejects the umbrella

1. Carl gives the umbrella back to John during Carl's inspection window.
2. John presses **SCAN QUARANTINED UMBRELLA**, scans it, and signs the fault-return transaction. It must execute before Carl's deadline.
3. Carl receives his full purchase payment back. Bob's pending condition hold goes to the maintenance reserve, and the umbrella becomes `QUARANTINED` at the receiving station.
4. John puts it in the quarantine bin. Bob receives none of the pending amount. His client removes it from the pending total and shows the latest result: **Return quarantined — pending refund not paid**.

That result describes the outcome of Bob's return; it does not claim who damaged the umbrella. Bob keeps the 0.0106 SUI immediate refund from his five-minute return. Any immediate refund already paid stays paid. Only the pending condition hold depends on Carl's inspection.

### Path B2: Carl does not reject the umbrella

1. Carl's two-minute inspection window expires without a successful fault return. The umbrella remains HELD and usage accrues from the deadline automatically by calculation.
2. Bob's pending refund becomes **Ready to claim**. Expiry alone does not transfer funds.
3. Bob presses **CLAIM REFUND** and signs. The contract verifies that Bob is the recorded last owner, his hold is still pending, and Carl's deadline has passed.
4. The contract pays Bob and records PAID. Carl remains the current owner and the umbrella remains HELD; its timer is unchanged.
5. If Bob does not claim, Carl's eligible normal return pays Bob's pending hold before creating Carl's new hold. If Carl keeps it until buyback reaches zero, John's **SETTLE PAYMENTS** pays Bob's pending hold along with finalizing Carl's purchase. John cannot use this button merely because Carl's inspection expired.


The grace period belongs to Carl's purchase. It is not a timer beginning when Bob returns. If nobody purchases the umbrella after Bob, his refund stays pending indefinitely under the MVP rules.

Alice can use the same **CLAIM REFUND** action for her initial collateral once the first customer's inspection deadline has passed and her hold is still pending. The button is available to the recorded pending owner; it is not exclusive to returning customers.

### Pending-refund states in Bob's client

| Status | What Bob sees / can do |
| --- | --- |
| Waiting for next purchase | Amount pending; no countdown to release and no claim action. |
| Next customer inspecting | Carl's inspection countdown; claim unavailable. |
| Ready to claim | Deadline passed, prior hold still belongs to Bob, and hold has not been paid; **CLAIM REFUND** enabled. Station cleanup applies only once the current purchase reaches zero buyback. |
| Refund paid | Retained amount and PAID status in latest refund results; removed from pending total. |
| Return quarantined | Pending amount forfeited after Carl's fault return; no claim action; retain the latest result. |

The claim action must re-read the current umbrella and verify the expected ownership/inspection cycle before building a transaction. Station settlement and client claim submissions can race: if another transaction settled first, refetch and show the confirmed outcome rather than sending another payment or treating it as lost funds. A later normal return or zero-buyback sale settlement also releases Bob's hold if the hold has not already been paid.

## 5. Money rules, with an example

Use the following SUI-denominated demo parameters. They specify native SUI amounts, not dollar values.

| Setting | Value |
| --- | --- |
| Purchase payment | 0.10 SUI (100,000,000 MIST) |
| Supplier collateral | 0.03 SUI (30,000,000 MIST) |
| Maximum return condition hold | 0.03 SUI (30,000,000 MIST) |
| Inspection window | 2 minutes (120 seconds) |
| Demo usage rate | 330 MIST per millisecond = 0.0198 SUI per charged minute |
| Normal-return revenue split | 70% supplier, 15% checkout station, 15% return station |
| Zero-buyback sale split | 70% supplier, 30% checkout station |

With these constants, buyback reaches zero at `inspection_deadline_ms + ceil(100_000_000 / 330)` milliseconds: **423,031 ms after checkout** (7 minutes 3.031 seconds). Derive the cutoff with integer arithmetic; do not round a small positive buyback to zero for eligibility.

Use integer MIST for accounting: **1 SUI = 1,000,000,000 MIST**. The rate is accelerated for the demo. Charged duration is derived from the purchase timestamp plus 120 seconds. No timer-start transaction is required, and claiming or settling never changes the timer origin.

```text
inspection deadline = checkout time + 120 seconds
charged duration    = max(0, chain time − inspection deadline)
usage fee           = min(purchase price, charged duration × usage rate)
total buyback     = purchase price − usage fee
condition hold    = min(total buyback, maximum condition hold)
immediate refund  = total buyback − condition hold

purchase payment  = usage fee + immediate refund + condition hold
```

**Bob returns five minutes after purchase:** the first two minutes were inspection, so three minutes are charged. If the return transaction executes exactly five minutes after checkout, the fee is 0.0594 SUI and buyback is 0.0406 SUI. The maximum 0.03 SUI remains as a condition hold, so Bob receives **0.0106 SUI immediately**. If “five minutes of use” means five charged minutes after inspection, buyback is only 0.001 SUI, entirely pending.

The five-minute story therefore demonstrates both an immediate and a pending refund. A return three minutes after purchase has one charged minute, a 0.0198 SUI fee, 0.0502 SUI paid now, and 0.03 SUI pending. The same refund formula applies to every normal return.

Refund figures describe protocol payouts before gas. Gas is a separate SUI cost paid by the transaction signer and is not included in the purchase escrow or reimbursed by a full purchase refund. John pays gas for station settlement; Bob pays gas if he uses CLAIM REFUND.

The supplier earns usage revenue, not the entire 0.10 SUI purchase payment. Her original collateral is separate from each customer's purchase escrow. The pending hold has one recorded owner at a time: initially the supplier, then a returning customer after each normal return.

## 6. Who does what

| Component | Responsibility |
| --- | --- |
| Dapp CLIENT tab | Supply, printable QR, purchase, wallet signing, active purchases, balances and pending refunds. |
| Dapp STATION tab | Register/select station, show inventory, scan deposits and returns, discover due payments, request John’s wallet signature for SETTLE PAYMENTS. |
| Wallets | Alice signs supply; Bob and Carl sign their purchases; John signs station registration as admin and physical attestations as station operator. Each signer needs SUI for gas. |
| Move contract | Authoritative station permissions, umbrella custody, inspection boundaries, escrow, refunds, fees, condition holds and payouts. |

**Signing:** all transactions are signed in a phone wallet. John signs registration and due payment settlement as admin, and physical attestations as station operator. Alice, Bob and Carl sign their own payments and claims. Settlement does not change the selected station or pay John just because he submitted it.

### SETTLE PAYMENTS

After verifying admin access, the station tab queries the registry and reads **all registered umbrellas**, including those currently held away from a station. It derives due work from chain timestamps, not browser-local saved timers:

1. Select only `HELD` umbrellas whose buyback is zero. They are already effectively sold and cannot return.
2. Release any still-pending prior condition hold to its recorded owner, distribute the current purchase escrow, and record `SOLD` atomically.
3. Skip positive-buyback purchases, even when inspection has expired, and skip other states. Never release a DOCKED umbrella's hold without a successor purchase. The button does not start timers or set HELD.


Show a preview with affected umbrella IDs, actions and recipients. John confirms and signs. Use bounded transactions or small batches rather than one unbounded transaction over the whole registry. Re-read before each submission, validate the expected ownership cycle onchain, and show per-item success, already-settled, failure or retry status. A failed batch rolls back its operations; refetch and retry only still-eligible items. Disable duplicate submissions. Payment recipients come from the contract, not the current station selection.

This button simulates automation; it does not run in the background. If nobody presses it, the price still decays correctly, but payouts wait for a settlement/claim/return transaction. Both tabs read chain data directly. Deploy the dapp over HTTPS for camera access; no application server or server key is needed.

### Zero-buyback final settlement

The buyer already paid the full purchase price at checkout; settlement charges them nothing more and requires no buyer signature. At zero buyback, the umbrella cannot be returned, even while its stored state is HELD awaiting cleanup. `admin_settle_pending_payments` releases any still-pending prior condition hold, distributes the active escrow, records the final buyer, and marks `SOLD`.

SOLD means **permanently invalid**. Retain the shared object, registry ID, owners and latest condition result for read-only display; do not delete it. All umbrella-mutating functions reject a SOLD record, including activation, checkout, returns and claims. Periodic settlement skips SOLD records without modifying them. Both escrow balances are zero. The old QR opens an “Invalid — purchase finalized” page with no actions. Keep the object discoverable for finalized purchases and the prior owner’s latest refund result, but exclude it from station inventories and further settlement work.

For a sale without return, distribute **70% to the original supplier and 30% to the recorded checkout station**. There is no return-station payout. Floor the supplier share and allocate the remainder to the checkout station so all MIST is distributed. The station that presses SETTLE PAYMENTS gains no additional payout.

Return eligibility is checked using Sui Clock at execution: require inspection ended **and buyback > 0**. A scan or signature before the cutoff does not reserve a return. If it executes at or after zero buyback, the return aborts and John does not put the umbrella back in the normal bin. Sale settlement requires buyback = 0; a successful positive-buyback return changes state to DOCKED and makes sale settlement ineligible. There is no zero-value-return path.

## 7. Onchain model and transaction map

### Records the UI needs

**SUI-only settlement:** use `Coin<SUI>` for incoming purchase and collateral payments and `Balance<SUI>` for escrow. The contract accepts native SUI (`0x2::sui::SUI`) only. Use SUI-specific contract types so the chain enforces the same payment asset as the UI. Construct exact SUI payments while retaining enough SUI for gas; never treat the full wallet balance as available to escrow.

### Umbrella fields

Keep the original supplier plus the last and current owners. “Owner” here means the protocol participant recorded on the shared umbrella, not ownership of the Sui object itself. The supplier address stays permanent because it receives revenue even after many customers have used the umbrella.

| Field | Meaning |
| --- | --- |
| `id` | Permanent umbrella object ID used in the QR URL. |
| `supplier` | Original supplier and supplier-revenue recipient; never rotated. |
| `last_owner` | Owner of the most recent condition record: the supplier for a new umbrella, then the most recently returned customer. |
| `current_owner: Option<address>` | Buyer currently holding the umbrella; none before checkout and after physical return or rejection. Retain the final buyer in SOLD. |
| `state` | CREATED, DOCKED, HELD, QUARANTINED or SOLD. Inspection is a time window within HELD, not a separate custody state. SOLD is permanently invalid and read-only. |
| `current_station_id: Option<ID>` | Physical station while deposited, including quarantine; clear at checkout and keep none during HELD or SOLD. |
| `checkout_station_id`, `checkout_payout_address` | Optional until first checkout; then station of the active/most recent purchase and its recorded payout recipient. |
| `owner_count` | Increment on each successful checkout; validate expected cycle in claims, station returns and settlement. |
| `checkout_time_ms`, `inspection_deadline_ms` | Initialize to zero before first checkout; then authoritative purchase time and purchase time plus 120,000 ms. Time-based actions require an active purchase state. |
| `purchase_price`, `fee_per_ms`, `condition_bond` | SUI accounting parameters in integer MIST. |
| `active_escrow: Balance<SUI>` | Current buyer's purchase payment awaiting return or sale settlement. |
| `pending_condition: Balance<SUI>` | Condition funds payable to `last_owner` if the successor inspection succeeds. |
| `last_condition_amount` | Original amount of the latest condition record; retain after payment or forfeiture so the UI can display it. |
| `last_condition_status` | PENDING, PAID or FORFEITED. Supply and accepted normal returns create positive condition records. |
| `last_condition_cycle` | Purchase that created this record; zero identifies the supplier's original collateral. |

`last_owner` is the owner of the latest condition record. `current_owner` is the buyer currently holding the umbrella, if any. Two addresses identify the participants, but the amount and outcome must also survive balance clearing; a zero balance alone cannot distinguish payment from forfeiture.

### Owner and refund-record transitions

| Action | Owner fields and latest condition record |
| --- | --- |
| Supply | `supplier = last_owner = Alice`; no current owner. Store supplier collateral as PENDING, cycle 0. |
| Activate | Keep owner and condition fields unchanged; record station. |
| Bob checks out | Set `current_owner = Bob` and state HELD immediately; record purchase time and inspection deadline; increment owner count. Keep Alice as last owner and keep her collateral record. |
| Inspection deadline passes | No onchain mutation. State remains HELD; prior condition hold becomes claimable and usage begins accruing from the deadline. |
| Prior owner claims | Pay pending balance to `last_owner`; set PAID and clear the balance. Retain last owner, amount and cycle. Current owner and HELD state are unchanged. |
| Bob returns normally | First pay the prior hold if still pending, after validating inspection ended and positive buyback. Then set `last_owner = Bob`, clear current owner, and replace the condition record with Bob's retained amount and ownership cycle. Mark PENDING; the positive-buyback return rule and positive condition bond guarantee a positive hold. |
| Carl checks out | Set current owner to Carl and state HELD; record his purchase time and deadline; increment owner count. Keep Bob as last owner with his pending record. |
| Carl rejects | Refund active escrow to Carl; send Bob's pending balance to reserve; set Bob's condition status FORFEITED and retain its amount/cycle. Clear current owner and record quarantine station. |
| Carl inspection ends without rejection | Bob becomes eligible to claim; no immediate transfer or state mutation. Carl remains current owner in HELD. |
| Sale settlement | Pay the prior condition hold first if still pending. Keep its latest condition record, retain current owner as the final buyer, clear active escrow and set SOLD, permanently invalid and read-only. |

This is **latest-result storage, not a complete refund history**. Bob's outcome survives refresh and reconnect while Bob remains `last_owner`. When Carl later returns normally, Carl replaces Bob and the old result is no longer shown. The MVP does not retrieve older cycles from events or keep a history database. If the same wallet purchases again, cycle numbers distinguish the earlier condition record from its current purchase.

### Station fields

| Field | Meaning |
| --- | --- |
| `id` | Station object's permanent Sui object ID. |
| `station_id` | Unique protocol station ID used by capabilities and umbrella custody records. |
| `display_name` | Short name shown in station selectors and inventory views. |
| `location_name` | Human-readable place or street-address label shown to users. |
| `latitude_e6` | Latitude encoded as `(latitude + 90) * 1,000,000`; require `0..=180,000,000`. |
| `longitude_e6` | Longitude encoded as `(longitude + 180) * 1,000,000`; require `0..=360,000,000`. |
| `payout_address` | Recipient for this station's checkout and return revenue shares. |

The coordinate offset keeps signed geographic coordinates in Move's unsigned integer types while preserving six decimal places. The dapp converts ordinary latitude/longitude values at the transaction boundary and decodes them for display. Station creation validates both ranges. Store the station's authorization separately in its `StationCap`. A public registry lists stations and umbrella IDs. Do not derive authority from whichever station the UI selects.

**Discovery:** read registered umbrella objects directly and filter by `current_owner`, `last_owner`, `supplier`, state and station. Active purchases require current owner plus HELD; finalized purchases require current owner plus SOLD. Pending refunds require last owner, PENDING status and positive pending balance. Latest outcomes require last owner and PAID/FORFEITED status. Bin inventory requires both the appropriate state and physical station ID. These lists survive page refresh without events, an indexer or a database.

**Protocol configuration:** store the maintenance reserve destination onchain. Keep station payout addresses in public station records and snapshot the checkout payout address on the umbrella at checkout. Read the return payout from the authorized receiving station. Use one configured registry and reserve destination for the demo. Bind StationCaps to that registry and validate the capability against the supplied station record; do not trust a UI-provided station ID or payout address.

### Actions and authorization

Station registration and planned payment settlement require an AdminCap bound to this deployment. Physical attestations require only the matching StationCap. Add a separate client-only `user_claim_refund` wrapper: verify state is HELD, sender equals last_owner, condition status is PENDING with positive balance, expected current owner_count matches, and inspection has expired; then run the same private condition-payout helper. Do not leave an unrestricted public settlement helper that bypasses these checks. The claim wrapper releases only that owner’s condition hold; it cannot finalize sales or attest custody.

| User action | Function | Signer / permission | Result |
| --- | --- | --- | --- |
| Register new station | `admin_create_station` | John with `AdminCap` | Public station record with unique ID, display name, location name, fixed-point coordinates and payout address; `StationCap` issued to John. |
| Set current station | None | Admin-only UI; no transaction | Change local selection only. |
| Supply umbrella | `user_create_umbrella` | Alice; anyone can supply | Exact supplier bond escrowed; shared umbrella in `CREATED`; ID added to discovery. |
| Scan newly supplied umbrella | `station_dock_umbrella` | Operator with matching `StationCap` | Record selected station; `CREATED → DOCKED`. |
| Confirm purchase | `user_undock_umbrella` | Bob, exact purchase payment | Store holder/station/deadline; `DOCKED → HELD`. |
| **CLAIM REFUND** (CLIENT only) | `user_claim_refund` | HELD; sender is last_owner; positive PENDING hold; inspection deadline reached; expected current owner_count matches; no admin capability needed | Pay the hold once and record PAID; custody remains HELD. Still allowed at zero buyback until sale cleanup pays it. |
| **SETTLE PAYMENTS**, zero buyback | `admin_settle_pending_payments` | John with `AdminCap`; no physical attestation | Pay any pending prior hold, distribute current escrow, record final buyer; `→ SOLD`. |
| Scan normal return | `station_dock_umbrella` | Operator with receiving `StationCap` | Require ended inspection and strictly positive buyback; pay any pending prior hold, refund/split/hold, record station; `→ DOCKED`. |
| Scan fault return | `station_quarantine_umbrella` | Operator with receiving `StationCap`, before deadline | Full current refund, prior hold to reserve, record station; `HELD → QUARANTINED`. |

`station_dock_umbrella` handles both first deposit and normal return. It takes the receiving `StationCap` and `Station`, the umbrella, the expected current owner count, `Clock`, and transaction context. The station capability must reference the supplied station object. First deposits preserve the supplier collateral and its cycle-zero condition record. Customer returns settle payments before docking and replace the condition record with the returning customer's hold. Both paths reject a stale owner count; already docked, quarantined and sold umbrellas cannot be docked again.

| Print, scan, view or deny | None | No economic transaction | Navigation or local UI only until a confirmed signed action. |

At the exact inspection deadline, fault return is closed and normal return and prior-owner claims are allowed; normal return additionally requires positive buyback. At the exact zero-buyback cutoff, normal return is closed even before sale settlement. A chain transaction is required to release money or change stored state; time passing alone does neither. The state is HELD from purchase onward; inspection, charged usage, and effective sale before cleanup are all derived from time and buyback.

Implement integer accounting with overflow-safe fee capping. For normal returns, floor the supplier and checkout-station shares, then give the remaining usage revenue to the return station so all base units are accounted for. If checkout and return are at the same station, that station receives both shares. Zero-buyback umbrellas cannot return and create no new condition record; sale settlement preserves the prior owner’s settled result.

## 8. Screen and transaction behavior

All economic actions follow the same visible progression: **review → wallet approval → transaction pending → confirmed success or error**. Disable duplicate submissions while pending. A denied wallet prompt must not create a QR result, inventory entry, purchase, or refund.

If a submitted transaction's result is temporarily unknown, retain its digest and check it before offering a new submission. After confirmed success, refetch affected records and balances on both views. Periodically refresh to see changes made by the other phone; do not rely solely on this phone's transaction callbacks.

QR readers accept the dapp's umbrella URL format and validate the object against the expected package and payment type. Invalid tags show a clear error. Offer camera retry and a paste-URL fallback for demo reliability. Neither scanner should navigate blindly to arbitrary QR contents.

Pending refunds show “Supplier collateral awaiting first inspection” when `last_condition_cycle` is zero, otherwise “Return hold awaiting next inspection.” After settlement, remove the amount from pending totals and show PAID as **Refund paid**, or FORFEITED as **Return quarantined — pending refund not paid**. Read these results from the umbrella's latest condition record, retaining its amount after the balance is cleared. Show this section as **Latest refund results**, not a complete history. A later normal return replaces that record as specified in section 7. When replacing a record, display only the new owner’s result; do not attribute the previous owner’s payout to them.

Before signing a station return, claim or settlement, re-read the umbrella and pass the expected ownership cycle for onchain validation. A delayed request must not apply to a newer customer. Validate against current `owner_count`, not `last_condition_cycle`, which identifies the earlier purchase that created the hold. Price estimates use the current time; final refund amounts use the transaction execution timestamp.


## 9. Demo script

### Prepare the two phones

Use only SUI on Sui Testnet for payments, collateral, refunds and gas. Fund John's admin/operator wallet and Alice's, Bob's and Carl's wallets with testnet SUI. John is both the admin and the station operator for this demo. On the station phone, connect John and select **STATION**. On the client phone, start with Alice and select **CLIENT**; switch to Bob for the purchase story and Carl for the successor story. Reconnect Bob afterward to show his latest refund results. Both phones use the same deployment, package, payment coin type and registry.

Before registration, publish the package using John's wallet so he receives `AdminCap`. Initialize the demo registry and maintenance reserve configuration, and give both phones their object IDs. Set the maintenance reserve recipient during deployment; there is no reserve-spending interface.

### John, the demo admin and station operator, creates Yoyogi

1. **REGISTER NEW STATION → yoyogi → CONFIRM**.
2. John signs as admin and shows the successful station-ID modal.
3. John switches to his station-operator role: **SET CURRENT STATION → yoyogi → CONFIRM**.
4. Show its empty normal and quarantine inventories.

### Alice supplies an umbrella

1. **CLIENT → SUPPLY UMBRELLA → CONFIRM**; sign and pay collateral.
2. Show the printable QR, then print and attach it.
3. John presses **SCAN RETURNED OR SUPPLIED UMBRELLA**, scans, and signs activation.
4. Put the umbrella in the normal bin and show it becoming available.

### Bob purchases it

1. Switch the client phone to Bob's wallet.
2. Scan the printed tag with the default phone camera.
3. Open the purchase confirmation page, review the two-minute disclaimer, and **CONFIRM**.
4. Sign, show the inspection countdown, and let Bob take the umbrella.

### Demonstrate both outcomes

Use two supplied umbrellas or run the normal-return story first; a quarantined umbrella cannot be bought again in this MVP.

- **Fault branch:** Bob hands it back immediately; John uses **SCAN QUARANTINED UMBRELLA**, signs and confirms execution before the deadline, then puts it in the quarantine bin. Show Bob's full refund and the prior hold's forfeiture.
- **Normal branch:** Bob returns five minutes after purchase. John scans with **SCAN RETURNED OR SUPPLIED UMBRELLA** and signs. Put it in the normal bin and show Bob's pending refund.
- **Carl purchases:** switch the client phone to Carl. Scan Bob's returned umbrella with the default camera and confirm purchase.
- **Carl rejects:** John fault-scans, signs, and confirms execution before Carl's deadline. Show Carl's full refund and reconnect Bob to show **Return quarantined**.
- **Carl does not reject:** on a separate run, let Carl's inspection expire. Reconnect Bob, show **Ready to claim**, press **CLAIM REFUND**, and sign to show **Refund paid**. Verify Carl remains HELD and his timer is unaffected. SETTLE PAYMENTS must skip Carl while buyback is positive.

Use separate prepared umbrellas or reset the story with new supply to show both Carl branches; quarantine has no recovery action. For a never-returned umbrella, wait until buyback reaches zero, first show that a return is refused before settlement, then press SETTLE PAYMENTS and show final escrow distribution and the retained SOLD / Invalid record without another buyer payment. Rescan the old QR to verify it offers no actions.

## 10. Build order and completion checks

Build one complete journey at a time. The only MVP custody states are `CREATED`, `DOCKED`, `HELD`, `QUARANTINED`, and `SOLD`. Inspection is a timed phase of HELD, not a stored state.

1. **Station identity and supply:** use SUI payment types and MIST constants; implement registry, named station registration, capability delivery, supplier bond, umbrella creation, printable/reopenable QR, station selection, and activation. Verify supply cannot be purchased before activation.
2. **Purchase and inspection:** implement coin selection, exact payments, common QR confirmation route, custody update, 120-second deadline, both UI countdowns and prior-owner refund claims. Verify rejection before the deadline and refusal at or after it.
3. **Two-bin returns and payments:** implement normal-return dispatch, quarantine scan, SETTLE PAYMENTS, zero-buyback sale settlement, authoritative refund math, station payout lookup and maintenance reserve. Verify wrong capabilities, duplicate scans, early normal returns, and late fault returns cannot settle funds. Verify last/current-owner rotation, retained PAID/FORFEITED results, and replacement on the next normal return.
4. **Shared views:** implement registry reads, active purchases, supplied umbrellas, both station inventories, balances and pending refunds. Verify updates arrive on the other phone and survive page refresh.
5. **Rehearse:** execute the stories with funded wallets, printed tags and both phones. Confirm the same QR works from a default camera and the dapp scanner without a second scan.

Contract tests must reject non-admin calls to station creation; allow docking and quarantine with only the matching StationCap; reject claims by anyone other than the pending owner; and cover the exact deadline, HELD immediately on purchase, inspection expiry without a transaction, return without an earlier refund claim, first supplier-bond settlement, successor hold release/forfeiture, return one millisecond before and exactly at the zero-buyback cutoff, refusal of zero-buyback return before settlement, receiving-station recording, station-settlement/claim races, payout to the pending owner regardless of caller, sale settlement without return, sale with an unpaid prior hold, skipping positive-buyback purchases during station cleanup, settlement/return races, repeated settlement, rejection of all mutations of SOLD objects, retained owners and latest results after invalidation, and conservation of all escrow balances. Frontend checks should cover signature denial, failed/unknown transactions, scanner cancellation and repeated scans, stale inventory, eligible/ineligible claim actions, paid/quarantined latest refund results after reconnecting Bob, settlement batch failure and refresh recovery.

Outside the MVP: hardware automation, repair/reactivation, supplier cancellation or asset withdrawal, application server/background worker, database/indexer, and disputes. These have no buttons, transactions or state transitions in this plan. John serves as both admin and station operator for demo purposes; in his operator role he is the trusted physical attestor.

### Fault-return implementation

`station_quarantine_umbrella` requires the receiving station’s matching `StationCap` and `Station`, the umbrella, expected owner count, `Clock`, and transaction context. It only accepts HELD umbrellas strictly before the inspection deadline. It refunds the active escrow to the holder, sends the pending condition hold to the maintenance reserve, retains the prior condition owner/amount/cycle with FORFEITED status, clears the holder, and records the receiving station with QUARANTINED state. Duplicate returns and stale owner counts abort.

The maintenance reserve address is stored in `Station` and initialized to the station creator. Quarantine requires only the matching StationCap, with no AdminCap. This changes the station layout and requires a fresh package deployment rather than a compatible upgrade of an existing deployment.
