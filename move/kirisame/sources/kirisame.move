
module kirisame::umbrella {
    use sui::balance::Balance;
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::coin::Coin;
    use std::string::String;
    
    public struct AdminCap has key, store {
        id: UID,
        payout_address: address,
    }

    public struct StationCap has key, store {
        id: UID,
        station: ID,
    }

    public enum UmbrellaState has copy, drop, store {
        Created,
        Docked,
        Held,
        Quarantined,
        Sold,
        Retired,
    }

    public enum ConditionStatus has copy, drop, store {
        Pending,
        Paid,
        Forfeited,
        AwaitingReview,
        RefundApproved,
    }

    public struct Umbrella has key {
        id: UID,
        supplier: address,
        /// Client color mapping: 0 = vinyl, 1 = black, 2 = white.
        color: u8,
        state: UmbrellaState,
        current_station_id: Option<ID>,
        checkout_station_id: Option<ID>,
        holder: Option<address>,

        checkout_time_ms: u64,
        inspection_deadline_ms: u64,

        purchase_price: u64,
        fee_per_ms: u64,
        condition_bond: u64,

        active_escrow: Balance<SUI>,
        pending_condition: Balance<SUI>,
        pending_condition_owner: Option<address>,

        last_condition_amount: u64,
        last_condition_cycle: u64,
        last_condition_status: ConditionStatus,

        checkout_payout_address: Option<address>,
        admin_payout_address: Option<address>,
        owner_count: u64,
    }

    public enum StationStatus has copy, drop, store {
        Active,
        Removing,
        Removed,
    }

    public struct Station has key, store {
        id: UID,
        display_name: String,
        location_name: String,
        latitude_e6: u64,
        longitude_e6: u64,
        payout_address: address,
        // Fixed at station creation; operators cannot redirect forfeited holds.
        maintenance_reserve: address,
        admin_payout_address: address,
        status: StationStatus,
        docked_count: u64,
    }

    const MAX_LATITUDE_E6: u64 = 180_000_000;
    const MAX_LONGITUDE_E6: u64 = 360_000_000;

    const EInvalidLatitude: u64 = 0;
    const EInvalidLongitude: u64 = 1;
    const EInvalidConditionBond: u64 = 2;
    const EWrongStation: u64 = 3;
    const EInvalidState: u64 = 4;
    const EStaleOwnerCount: u64 = 5;
    const EInspectionOpen: u64 = 6;
    const ENoBuyback: u64 = 7;
    const EInvalidPayment: u64 = 8;
    const EInspectionClosed: u64 = 9;
    const EReviewAlreadyFinalized: u64 = 10;
    const EUnsettledCondition: u64 = 11;
    const EStationInactive: u64 = 12;
    const EStationNotRemoving: u64 = 13;
    const EInvalidColor: u64 = 14;

