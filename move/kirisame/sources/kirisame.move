
module kirisame::umbrella {
    use sui::balance::Balance;
    use sui::clock::Clock;
    use sui::coin::Coin;
    use std::string::String;
    
    public struct AdminCap has key, store {
        id: UID,
    }

    public struct StationCap has key, store {
        id: UID,
        station_id: u64,
        payout_address: address,
    }

    public enum UmbrellaState has copy, drop, store {
        Created,
        Docked,
        Held,
        Quarantined,
        Sold,
    }

    public struct Umbrella<phantom T> has key {
        id: UID,
        supplier: address,
        state: UmbrellaState,
        current_station_id: u64,
        checkout_station_id: u64,
        holder: address,
        has_holder: bool,

        checkout_time_ms: u64,
        inspection_deadline_ms: u64,

        purchase_price: u64,
        fee_per_ms: u64,
        condition_bond: u64,

        active_escrow: Balance<T>,
        pending_condition: Balance<T>,
        pending_condition_owner: address,
        has_pending_condition_owner: bool,

        rental_count: u64,
    }

    public struct Station has key, store {
        id: UID,
        station_id: u64,
        display_name: String,
        location_name: String,
        latitude_e6: u64,
        longitude_e6: u64,
        payout_address: address,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap {id: object::new(ctx)}, 
            ctx.sender(),
        );
    }
}