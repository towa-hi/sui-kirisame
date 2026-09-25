#[test_only]
module kirisame::quarantine_review_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};

    const PAID: u8 = 1;
    const FORFEITED: u8 = 2;
    const AWAITING_REVIEW: u8 = 3;
    const REFUND_APPROVED: u8 = 4;

    fun received(scenario: &Scenario, recipient: address): u64 {
        let mut total = 0;
        while (test_scenario::has_most_recent_for_address<Coin<SUI>>(recipient)) {
            let payment = scenario.take_from_address<Coin<SUI>>(recipient);
            total = total + payment.value();
            coin::burn_for_testing(payment);
        };
        total
    }

    // 0 approve; 1 forfeit; 3 foreign receiving station;
    // 4 stale cycle; 5 duplicate decision; 6 decision after payout; 7 non-quarantined.
    fun review_case(mode: u8) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), 0, scenario.ctx());
        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        let (admin, cap, mut station) = umbrella::station_for_testing(@0xE, scenario.ctx());
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        if (mode == 7) {
            umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, 0, &clock, scenario.ctx());
            umbrella::admin_review_quarantined_umbrella(&admin, &station, &mut asset, 0, true, scenario.ctx());
        };
        umbrella::prepare_return_for_testing(&mut asset, 2, false);
        clock.set_for_testing(60_000);
        umbrella::station_quarantine_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        test_scenario::return_shared(asset);
        // The station operator has no admin authority. The collecting admin
        // reviews without StationCap; the original reserve remains @0xD.
        transfer::public_transfer(cap, @0xF);
        transfer::public_share_object(station);
        transfer::public_transfer(admin, @0xE);
        clock.destroy_for_testing();

        scenario.next_tx(@0xF);
        assert!(test_scenario::has_most_recent_for_address<umbrella::StationCap>(@0xF));
        assert!(!test_scenario::has_most_recent_for_address<umbrella::AdminCap>(@0xF));
        scenario.next_tx(@0xE);
        assert!(received(&scenario, @0xB) == 100_000_000);
        assert!(received(&scenario, @0xA) == 0 && received(&scenario, @0xD) == 0);
        let mut asset = scenario.take_shared<Umbrella>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(18_446_744_073_709_551_615);
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        assert!(umbrella::condition_status_for_testing(&asset) == AWAITING_REVIEW);
        let (_, _, _, pending, escrow, _, _, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(pending == 30_000_000 && escrow == 0);
        test_scenario::return_shared(asset);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();

        scenario.next_tx(@0xE);
        assert!(!test_scenario::has_most_recent_for_address<umbrella::StationCap>(@0xE));
        let mut asset = scenario.take_shared<Umbrella>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let mut station = scenario.take_shared<umbrella::Station>();
        let (other_admin, other_cap, other_station) = umbrella::station_for_testing(@0xF, scenario.ctx());
        transfer::public_transfer(other_admin, @0x99);
        let approve = mode != 1 && mode != 8;
        umbrella::admin_review_quarantined_umbrella(
            &admin,
            if (mode == 3) { &other_station } else { &station },
            &mut asset, if (mode == 4) { 0 } else { 1 }, approve, scenario.ctx(),
        );
        if (mode == 5 || mode == 8) {
            umbrella::admin_review_quarantined_umbrella(&admin, &station, &mut asset, 1, !approve, scenario.ctx());
        };
        assert!(umbrella::condition_status_for_testing(&asset) ==
            if (approve) { REFUND_APPROVED } else { FORFEITED });
        let (_, _, owner, pending, escrow, holder, current, _, _, _, _, count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        let (quarantined, _) = umbrella::quarantine_snapshot_for_testing(&asset);
        let (_, amount, cycle, _) = umbrella::docking_snapshot_for_testing(&asset);
        assert!(quarantined && holder.is_none() && current == option::some(object::id(&station)));
        assert!(owner == option::some(@0xA) && amount == 30_000_000 && cycle == 0 && count == 1);
        assert!(pending == if (approve) { 30_000_000 } else { 0 });
        assert!(escrow == 0);
        test_scenario::return_shared(asset);
        scenario.return_to_sender(admin);
        test_scenario::return_shared(station);
        transfer::public_transfer(other_cap, @0x99);
        transfer::public_transfer(other_station, @0x99);

        scenario.next_tx(@0xE);
        assert!(received(&scenario, @0xA) == 0);
        assert!(received(&scenario, @0xD) == if (approve) { 0 } else { 30_000_000 });
        let mut asset = scenario.take_shared<Umbrella>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        assert!(umbrella::condition_status_for_testing(&asset) ==
            if (approve) { PAID } else { FORFEITED });
        let (_, _, _, pending, escrow, _, _, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(pending == 0 && escrow == 0);
        test_scenario::return_shared(asset);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();

        scenario.next_tx(@0xE);
        assert!(received(&scenario, @0xA) == if (approve) { 30_000_000 } else { 0 });
        assert!(received(&scenario, @0xB) == 0 && received(&scenario, @0xD) == 0);
        assert!(received(&scenario, @0xE) == 0 && received(&scenario, @0xF) == 0);
        if (mode == 6) {
            let mut asset = scenario.take_shared<Umbrella>();
            let admin = scenario.take_from_sender<umbrella::AdminCap>();
            let mut station = scenario.take_shared<umbrella::Station>();
            umbrella::admin_review_quarantined_umbrella(&admin, &station, &mut asset, 1, false, scenario.ctx());
            test_scenario::return_shared(asset);
            scenario.return_to_sender(admin);
            test_scenario::return_shared(station);
        };
        scenario.end();
    }

    #[test, expected_failure(abort_code = 10, location = kirisame::umbrella)]
    fun cannot_reverse_forfeiture() { review_case(8); }
    #[test] fun approved_refund_uses_existing_sweep() { review_case(0); }
    #[test] fun unsuitable_for_circulation_forfeits_to_fixed_reserve() { review_case(1); }
    #[test, expected_failure(abort_code = 3, location = kirisame::umbrella)]
    fun cannot_substitute_another_stations_reserve() { review_case(3); }
    #[test, expected_failure(abort_code = 5, location = kirisame::umbrella)]
    fun stale_cycle() { review_case(4); }
    #[test, expected_failure(abort_code = 10, location = kirisame::umbrella)]
    fun cannot_reverse_approval() { review_case(5); }
    #[test, expected_failure(abort_code = 10, location = kirisame::umbrella)]
    fun cannot_review_after_sweep() { review_case(6); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun cannot_review_normal_bin() { review_case(7); }
}
