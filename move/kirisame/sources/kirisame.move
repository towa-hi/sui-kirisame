
module kirisame::umbrella {
    use sui::balance::Balance;
    use sui::clock::Clock;
    use sui::coin::Coin;
    
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
        current_station_id: UID,
        checkout_station_id: UID,
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
}