    /// Demo amounts in MIST (1 SUI = 1_000_000_000 MIST).
    const ADMIN_PERCENT: u64 = 10;
    const PURCHASE_PRICE: u64 = 100_000_000;
    const CONDITION_BOND: u64 = 30_000_000;
    const FEE_PER_MS: u64 = 330;
    const INSPECTION_WINDOW_MS: u64 = 120_000;

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap {id: object::new(ctx), payout_address: ctx.sender()},
            ctx.sender(),
        );
    }

    /// Create a new station
    public fun admin_create_station(
        admin: &AdminCap,
        display_name: String,
        location_name: String,
        latitude_e6: u64,
        longitude_e6: u64,
        payout_address: address,
        ctx: &mut TxContext,
    ) {
        assert!(latitude_e6 <= MAX_LATITUDE_E6, EInvalidLatitude);
        assert!(longitude_e6 <= MAX_LONGITUDE_E6, EInvalidLongitude);

        let station = Station {
            id: object::new(ctx),
            display_name,
            location_name,
            latitude_e6,
            longitude_e6,
            payout_address,
            maintenance_reserve: ctx.sender(),
            admin_payout_address: admin.payout_address,
            status: StationStatus::Active,
            docked_count: 0,
        };
        let station_id = object::id(&station);
        transfer::share_object(station);
        transfer::transfer(
            StationCap {
                id: object::new(ctx),
                station: station_id,
            },
            ctx.sender(),
        );
    }

    /// Disable station operations immediately. Removal completes only after all
    /// docked umbrellas have been retired with admin_retire_station_umbrella.
    /// Repeated calls are harmless; the station record remains for past payouts
    /// and quarantine reviews. No StationCap is needed or trusted for removal.
    public fun admin_remove_station(_admin: &AdminCap, station: &mut Station) {
        station.status = if (station.docked_count == 0) {
            StationStatus::Removed
        } else {
            StationStatus::Removing
        };
    }

    /// Mandatory removal step, composable in bounded PTBs. The tracked count
    /// prevents omission from completing removal. Refund rather than confiscate
    /// the docked item's pending hold, preserving the recorded condition history.
    public fun admin_retire_station_umbrella(
        _admin: &AdminCap,
        station: &mut Station,
        umbrella: &mut Umbrella,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Removing, EStationNotRemoving);
        assert!(umbrella.state == UmbrellaState::Docked, EInvalidState);
        assert!(umbrella.current_station_id == option::some(object::id(station)), EWrongStation);
        assert!(umbrella.active_escrow.value() == 0, EUnsettledCondition);
        pay_pending_condition(umbrella, ctx);
        assert!(umbrella.pending_condition.value() == 0, EUnsettledCondition);
        umbrella.current_station_id = option::none();
        umbrella.state = UmbrellaState::Retired;
        station.docked_count = station.docked_count - 1;
        if (station.docked_count == 0) station.status = StationStatus::Removed;
    }

    public fun station_is_removing(station: &Station): bool {
        station.status == StationStatus::Removing
    }

    public fun station_is_removed(station: &Station): bool {
        station.status == StationStatus::Removed
    }

    public fun station_docked_count(station: &Station): u64 { station.docked_count }

    /// Posts the supplier's condition bond and creates an umbrella awaiting deposit.
    /// Color: 0 = vinyl, 1 = black, 2 = white.
    public fun user_create_umbrella(bond: Coin<SUI>, color: u8, ctx: &mut TxContext) {
        assert!(color <= 2, EInvalidColor);
        assert!(bond.value() == CONDITION_BOND, EInvalidConditionBond);

        let supplier = ctx.sender();
        transfer::share_object(Umbrella {
            id: object::new(ctx),
            supplier,
            color,
            state: UmbrellaState::Created,
            current_station_id: option::none(),
            checkout_station_id: option::none(),
            holder: option::none(),
            checkout_time_ms: 0,
            inspection_deadline_ms: 0,
            purchase_price: PURCHASE_PRICE,
            fee_per_ms: FEE_PER_MS,
            condition_bond: CONDITION_BOND,
            active_escrow: sui::balance::zero(),
            pending_condition: bond.into_balance(),
            pending_condition_owner: option::some(supplier),
            last_condition_amount: CONDITION_BOND,
            last_condition_cycle: 0,
            last_condition_status: ConditionStatus::Pending,
            checkout_payout_address: option::none(),
            admin_payout_address: option::none(),
            owner_count: 0,
        });
    }

    public fun color(umbrella: &Umbrella): u8 { umbrella.color }

    /// Station attests physical receipt of a new umbrella or an eligible return.
    public fun station_dock_umbrella(
        cap: &StationCap,
        station: &mut Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        assert!(cap.station == object::id(station), EWrongStation);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        match (umbrella.state) {
            UmbrellaState::Created => {
                // First deposit keeps the supplier's condition bond intact.
            },
            UmbrellaState::Held => {
                let now = clock.timestamp_ms();
                assert!(now >= umbrella.inspection_deadline_ms, EInspectionOpen);
                let usage = usage_fee(umbrella, now);
                let buyback = umbrella.purchase_price - usage;
                assert!(buyback > 0, ENoBuyback);

                pay_pending_condition(umbrella, ctx);
                // Quotient/remainder arithmetic floors shares without overflowing.
                let proceeds = pay_admin_share(umbrella, usage, ctx);
                let supplier_share = share(proceeds, 70);
                let checkout_share = share(proceeds, 15);
                pay(&mut umbrella.active_escrow, supplier_share, umbrella.supplier, ctx);
                pay(
                    &mut umbrella.active_escrow,
                    checkout_share,
                    *umbrella.checkout_payout_address.borrow(),
                    ctx,
                );
                pay(
                    &mut umbrella.active_escrow,
                    proceeds - supplier_share - checkout_share,
                    station.payout_address,
                    ctx,
                );

                let owner = *umbrella.holder.borrow();
                let hold = buyback.min(umbrella.condition_bond);
                pay(&mut umbrella.active_escrow, buyback - hold, owner, ctx);
                umbrella.pending_condition.join(umbrella.active_escrow.split(hold));
                umbrella.pending_condition_owner = option::some(owner);
                umbrella.last_condition_amount = hold;
                umbrella.last_condition_cycle = umbrella.owner_count;
                umbrella.last_condition_status = ConditionStatus::Pending;
                umbrella.holder = option::none();
            },
            UmbrellaState::Docked => abort EInvalidState,
            UmbrellaState::Quarantined => abort EInvalidState,
            UmbrellaState::Sold => abort EInvalidState,
            UmbrellaState::Retired => abort EInvalidState,
        };

        umbrella.current_station_id = option::some(object::id(station));
        umbrella.state = UmbrellaState::Docked;
        station.docked_count = station.docked_count + 1;
    }

    /// Buyer purchases a docked umbrella and begins its inspection window.
    public fun user_undock_umbrella(
        station: &mut Station,
        umbrella: &mut Umbrella,
        payment: Coin<SUI>,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        match (umbrella.state) {
            UmbrellaState::Docked => {
                assert!(umbrella.current_station_id == option::some(object::id(station)), EWrongStation);
                assert!(payment.value() == umbrella.purchase_price, EInvalidPayment);

                // The prior condition hold remains pending through this inspection.
                umbrella.active_escrow.join(payment.into_balance());
                umbrella.holder = option::some(ctx.sender());
                umbrella.checkout_station_id = option::some(object::id(station));
                umbrella.checkout_payout_address = option::some(station.payout_address);
                umbrella.admin_payout_address = option::some(station.admin_payout_address);
                umbrella.checkout_time_ms = clock.timestamp_ms();
                umbrella.inspection_deadline_ms = umbrella.checkout_time_ms + INSPECTION_WINDOW_MS;
                umbrella.owner_count = umbrella.owner_count + 1;
            },
            UmbrellaState::Created => abort EInvalidState,
            UmbrellaState::Held => abort EInvalidState,
            UmbrellaState::Quarantined => abort EInvalidState,
            UmbrellaState::Sold => abort EInvalidState,
            UmbrellaState::Retired => abort EInvalidState,
        };

        umbrella.current_station_id = option::none();
        umbrella.state = UmbrellaState::Held;
        station.docked_count = station.docked_count - 1;
    }

    /// Station attests an inspection-window rejection, including wear or
    /// undesirability. Refunds the buyer in full and freezes the prior hold for
    /// the admin's final circulation-suitability review during collection.
    public fun station_quarantine_umbrella(
        cap: &StationCap,
        station: &Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        assert!(cap.station == object::id(station), EWrongStation);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        assert!(umbrella.state == UmbrellaState::Held, EInvalidState);
        assert!(clock.timestamp_ms() < umbrella.inspection_deadline_ms, EInspectionClosed);

        let refund = umbrella.active_escrow.value();
        pay(&mut umbrella.active_escrow, refund, *umbrella.holder.borrow(), ctx);
        umbrella.last_condition_status = ConditionStatus::AwaitingReview;
        umbrella.holder = option::none();
        umbrella.current_station_id = option::some(object::id(station));
        umbrella.state = UmbrellaState::Quarantined;
    }

    /// Final review by the admin collecting quarantined umbrellas from any station.
    /// Approving the refund queues the prior hold for the existing sweep.
    /// Otherwise, unsuitability for circulation forfeits it to the fixed reserve.
    /// Neither outcome reactivates the umbrella or determines who caused its condition.
    public fun admin_review_quarantined_umbrella(
        _admin: &AdminCap,
        station: &Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        approve_refund: bool,
        ctx: &mut TxContext,
    ) {
        assert!(umbrella.current_station_id == option::some(object::id(station)), EWrongStation);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        assert!(umbrella.state == UmbrellaState::Quarantined, EInvalidState);
        assert!(umbrella.last_condition_status == ConditionStatus::AwaitingReview, EReviewAlreadyFinalized);

        if (approve_refund) {
            umbrella.last_condition_status = ConditionStatus::RefundApproved;
        } else {
            let hold = umbrella.pending_condition.value();
            pay(&mut umbrella.pending_condition, hold, station.maintenance_reserve, ctx);
            umbrella.last_condition_status = ConditionStatus::Forfeited;
        };
    }

    /// Permanently retire a collected quarantine record after its money is settled.
    /// Preserves identity, supplier and condition history; clears station inventory.
    public fun admin_retire_umbrella(
        _admin: &AdminCap,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
    ) {
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        assert!(umbrella.state == UmbrellaState::Quarantined, EInvalidState);
        assert!(
            (umbrella.last_condition_status == ConditionStatus::Paid ||
                umbrella.last_condition_status == ConditionStatus::Forfeited) &&
                umbrella.pending_condition.value() == 0 &&
                umbrella.active_escrow.value() == 0,
            EUnsettledCondition,
        );
        umbrella.current_station_id = option::none();
        umbrella.state = UmbrellaState::Retired;
    }

    /// Periodic sweep primitive: call once per discovered shared umbrella (or
    /// compose bounded PTBs). Sui cannot enumerate shared objects inside Move.
    /// Releases the prior condition hold once inspection ends, without changing
    /// the current purchase or its timer. Also finalizes zero-buyback purchases.
    /// Also pays admin-approved quarantined holds; unresolved reviews stay frozen.
    /// Skips other states and open inspections; repeated calls cannot pay twice.
    /// Sold records retain the final buyer and prior condition result.
    public fun admin_settle_pending_payments(
        _admin: &AdminCap,
        umbrella: &mut Umbrella,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        if (umbrella.state == UmbrellaState::Quarantined) {
            if (umbrella.last_condition_status == ConditionStatus::RefundApproved) {
                pay_pending_condition(umbrella, ctx);
            };
            return
        };
        if (umbrella.state != UmbrellaState::Held) return;
        if (clock.timestamp_ms() < umbrella.inspection_deadline_ms) return;
        pay_pending_condition(umbrella, ctx);
        if (usage_fee(umbrella, clock.timestamp_ms()) < umbrella.purchase_price) return;

        let amount = umbrella.active_escrow.value();
        let proceeds = pay_admin_share(umbrella, amount, ctx);
        let supplier_share = share(proceeds, 70);
        pay(&mut umbrella.active_escrow, supplier_share, umbrella.supplier, ctx);
        pay(
            &mut umbrella.active_escrow,
            proceeds - supplier_share,
            *umbrella.checkout_payout_address.borrow(),
            ctx,
        );
        umbrella.state = UmbrellaState::Sold;
    }

    // Cap before multiplying, including timestamps near u64::MAX.
    fun usage_fee(umbrella: &Umbrella, now: u64): u64 {
        if (now <= umbrella.inspection_deadline_ms || umbrella.fee_per_ms == 0) return 0;
        let elapsed = now - umbrella.inspection_deadline_ms;
        if (elapsed > umbrella.purchase_price / umbrella.fee_per_ms) {
            umbrella.purchase_price
        } else {
            elapsed * umbrella.fee_per_ms
        }
    }

    #[test_only]
    public(package) fun sale_snapshot_for_testing(umbrella: &Umbrella): (bool, bool, u64, u64) {
        (
            umbrella.state == UmbrellaState::Sold,
            umbrella.last_condition_status == ConditionStatus::Paid,
            umbrella.last_condition_amount,
            umbrella.last_condition_cycle,
        )
    }

    #[test_only]
    public(package) fun quarantine_snapshot_for_testing(umbrella: &Umbrella): (bool, bool) {
        (
            umbrella.state == UmbrellaState::Quarantined,
            umbrella.last_condition_status == ConditionStatus::Forfeited,
        )
    }

    #[test_only]
    public(package) fun retired_for_testing(umbrella: &Umbrella): bool {
        umbrella.state == UmbrellaState::Retired
    }

    #[test_only]
    public(package) fun condition_status_for_testing(umbrella: &Umbrella): u8 {
        match (umbrella.last_condition_status) {
            ConditionStatus::Pending => 0,
            ConditionStatus::Paid => 1,
            ConditionStatus::Forfeited => 2,
            ConditionStatus::AwaitingReview => 3,
            ConditionStatus::RefundApproved => 4,
        }
    }

    /// Take 10% of earned revenue only. Refunds, condition funds and reserve
    /// forfeitures are excluded. Floor in MIST; the station receives split dust.
    fun pay_admin_share(umbrella: &mut Umbrella, revenue: u64, ctx: &mut TxContext): u64 {
        let amount = share(revenue, ADMIN_PERCENT);
        if (amount > 0) {
            pay(&mut umbrella.active_escrow, amount, *umbrella.admin_payout_address.borrow(), ctx);
        };
        revenue - amount
    }

    fun share(amount: u64, percent: u64): u64 {
        (amount / 100) * percent + (amount % 100) * percent / 100
    }

    fun pay(balance: &mut Balance<SUI>, amount: u64, recipient: address, ctx: &mut TxContext) {
        if (amount > 0) {
            transfer::public_transfer(balance.split(amount).into_coin(ctx), recipient);
        };
    }

    fun pay_pending_condition(umbrella: &mut Umbrella, ctx: &mut TxContext) {
        if (umbrella.last_condition_status == ConditionStatus::Pending ||
            umbrella.last_condition_status == ConditionStatus::RefundApproved) {
            let amount = umbrella.pending_condition.value();
            pay(
                &mut umbrella.pending_condition,
                amount,
                *umbrella.pending_condition_owner.borrow(),
                ctx,
            );
            umbrella.last_condition_status = ConditionStatus::Paid;
        };
    }

    #[test_only]
    public(package) fun station_for_testing(payout_address: address, ctx: &mut TxContext): (AdminCap, StationCap, Station) {
        let station = Station {
            id: object::new(ctx),
            display_name: b"Test station".to_string(),
            location_name: b"Test location".to_string(),
            latitude_e6: 0,
            longitude_e6: 0,
            payout_address,
            maintenance_reserve: ctx.sender(),
            admin_payout_address: @0x99,
            status: StationStatus::Active,
            docked_count: 0,
        };
        let cap = StationCap { id: object::new(ctx), station: object::id(&station) };
        (AdminCap { id: object::new(ctx), payout_address: @0x99 }, cap, station)
    }

    #[test_only]
    public(package) fun prepare_return_for_testing(umbrella: &mut Umbrella, state: u8, already_paid: bool) {
        umbrella.state = match (state) {
            1 => UmbrellaState::Docked,
            2 => UmbrellaState::Held,
            3 => UmbrellaState::Quarantined,
            _ => UmbrellaState::Sold,
        };
        umbrella.holder = option::some(@0xB);
        umbrella.checkout_payout_address = option::some(@0xC);
        umbrella.admin_payout_address = option::some(@0x99);
        umbrella.inspection_deadline_ms = 120_000;
        umbrella.owner_count = 1;
        umbrella.active_escrow.join(sui::balance::create_for_testing<SUI>(PURCHASE_PRICE));
        if (already_paid) {
            let pending = umbrella.pending_condition.withdraw_all();
            sui::balance::destroy_for_testing(pending);
            umbrella.last_condition_status = ConditionStatus::Paid;
        };
    }

    #[test_only]
    public(package) fun docking_snapshot_for_testing(umbrella: &Umbrella): (bool, u64, u64, bool) {
        (
            umbrella.state == UmbrellaState::Docked,
            umbrella.last_condition_amount,
            umbrella.last_condition_cycle,
            umbrella.last_condition_status == ConditionStatus::Pending,
        )
    }

    /// Read private fields for tests without adding a production API.
    #[test_only]
    public(package) fun snapshot_for_testing(umbrella: &Umbrella): (
        address,
        bool,
        Option<address>,
        u64,
        u64,
        Option<address>,
        Option<ID>,
        Option<ID>,
        Option<address>,
        u64,
        u64,
        u64,
        u64,
        u64,
        u64,
    ) {
        (
            umbrella.supplier,
            umbrella.state == UmbrellaState::Created,
            umbrella.pending_condition_owner,
            umbrella.pending_condition.value(),
            umbrella.active_escrow.value(),
            umbrella.holder,
            umbrella.current_station_id,
            umbrella.checkout_station_id,
            umbrella.checkout_payout_address,
            umbrella.checkout_time_ms,
            umbrella.inspection_deadline_ms,
            umbrella.owner_count,
            umbrella.purchase_price,
            umbrella.condition_bond,
            umbrella.fee_per_ms,
        )
    }
}
