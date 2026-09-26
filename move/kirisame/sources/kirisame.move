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
        name: String,
        /// 0 = vinyl, 1 = black, 2 = white.
        color: u8,
        state: UmbrellaState,
        current_station_id: Option<ID>,
        holder: Option<address>,

        inspection_deadline_ms: u64,

        purchase_price: u64,
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
        // Fixed at creation so operators cannot redirect forfeited holds.
        maintenance_reserve: address,
        admin_payout_address: address,
        status: StationStatus,
        docked_count: u64,
        authorized_cap: ID,
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
    const EInvalidPayment: u64 = 8;
    const EInspectionClosed: u64 = 9;
    const EReviewAlreadyFinalized: u64 = 10;
    const EUnsettledCondition: u64 = 11;
    const EStationInactive: u64 = 12;
    const EStationNotRemoving: u64 = 13;
    const EInvalidColor: u64 = 14;
    const ERevokedStationCap: u64 = 15;
    const EInvalidName: u64 = 16;

    const ADMIN_PERCENT: u64 = 10;
    // Prices are in MIST (1 SUI = 1_000_000_000 MIST).
    const PURCHASE_PRICE: u64 = 100_000_000;
    const CONDITION_BOND: u64 = 30_000_000;
    const USAGE_PERIOD_MS: u64 = 86_400_000;
    const INSPECTION_WINDOW_MS: u64 = 120_000;

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap {id: object::new(ctx), payout_address: ctx.sender()},
            ctx.sender(),
        );
    }

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

        let station_uid = object::new(ctx);
        let cap = StationCap { id: object::new(ctx), station: station_uid.to_inner() };
        let station = Station {
            id: station_uid,
            display_name,
            location_name,
            latitude_e6,
            longitude_e6,
            payout_address,
            maintenance_reserve: ctx.sender(),
            admin_payout_address: admin.payout_address,
            status: StationStatus::Active,
            docked_count: 0,
            authorized_cap: object::id(&cap),
        };
        transfer::share_object(station);
        transfer::transfer(cap, payout_address);
    }

    public fun admin_transfer_station(
        _admin: &AdminCap,
        station: &mut Station,
        new_owner: address,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        let cap = StationCap { id: object::new(ctx), station: object::id(station) };
        station.authorized_cap = object::id(&cap);
        station.payout_address = new_owner;
        transfer::transfer(cap, new_owner);
    }

    fun assert_station_cap(cap: &StationCap, station: &Station) {
        assert!(cap.station == object::id(station), EWrongStation);
        assert!(object::id(cap) == station.authorized_cap, ERevokedStationCap);
    }

    public fun admin_remove_station(_admin: &AdminCap, station: &mut Station) {
        // WARNING: the station is not completely removed until admin_retire_station_umbrella is called on all docked umbrellas
        station.status = if (station.docked_count == 0) {
            StationStatus::Removed
        } else {
            StationStatus::Removing
        };
    }

    public fun admin_retire_station_umbrella(
        _admin: &AdminCap,
        station: &mut Station,
        umbrella: &mut Umbrella,
        ctx: &mut TxContext,
    ) {
        // called for each umbrella in a station that is StationStatus::Removing
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

    #[test_only]
    public(package) fun station_is_removing(station: &Station): bool {
        station.status == StationStatus::Removing
    }

    #[test_only]
    public(package) fun station_is_removed(station: &Station): bool {
        station.status == StationStatus::Removed
    }

    #[test_only]
    public(package) fun station_docked_count(station: &Station): u64 { station.docked_count }

    public fun user_create_umbrella(bond: Coin<SUI>, color: u8, name: String, ctx: &mut TxContext) {
        assert!(color <= 2, EInvalidColor);
        assert!(name.length() > 0 && name.length() <= 256, EInvalidName);
        assert!(bond.value() == CONDITION_BOND, EInvalidConditionBond);

        let supplier = ctx.sender();
        transfer::share_object(Umbrella {
            id: object::new(ctx),
            supplier,
            name,
            color,
            state: UmbrellaState::Created,
            current_station_id: option::none(),
            holder: option::none(),
            inspection_deadline_ms: 0,
            purchase_price: PURCHASE_PRICE,
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

    #[test_only]
    public(package) fun name(umbrella: &Umbrella): &String { &umbrella.name }

    #[test_only]
    public(package) fun color(umbrella: &Umbrella): u8 { umbrella.color }

    public fun station_dock_umbrella(
        cap: &StationCap,
        station: &mut Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        assert_station_cap(cap, station);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        match (umbrella.state) {
            UmbrellaState::Created => {
                // First deposit keeps the supplier's bond intact.
            },
            UmbrellaState::Held => {
                let now = clock.timestamp_ms();
                assert!(now >= umbrella.inspection_deadline_ms, EInspectionOpen);
                let usage = usage_fee(umbrella, now);
                let buyback = umbrella.purchase_price - usage;
                if (buyback == 0) {
                    finalize_sale(umbrella, ctx);
                    return
                };

                pay_pending_condition(umbrella, ctx);
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
            _ => abort EInvalidState,
        };

        umbrella.current_station_id = option::some(object::id(station));
        umbrella.state = UmbrellaState::Docked;
        station.docked_count = station.docked_count + 1;
    }

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
        assert!(umbrella.state == UmbrellaState::Docked, EInvalidState);
        assert!(umbrella.current_station_id == option::some(object::id(station)), EWrongStation);
        assert!(payment.value() == umbrella.purchase_price, EInvalidPayment);

        // Keep the previous owner's hold pending through inspection.
        umbrella.active_escrow.join(payment.into_balance());
        umbrella.holder = option::some(ctx.sender());
        umbrella.checkout_payout_address = option::some(station.payout_address);
        umbrella.admin_payout_address = option::some(station.admin_payout_address);
        umbrella.inspection_deadline_ms = clock.timestamp_ms() + INSPECTION_WINDOW_MS;
        umbrella.owner_count = umbrella.owner_count + 1;

        umbrella.current_station_id = option::none();
        umbrella.state = UmbrellaState::Held;
        station.docked_count = station.docked_count - 1;
    }

    public fun station_quarantine_umbrella(
        cap: &StationCap,
        station: &Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(station.status == StationStatus::Active, EStationInactive);
        assert_station_cap(cap, station);
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

    /// Approved refunds are paid by admin_settle_pending_payments.
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
        let now = clock.timestamp_ms();
        if (now < umbrella.inspection_deadline_ms) return;
        if (usage_fee(umbrella, now) < umbrella.purchase_price) {
            pay_pending_condition(umbrella, ctx);
        } else {
            finalize_sale(umbrella, ctx);
        };
    }

    fun finalize_sale(umbrella: &mut Umbrella, ctx: &mut TxContext) {
        pay_pending_condition(umbrella, ctx);
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

    // Multiply before dividing to avoid per-ms rounding; u128 prevents overflow.
    fun usage_fee(umbrella: &Umbrella, now: u64): u64 {
        if (now <= umbrella.inspection_deadline_ms) return 0;
        let elapsed = (now - umbrella.inspection_deadline_ms).min(USAGE_PERIOD_MS);
        (((umbrella.purchase_price as u128) * (elapsed as u128) / (USAGE_PERIOD_MS as u128)) as u64)
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

    fun pay_admin_share(umbrella: &mut Umbrella, revenue: u64, ctx: &mut TxContext): u64 {
        let amount = share(revenue, ADMIN_PERCENT);
        if (amount > 0) {
            pay(&mut umbrella.active_escrow, amount, *umbrella.admin_payout_address.borrow(), ctx);
        };
        revenue - amount
    }

    // Split the multiplication to avoid overflow while rounding down.
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
    public(package) fun station_payout_for_testing(station: &Station): address {
        station.payout_address
    }

    #[test_only]
    public(package) fun checkout_payout_for_testing(umbrella: &Umbrella): Option<address> {
        umbrella.checkout_payout_address
    }

    #[test_only]
    public(package) fun station_for_testing(payout_address: address, ctx: &mut TxContext): (AdminCap, StationCap, Station) {
        let station_uid = object::new(ctx);
        let cap = StationCap { id: object::new(ctx), station: station_uid.to_inner() };
        let station = Station {
            id: station_uid,
            display_name: b"Test station".to_string(),
            location_name: b"Test location".to_string(),
            latitude_e6: 0,
            longitude_e6: 0,
            payout_address,
            maintenance_reserve: ctx.sender(),
            admin_payout_address: @0x99,
            status: StationStatus::Active,
            docked_count: 0,
            authorized_cap: object::id(&cap),
        };
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

    #[test_only]
    public(package) fun snapshot_for_testing(umbrella: &Umbrella): (
        address,
        bool,
        Option<address>,
        u64,
        u64,
        Option<address>,
        Option<ID>,
        Option<address>,
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
            umbrella.checkout_payout_address,
            umbrella.inspection_deadline_ms,
            umbrella.owner_count,
            umbrella.purchase_price,
            umbrella.condition_bond,
        )
    }
}
