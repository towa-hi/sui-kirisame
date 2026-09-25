#[test_only]
module kirisame::dock_umbrella_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};

    // The fixture supplies the postconditions of checkout.
    fun run_dock(state: u8, now: u64, cycle: u64, wrong_station: bool, duplicate: bool, paid: bool, usage: u64) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        if (state != 0) {
            umbrella::prepare_return_for_testing(&mut asset, state, paid);
        };
        let (admin, cap, mut station) = umbrella::station_for_testing(@0xD, scenario.ctx());
        let (other_admin, other_cap, other_station) = umbrella::station_for_testing(@0xE, scenario.ctx());
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
        let mut station = scenario.take_from_sender<umbrella::Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(now);
        umbrella::station_dock_umbrella(
            if (wrong_station) { &other_cap } else { &cap }, &mut station,
            &mut asset, cycle, &clock, scenario.ctx(),
        );
        if (duplicate) {
            umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, cycle, &clock, scenario.ctx());
        };
        let (_, _, owner, pending, escrow, holder, current_station, _, _, _, _, owner_count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        let (docked, amount, condition_cycle, is_pending) = umbrella::docking_snapshot_for_testing(&asset);
        assert!(docked && is_pending);
        assert!(current_station == option::some(object::id(&station)));
        assert!(holder.is_none() && escrow == 0);
        assert!(owner_count == cycle && condition_cycle == cycle);
        let hold = if (state == 0) { 30_000_000 } else { (100_000_000 - usage).min(30_000_000) };
        assert!(pending == hold && amount == hold);
        assert!(owner == option::some(if (state == 0) { @0xA } else { @0xB }));
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();
        transfer::public_transfer(cap, @0xD);
        transfer::public_transfer(station, @0xD);
        transfer::public_transfer(other_cap, @0xD);
        transfer::public_transfer(other_station, @0xD);
        scenario.next_tx(@0xD);
        if (state == 0) {
            assert!(received(&scenario, @0x99) == 0);
            assert!(received(&scenario, @0xA) == 0);
            assert!(received(&scenario, @0xB) == 0);
            assert!(received(&scenario, @0xC) == 0);
            assert!(received(&scenario, @0xD) == 0);
        } else {
            let admin_share = usage / 10;
            let proceeds = usage - admin_share;
            let supplier_share = proceeds * 70 / 100;
            let checkout_share = proceeds * 15 / 100;
            assert!(received(&scenario, @0x99) == admin_share);
            assert!(received(&scenario, @0xA) == supplier_share + if (paid) { 0 } else { 30_000_000 });
            assert!(received(&scenario, @0xB) == 100_000_000 - usage - hold);
            assert!(received(&scenario, @0xC) == checkout_share);
            assert!(received(&scenario, @0xD) == proceeds - supplier_share - checkout_share);
        };
        scenario.end();
    }

    fun received(scenario: &Scenario, recipient: address): u64 {
        let mut total = 0;
        while (test_scenario::has_most_recent_for_address<Coin<SUI>>(recipient)) {
            let coin = scenario.take_from_address<Coin<SUI>>(recipient);
            total = total + coin.value();
            coin::burn_for_testing(coin);
        };
        total
    }

    #[test]
    fun first_deposit() { run_dock(0, 0, 0, false, false, false, 0); }
    #[test]
    fun normal_return() { run_dock(2, 180_000, 1, false, false, false, 19_800_000); }
    #[test]
    fun inspection_boundary() { run_dock(2, 120_000, 1, false, false, false, 0); }
    #[test]
    fun rounding_remainder() { run_dock(2, 120_001, 1, false, false, false, 330); }
    #[test]
    fun small_buyback() { run_dock(2, 423_030, 1, false, false, false, 99_999_900); }
    #[test]
    fun previously_paid_hold() { run_dock(2, 180_000, 1, false, false, true, 19_800_000); }

    #[test, expected_failure(abort_code = 3, location = kirisame::umbrella)]
    fun wrong_station() { run_dock(0, 0, 0, true, false, false, 0); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun duplicate_deposit() { run_dock(0, 0, 0, false, true, false, 0); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun duplicate_return() { run_dock(2, 180_000, 1, false, true, false, 0); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun quarantined() { run_dock(3, 180_000, 1, false, false, false, 0); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun sold() { run_dock(4, 180_000, 1, false, false, false, 0); }
    #[test, expected_failure(abort_code = 5, location = kirisame::umbrella)]
    fun stale_cycle() { run_dock(2, 180_000, 0, false, false, false, 0); }
    #[test, expected_failure(abort_code = 6, location = kirisame::umbrella)]
    fun inspection_open() { run_dock(2, 119_999, 1, false, false, false, 0); }
    #[test, expected_failure(abort_code = 7, location = kirisame::umbrella)]
    fun zero_buyback() { run_dock(2, 423_031, 1, false, false, false, 0); }
    #[test, expected_failure(abort_code = 7, location = kirisame::umbrella)]
    fun far_future_return() { run_dock(2, 18_446_744_073_709_551_615, 1, false, false, false, 0); }
}
