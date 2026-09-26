#[test_only]
module kirisame::transfer_station_tests {
    use kirisame::umbrella::{Self, AdminCap, Station, StationCap, Umbrella};
    use sui::coin;
    use sui::sui::SUI;
    use sui::test_scenario;

    // A owns the original cap, D administers, B and C are successive owners.
    fun transfer_station(mode: u8) {
        let mut scenario = test_scenario::begin(@0xD);
        let (admin, cap, station) = umbrella::station_for_testing(@0xA, scenario.ctx());
        let station_id = object::id(&station);
        transfer::public_transfer(admin, @0xD);
        transfer::public_transfer(cap, @0xA);
        transfer::public_share_object(station);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), 0, scenario.ctx());

        scenario.next_tx(@0xD);
        assert!(!test_scenario::has_most_recent_for_address<StationCap>(@0xD));
        let admin = scenario.take_from_sender<AdminCap>();
        let mut station = scenario.take_shared<Station>();
        if (mode == 3) umbrella::admin_remove_station(&admin, &mut station);
        umbrella::admin_transfer_station(&admin, &mut station, @0xB, scenario.ctx());
        assert!(object::id(&station) == station_id);
        assert!(umbrella::station_payout_for_testing(&station) == @0xB);
        test_scenario::return_shared(station);
        scenario.return_to_sender(admin);

        scenario.next_tx(@0xA);
        let old_cap = scenario.take_from_sender<StationCap>();
        let mut station = scenario.take_shared<Station>();
        let mut asset = scenario.take_shared<Umbrella>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        if (mode == 1) umbrella::station_dock_umbrella(&old_cap, &mut station, &mut asset, 0, &clock, scenario.ctx());
        if (mode == 2) umbrella::station_quarantine_umbrella(&old_cap, &station, &mut asset, 0, &clock, scenario.ctx());
        clock.destroy_for_testing();
        scenario.return_to_sender(old_cap);
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);

        scenario.next_tx(@0xB);
        let cap = scenario.take_from_sender<StationCap>();
        let mut station = scenario.take_shared<Station>();
        let mut asset = scenario.take_shared<Umbrella>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, 0, &clock, scenario.ctx());
        umbrella::user_undock_umbrella(&mut station, &mut asset,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 0, &clock, scenario.ctx());
        assert!(umbrella::checkout_payout_for_testing(&asset) == option::some(@0xB));
        clock.destroy_for_testing();
        scenario.return_to_sender(cap);
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);

        scenario.next_tx(@0xD);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut station = scenario.take_shared<Station>();
        umbrella::admin_transfer_station(&admin, &mut station, @0xC, scenario.ctx());
        assert!(umbrella::station_payout_for_testing(&station) == @0xC);
        let asset = scenario.take_shared<Umbrella>();
        // Transfer does not redirect a checkout that already happened.
        assert!(umbrella::checkout_payout_for_testing(&asset) == option::some(@0xB));
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        scenario.return_to_sender(admin);

        scenario.next_tx(if (mode == 4) @0xB else @0xC);
        let cap = scenario.take_from_sender<StationCap>();
        let station = scenario.take_shared<Station>();
        let mut asset = scenario.take_shared<Umbrella>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::station_quarantine_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        clock.destroy_for_testing();
        scenario.return_to_sender(cap);
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);
        scenario.end();
    }

    #[test]
    fun transfers_without_old_cap_and_preserves_checkout_payout() { transfer_station(0); }
    #[test, expected_failure(abort_code = 15, location = kirisame::umbrella)]
    fun original_cap_cannot_dock() { transfer_station(1); }
    #[test, expected_failure(abort_code = 15, location = kirisame::umbrella)]
    fun original_cap_cannot_quarantine() { transfer_station(2); }
    #[test, expected_failure(abort_code = 12, location = kirisame::umbrella)]
    fun removed_station_cannot_transfer() { transfer_station(3); }
    #[test, expected_failure(abort_code = 15, location = kirisame::umbrella)]
    fun second_transfer_revokes_replacement_cap() { transfer_station(4); }
}
