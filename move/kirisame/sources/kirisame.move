
module kirisame::umbrella {
    use sui::balance::Balance;
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::coin::Coin;
    use std::string::String;
    
    public struct AdminCap has key, store {
        id: UID,
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
    }

    public enum ConditionStatus has copy, drop, store {
        Pending,
        Paid,
        Forfeited,
    }

    public struct Umbrella has key {
        id: UID,
        supplier: address,
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
        owner_count: u64,
    }

    public struct Station has key, store {
        id: UID,
        display_name: String,
        location_name: String,
        latitude_e6: u64,
        longitude_e6: u64,
        payout_address: address,
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

    /// Demo amounts in MIST (1 SUI = 1_000_000_000 MIST).
    const PURCHASE_PRICE: u64 = 100_000_000;
    const CONDITION_BOND: u64 = 30_000_000;
    const FEE_PER_MS: u64 = 330;
    const INSPECTION_WINDOW_MS: u64 = 120_000;

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap {id: object::new(ctx)}, 
            ctx.sender(),
        );
    }

    /// Create a new station
    public fun create_station(
        _admin: &AdminCap,
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

    /// Posts the supplier's condition bond and creates an umbrella awaiting deposit.
    public fun create_umbrella(bond: Coin<SUI>, ctx: &mut TxContext) {
        assert!(bond.value() == CONDITION_BOND, EInvalidConditionBond);

        let supplier = ctx.sender();
        transfer::share_object(Umbrella {
            id: object::new(ctx),
            supplier,
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
            owner_count: 0,
        });
    }

    /// Station attests physical receipt of a new umbrella or an eligible return.
    public fun dock_umbrella(
        _admin: &AdminCap,
        cap: &StationCap,
        station: &Station,
        umbrella: &mut Umbrella,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(cap.station == object::id(station), EWrongStation);
        assert!(umbrella.owner_count == expected_owner_count, EStaleOwnerCount);
        match (umbrella.state) {
            UmbrellaState::Created => {
                // First deposit keeps the supplier's condition bond intact.
            },
            UmbrellaState::Held => {
                let now = clock.timestamp_ms();
                assert!(now >= umbrella.inspection_deadline_ms, EInspectionOpen);
                let elapsed = now - umbrella.inspection_deadline_ms;
                // Compare before multiplying so even a very late return cannot overflow.
                let usage = if (umbrella.fee_per_ms == 0) {
                    0
                } else if (elapsed > umbrella.purchase_price / umbrella.fee_per_ms) {
                    umbrella.purchase_price
                } else {
                    elapsed * umbrella.fee_per_ms
                };
                let buyback = umbrella.purchase_price - usage;
                assert!(buyback > 0, ENoBuyback);

                pay_pending_condition(umbrella, ctx);
                // Quotient/remainder arithmetic floors shares without overflowing.
                let supplier_share = share(usage, 70);
                let checkout_share = share(usage, 15);
                pay(&mut umbrella.active_escrow, supplier_share, umbrella.supplier, ctx);
                pay(
                    &mut umbrella.active_escrow,
                    checkout_share,
                    *umbrella.checkout_payout_address.borrow(),
                    ctx,
                );
                pay(
                    &mut umbrella.active_escrow,
                    usage - supplier_share - checkout_share,
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
        };

        umbrella.current_station_id = option::some(object::id(station));
        umbrella.state = UmbrellaState::Docked;
    }

    /// Buyer purchases a docked umbrella and begins its inspection window.
    public fun undock_umbrella(
        station: &Station,
        umbrella: &mut Umbrella,
        payment: Coin<SUI>,
        expected_owner_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
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
                umbrella.checkout_time_ms = clock.timestamp_ms();
                umbrella.inspection_deadline_ms = umbrella.checkout_time_ms + INSPECTION_WINDOW_MS;
                umbrella.owner_count = umbrella.owner_count + 1;
            },
            UmbrellaState::Created => abort EInvalidState,
            UmbrellaState::Held => abort EInvalidState,
            UmbrellaState::Quarantined => abort EInvalidState,
            UmbrellaState::Sold => abort EInvalidState,
        };

        umbrella.current_station_id = option::none();
        umbrella.state = UmbrellaState::Held;
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
        if (umbrella.last_condition_status == ConditionStatus::Pending) {
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
        };
        let cap = StationCap { id: object::new(ctx), station: object::id(&station) };
        (AdminCap { id: object::new(ctx) }, cap, station)
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
