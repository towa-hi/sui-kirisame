#[test_only]
module kirisame::quarantine_umbrella_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario;

    fun run(state: u8, now: u64, cycle: u64, wrong_station: bool, duplicate: bool) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        if (state != 0) {
            umbrella::prepare_return_for_testing(&mut asset, state, false);
        };
        let (admin, cap, station) = umbrella::station_for_testing(@0xE, scenario.ctx());
        let (other_admin, other_cap, other_station) = umbrella::station_for_testing(@0xF, scenario.ctx());
        transfer::public_transfer(admin, @0x99);
        transfer::public_transfer(other_admin, @0x99);
        test_scenario::return_shared(asset);
        transfer::public_transfer(cap, @0xD);
        transfer::public_transfer(station, @0xD);
        transfer::public_transfer(other_cap, @0xD);
        transfer::public_transfer(other_station, @0xD);
        scenario.next_tx(@0xD);
        assert!(!test_scenario::has_most_recent_for_address<umbrella::AdminCap>(@0xD));
        let mut asset = scenario.take_shared<Umbrella>();
        let other_cap = scenario.take_from_sender<umbrella::StationCap>();
        let cap = scenario.take_from_sender<umbrella::StationCap>();
        let other_station = scenario.take_from_sender<umbrella::Station>();
        let station = scenario.take_from_sender<umbrella::Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(now);
        umbrella::station_quarantine_umbrella(
            if (wrong_station) { &other_cap } else { &cap }, &station,
            &mut asset, cycle, &clock, scenario.ctx(),
        );
        if (duplicate) {
            umbrella::station_quarantine_umbrella(&cap, &station, &mut asset, cycle, &clock, scenario.ctx());
        };
        let (_, _, owner, pending, escrow, holder, current_station, _, _, _, deadline, owner_count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        let (_, amount, condition_cycle, is_pending) = umbrella::docking_snapshot_for_testing(&asset);
        let (quarantined, forfeited) = umbrella::quarantine_snapshot_for_testing(&asset);
        assert!(quarantined && forfeited && !is_pending);
        assert!(owner == option::some(@0xA) && amount == 30_000_000 && condition_cycle == 0);
        assert!(pending == 0 && escrow == 0 && holder.is_none());
        assert!(current_station == option::some(object::id(&station)));
        assert!(owner_count == 1 && deadline == 120_000);
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();
        transfer::public_transfer(cap, @0xD);
        transfer::public_transfer(station, @0xD);
        transfer::public_transfer(other_cap, @0xD);
        transfer::public_transfer(other_station, @0xD);
        scenario.next_tx(@0xD);
        let refund = scenario.take_from_address<Coin<SUI>>(@0xB);
        let reserve = scenario.take_from_address<Coin<SUI>>(@0xD);
        assert!(refund.value() == 100_000_000 && reserve.value() == 30_000_000);
        coin::burn_for_testing(refund);
        coin::burn_for_testing(reserve);
        assert!(!test_scenario::has_most_recent_for_address<Coin<SUI>>(@0xA));
        assert!(!test_scenario::has_most_recent_for_address<Coin<SUI>>(@0xC));
        assert!(!test_scenario::has_most_recent_for_address<Coin<SUI>>(@0xE));
        scenario.end();
    }

    #[test]
    fun fault_return() { run(2, 60_000, 1, false, false); }
    #[test]
    fun last_inspection_millisecond() { run(2, 119_999, 1, false, false); }
    #[test, expected_failure(abort_code = 9, location = kirisame::umbrella)]
    fun exact_deadline() { run(2, 120_000, 1, false, false); }
    #[test, expected_failure(abort_code = 9, location = kirisame::umbrella)]
    fun late_return() { run(2, 180_000, 1, false, false); }
    #[test, expected_failure(abort_code = 3, location = kirisame::umbrella)]
    fun wrong_station() { run(2, 60_000, 1, true, false); }
    #[test, expected_failure(abort_code = 5, location = kirisame::umbrella)]
    fun stale_cycle() { run(2, 60_000, 0, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun duplicate_return() { run(2, 60_000, 1, false, true); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun created() { run(0, 60_000, 0, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun docked() { run(1, 60_000, 1, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun quarantined() { run(3, 60_000, 1, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun sold() { run(4, 60_000, 1, false, false); }
}
