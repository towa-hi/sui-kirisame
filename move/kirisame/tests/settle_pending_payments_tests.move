#[test_only]
module kirisame::settle_pending_payments_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};

    fun received(scenario: &Scenario, recipient: address): u64 {
        let mut total = 0;
        while (test_scenario::has_most_recent_for_address<Coin<SUI>>(recipient)) {
            let coin = scenario.take_from_address<Coin<SUI>>(recipient);
            total = total + coin.value();
            coin::burn_for_testing(coin);
        };
        total
    }

    fun run(state: u8, now: u64, already_paid: bool, settles: bool, try_return: bool) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        if (state != 0) umbrella::prepare_return_for_testing(&mut asset, state, already_paid);
        let (old_supplier, old_created, old_owner, old_pending, old_escrow, old_holder, old_current, old_checkout, old_payout, old_time, old_deadline, old_count, old_price, old_bond, old_rate) = umbrella::snapshot_for_testing(&asset);
        let (admin, cap, station) = umbrella::station_for_testing(@0xD, scenario.ctx());
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(now);
        let releases_hold = state == 2 && now >= 120_000 && !already_paid;
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        // A periodic sweep can run repeatedly without paying twice.
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (supplier, created, owner, pending, escrow, holder, current, checkout, payout, time, deadline, count, price, bond, rate) = umbrella::snapshot_for_testing(&asset);
        assert!(supplier == old_supplier && created == old_created && owner == old_owner);
        assert!(holder == old_holder && current == old_current && checkout == old_checkout && payout == old_payout);
        assert!(time == old_time && deadline == old_deadline && count == old_count);
        assert!(price == old_price && bond == old_bond && rate == old_rate);
        if (settles) {
            let (sold, paid, amount, cycle) = umbrella::sale_snapshot_for_testing(&asset);
            assert!(sold && paid && amount == 30_000_000 && cycle == 0);
            assert!(pending == 0 && escrow == 0);
        } else {
            assert!(pending == if (releases_hold) { 0 } else { old_pending });
            assert!(escrow == old_escrow);
            let (sold, paid, _, _) = umbrella::sale_snapshot_for_testing(&asset);
            assert!(sold == (state == 4) && paid == (already_paid || releases_hold));
        };
        if (try_return) umbrella::station_dock_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();
        transfer::public_transfer(admin, @0xD);
        transfer::public_transfer(cap, @0xD);
        transfer::public_transfer(station, @0xD);
        scenario.next_tx(@0xD);
        let supplier_revenue = if (settles) { 70_000_000 } else { 0 };
        let prior_hold = if (releases_hold) { 30_000_000 } else { 0 };
        assert!(received(&scenario, @0xA) == supplier_revenue + prior_hold);
        assert!(received(&scenario, @0xC) == if (settles) { 30_000_000 } else { 0 });
        assert!(received(&scenario, @0xB) == 0 && received(&scenario, @0xD) == 0);
        scenario.end();
    }

    #[test] fun exact_cutoff() { run(2, 423_031, false, true, false); }
    #[test] fun already_paid_hold() { run(2, 423_031, true, true, false); }
    #[test] fun far_future() { run(2, 18_446_744_073_709_551_615, false, true, false); }
    #[test] fun just_before_cutoff() { run(2, 423_030, false, false, false); }
    #[test] fun inspection_open() { run(2, 119_999, false, false, false); }
    #[test] fun inspection_ended() { run(2, 120_000, false, false, false); }
    #[test] fun inspection_ended_already_paid() { run(2, 120_000, true, false, false); }
    #[test] fun created() { run(0, 500_000, false, false, false); }
    #[test] fun docked() { run(1, 500_000, false, false, false); }
    #[test] fun quarantined() { run(3, 500_000, false, false, false); }
    #[test] fun sold() { run(4, 500_000, false, false, false); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun settled_umbrella_cannot_return() { run(2, 423_031, false, true, true); }

    // Exercise actual purchases and returns with different buyers. The sweep
    // pays the recorded prior owner, never its caller or the current buyer.
    fun successor_sweep(final_sale: bool) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        let (admin, cap, station) = umbrella::station_for_testing(@0xE, scenario.ctx());
        transfer::public_transfer(admin, @0xD);
        transfer::public_transfer(cap, @0xD);
        transfer::public_share_object(station);

        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        let station = scenario.take_shared<umbrella::Station>();
        let cap = scenario.take_from_sender<umbrella::StationCap>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(0);
        umbrella::station_dock_umbrella(&cap, &station, &mut asset, 0, &clock, scenario.ctx());
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        scenario.return_to_sender(cap);
        clock.destroy_for_testing();

        scenario.next_tx(@0xB);
        let mut asset = scenario.take_shared<Umbrella>();
        let station = scenario.take_shared<umbrella::Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(0);
        umbrella::user_undock_umbrella(&station, &mut asset,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 0, &clock, scenario.ctx());
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        clock.destroy_for_testing();

        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        let station = scenario.take_shared<umbrella::Station>();
        let cap = scenario.take_from_sender<umbrella::StationCap>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(120_000);
        if (!final_sale) umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        umbrella::station_dock_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        // A delayed sweep after the return must leave Bob's new hold pending.
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (_, _, owner, pending, escrow, _, _, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(owner == option::some(@0xB) && pending == 30_000_000 && escrow == 0);
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        scenario.return_to_sender(cap);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();

        scenario.next_tx(@0xC);
        assert!(received(&scenario, @0xA) == 30_000_000);
        assert!(received(&scenario, @0xB) == 70_000_000);
        let mut asset = scenario.take_shared<Umbrella>();
        let station = scenario.take_shared<umbrella::Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(120_000);
        umbrella::user_undock_umbrella(&station, &mut asset,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 1, &clock, scenario.ctx());
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        clock.destroy_for_testing();

        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        let station = scenario.take_shared<umbrella::Station>();
        let cap = scenario.take_from_sender<umbrella::StationCap>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(239_999);
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (_, _, _, pending, _, _, _, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(pending == 30_000_000);
        clock.set_for_testing(240_000);
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (_, _, owner, pending, escrow, holder, _, _, _, time, deadline, count, _, _, _) = umbrella::snapshot_for_testing(&asset);
        let (sold, paid, amount, cycle) = umbrella::sale_snapshot_for_testing(&asset);
        assert!(!sold && paid && amount == 30_000_000 && cycle == 1);
        assert!(owner == option::some(@0xB) && pending == 0 && escrow == 100_000_000);
        assert!(holder == option::some(@0xC) && time == 120_000 && deadline == 240_000 && count == 2);
        if (final_sale) {
            clock.set_for_testing(543_031);
            umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
            let (sold, paid, _, _) = umbrella::sale_snapshot_for_testing(&asset);
            assert!(sold && paid);
        } else {
            umbrella::station_dock_umbrella(&cap, &station, &mut asset, 2, &clock, scenario.ctx());
        };
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (_, _, _, pending, escrow, _, _, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&asset);
        assert!(escrow == 0 && pending == if (final_sale) { 0 } else { 30_000_000 });
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        scenario.return_to_sender(cap);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();

        scenario.next_tx(@0xD);
        assert!(received(&scenario, @0xB) == 30_000_000);
        assert!(received(&scenario, @0xC) == if (final_sale) { 0 } else { 70_000_000 });
        assert!(received(&scenario, @0xA) == if (final_sale) { 70_000_000 } else { 0 });
        assert!(received(&scenario, @0xE) == if (final_sale) { 30_000_000 } else { 0 });
        assert!(received(&scenario, @0xD) == 0);
        scenario.end();
    }

    #[test] fun successor_sweep_then_return() { successor_sweep(false); }
    #[test] fun successor_sweep_then_sale() { successor_sweep(true); }
}
