#[test_only]
module kirisame::admin_share_tests {
    use kirisame::umbrella::{Self, AdminCap, Station, StationCap, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};

    fun received(scenario: &Scenario, recipient: address): u64 {
        let mut total = 0;
        while (test_scenario::has_most_recent_for_address<Coin<SUI>>(recipient)) {
            let payment = scenario.take_from_address<Coin<SUI>>(recipient);
            total = total + payment.value();
            coin::burn_for_testing(payment);
        };
        total
    }

    // The admin beneficiary, registering wallet, station recipient, buyer,
    // supplier and settlement caller are all distinct.
    fun real_purchase(final_sale: bool) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), 0, scenario.ctx());
        scenario.next_tx(@0xD);
        let (admin, unused_cap, unused_station) = umbrella::station_for_testing(@0xFE, scenario.ctx());
        transfer::public_transfer(unused_cap, @0xFE);
        transfer::public_transfer(unused_station, @0xFE);
        umbrella::admin_create_station(&admin, b"Station".to_string(), b"Location".to_string(),
            0, 0, @0xE, scenario.ctx());
        transfer::public_transfer(admin, @0xF);
        scenario.next_tx(@0xD);
        let mut station = scenario.take_shared<Station>();
        let cap = scenario.take_from_sender<StationCap>();
        let mut asset = scenario.take_shared<Umbrella>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, 0, &clock, scenario.ctx());
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);
        scenario.return_to_sender(cap);
        clock.destroy_for_testing();

        scenario.next_tx(@0xB);
        let mut station = scenario.take_shared<Station>();
        let mut asset = scenario.take_shared<Umbrella>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::user_undock_umbrella(&mut station, &mut asset,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 0, &clock, scenario.ctx());
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();

        scenario.next_tx(@0xF);
        assert!(received(&scenario, @0x99) == 0); // No fee taken from refundable escrow.
        let admin = scenario.take_from_sender<AdminCap>();
        let mut asset = scenario.take_shared<Umbrella>();
        let mut station = scenario.take_shared<Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(if (final_sale) { 423_031 } else { 180_000 });
        if (final_sale) {
            // Settlement survives station removal and cannot pay the new cap holder.
            umbrella::admin_remove_station(&admin, &mut station);
            umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
            umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        } else {
            let cap = scenario.take_from_address<StationCap>(@0xD);
            umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, 1, &clock, scenario.ctx());
            test_scenario::return_to_address(@0xD, cap);
        };
        test_scenario::return_shared(station);
        test_scenario::return_shared(asset);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();
        scenario.next_tx(@0xF);
        assert!(received(&scenario, @0x99) == if (final_sale) { 10_000_000 } else { 1_980_000 });
        assert!(received(&scenario, @0xA) == 30_000_000 + if (final_sale) { 63_000_000 } else { 12_474_000 });
        assert!(received(&scenario, @0xE) == if (final_sale) { 27_000_000 } else { 5_346_000 });
        assert!(received(&scenario, @0xB) == if (final_sale) { 0 } else { 50_200_000 });
        assert!(received(&scenario, @0xD) == 0 && received(&scenario, @0xF) == 0);
        scenario.end();
    }

    #[test] fun return_pays_fixed_admin_beneficiary() { real_purchase(false); }
    #[test] fun sale_pays_fixed_admin_after_removal_and_cap_transfer() { real_purchase(true); }
}
