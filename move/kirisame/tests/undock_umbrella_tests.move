#[test_only]
module kirisame::undock_umbrella_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin;
    use sui::sui::SUI;
    use sui::test_scenario;

    fun run(state: u8, payment: u64, cycle: u64, wrong_station: bool, duplicate: bool) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xB);
        let mut asset = scenario.take_shared<Umbrella>();
        let (admin, cap, station) = umbrella::station_for_testing(@0xC, scenario.ctx());
        let (other_admin, other_cap, other) = umbrella::station_for_testing(@0xD, scenario.ctx());
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(1_000);
        if (state == 1) {
            umbrella::station_dock_umbrella(&cap, &station, &mut asset, 0, &clock, scenario.ctx());
        } else if (state > 1) {
            umbrella::prepare_return_for_testing(&mut asset, state, false);
        };
        umbrella::user_undock_umbrella(if (wrong_station) { &other } else { &station }, &mut asset,
            coin::mint_for_testing<SUI>(payment, scenario.ctx()), cycle, &clock, scenario.ctx());
        let (_, _, owner, pending, escrow, holder, current, checkout, payout, time, deadline, count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(owner == option::some(@0xA) && pending == 30_000_000 && escrow == 100_000_000);
        assert!(holder == option::some(@0xB) && current.is_none());
        assert!(checkout == option::some(object::id(&station)) && payout == option::some(@0xC));
        assert!(time == 1_000 && deadline == 121_000 && count == 1);
        let (_, hold, hold_cycle, is_pending) = umbrella::docking_snapshot_for_testing(&asset);
        assert!(hold == 30_000_000 && hold_cycle == 0 && is_pending);
        if (duplicate) {
            umbrella::user_undock_umbrella(&station, &mut asset, coin::mint_for_testing<SUI>(payment, scenario.ctx()), 1, &clock, scenario.ctx());
        };
        // Returning successfully verifies that purchase entered Held.
        clock.set_for_testing(deadline);
        umbrella::station_dock_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        umbrella::user_undock_umbrella(&station, &mut asset, coin::mint_for_testing<SUI>(payment, scenario.ctx()), 1, &clock, scenario.ctx());
        let (_, _, next_owner, next_pending, next_escrow, _, _, _, _, next_time, next_deadline, next_count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(next_owner == option::some(@0xB) && next_pending == 30_000_000 && next_escrow == 100_000_000);
        assert!(next_count == 2 && next_time == deadline && next_deadline == deadline + 120_000);
        let (_, _, next_cycle, next_pending_status) = umbrella::docking_snapshot_for_testing(&asset);
        assert!(next_cycle == 1 && next_pending_status);
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();
        transfer::public_transfer(admin, @0xB);
        transfer::public_transfer(cap, @0xB);
        transfer::public_transfer(station, @0xB);
        transfer::public_transfer(other_admin, @0xB);
        transfer::public_transfer(other_cap, @0xB);
        transfer::public_transfer(other, @0xB);
        scenario.end();
    }

    #[test]
    fun purchase_and_successor() { run(1, 100_000_000, 0, false, false); }
    #[test, expected_failure(abort_code = 3, location = kirisame::umbrella)]
    fun wrong_station() { run(1, 100_000_000, 0, true, false); }
    #[test, expected_failure(abort_code = 5, location = kirisame::umbrella)]
    fun stale_cycle() { run(1, 100_000_000, 1, false, false); }
    #[test, expected_failure(abort_code = 8, location = kirisame::umbrella)]
    fun underpayment() { run(1, 99_999_999, 0, false, false); }
    #[test, expected_failure(abort_code = 8, location = kirisame::umbrella)]
    fun overpayment() { run(1, 100_000_001, 0, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun created() { run(0, 100_000_000, 0, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun held() { run(2, 100_000_000, 1, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun quarantined() { run(3, 100_000_000, 1, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun sold() { run(4, 100_000_000, 1, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun duplicate() { run(1, 100_000_000, 0, false, true); }
}
