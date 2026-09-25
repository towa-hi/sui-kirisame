#[test_only]
module kirisame::retire_umbrella_tests {
    use kirisame::umbrella::{Self, Umbrella};
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

    // modes: 0 settled; 1 unresolved review; 2 approved but unpaid;
    // 3 stale cycle; 4 duplicate; 5 dock; 6 purchase; 7 quarantine; 8 review.
    fun retire_case(approve: bool, mode: u8) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), 0, scenario.ctx());
        scenario.next_tx(@0xD);
        let mut asset = scenario.take_shared<Umbrella>();
        let (admin, cap, mut station) = umbrella::station_for_testing(@0xE, scenario.ctx());
        umbrella::prepare_return_for_testing(&mut asset, 2, false);
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(60_000);
        umbrella::station_quarantine_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
        transfer::public_transfer(cap, @0xF);
        transfer::public_share_object(station);
        transfer::public_transfer(admin, @0xE);
        test_scenario::return_shared(asset);
        clock.destroy_for_testing();

        scenario.next_tx(@0xE);
        assert!(!test_scenario::has_most_recent_for_address<umbrella::StationCap>(@0xE));
        let mut asset = scenario.take_shared<Umbrella>();
        let admin = scenario.take_from_sender<umbrella::AdminCap>();
        let mut station = scenario.take_shared<umbrella::Station>();
        let mut clock = sui::clock::create_for_testing(scenario.ctx());
        clock.set_for_testing(180_000);
        if (mode != 1) {
            umbrella::admin_review_quarantined_umbrella(&admin, &station, &mut asset, 1, approve, scenario.ctx());
            if (mode != 2) umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        };
        let asset_id = object::id(&asset);
        let (_, _, owner, _, _, _, _, checkout, payout, time, deadline, count, price, bond, rate) = umbrella::snapshot_for_testing(&asset);
        let status = umbrella::condition_status_for_testing(&asset);
        let (_, amount, cycle, _) = umbrella::docking_snapshot_for_testing(&asset);
        umbrella::admin_retire_umbrella(&admin, &mut asset, if (mode == 3) { 0 } else { 1 });
        assert!(umbrella::retired_for_testing(&asset) && object::id(&asset) == asset_id);
        // Sweeping a retired record is harmless and preserves the final outcome.
        umbrella::admin_settle_pending_payments(&admin, &mut asset, &clock, scenario.ctx());
        let (supplier, _, new_owner, pending, escrow, holder, current, new_checkout, new_payout, new_time, new_deadline, new_count, new_price, new_bond, new_rate) = umbrella::snapshot_for_testing(&asset);
        let (_, new_amount, new_cycle, _) = umbrella::docking_snapshot_for_testing(&asset);
        assert!(supplier == @0xA && new_owner == owner && pending == 0 && escrow == 0);
        assert!(holder.is_none() && current.is_none());
        assert!(new_checkout == checkout && new_payout == payout && new_time == time && new_deadline == deadline);
        assert!(new_count == count && new_price == price && new_bond == bond && new_rate == rate);
        assert!(new_amount == amount && new_cycle == cycle && umbrella::condition_status_for_testing(&asset) == status);
        if (mode == 4) umbrella::admin_retire_umbrella(&admin, &mut asset, 1);
        if (mode == 6) umbrella::user_undock_umbrella(&mut station, &mut asset,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 1, &clock, scenario.ctx());
        if (mode == 8) umbrella::admin_review_quarantined_umbrella(&admin, &station, &mut asset, 1, !approve, scenario.ctx());
        test_scenario::return_shared(asset);
        test_scenario::return_shared(station);
        scenario.return_to_sender(admin);
        clock.destroy_for_testing();

        scenario.next_tx(@0xF);
        assert!(received(&scenario, @0xB) == 100_000_000);
        assert!(received(&scenario, @0xA) == if (approve) { 30_000_000 } else { 0 });
        assert!(received(&scenario, @0xD) == if (approve) { 0 } else { 30_000_000 });
        assert!(received(&scenario, @0xE) == 0 && received(&scenario, @0xF) == 0);
        if (mode == 5 || mode == 7) {
            let mut asset = scenario.take_shared<Umbrella>();
            let mut station = scenario.take_shared<umbrella::Station>();
            let cap = scenario.take_from_sender<umbrella::StationCap>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            if (mode == 5) umbrella::station_dock_umbrella(&cap, &mut station, &mut asset, 1, &clock, scenario.ctx());
            if (mode == 7) umbrella::station_quarantine_umbrella(&cap, &station, &mut asset, 1, &clock, scenario.ctx());
            test_scenario::return_shared(asset);
            test_scenario::return_shared(station);
            scenario.return_to_sender(cap);
            clock.destroy_for_testing();
        };
        // Replacement follows ordinary supply: a new identity, admin as supplier,
        // and a fresh bond; nothing is inherited from the retired record.
        scenario.next_tx(@0xE);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), 0, scenario.ctx());
        scenario.next_tx(@0xE);
        let replacement = scenario.take_shared<Umbrella>();
        assert!(object::id(&replacement) != asset_id);
        let (supplier, created, owner, pending, escrow, holder, current, _, _, _, _, count, _, _, _) = umbrella::snapshot_for_testing(&replacement);
        assert!(created && supplier == @0xE && owner == option::some(@0xE));
        assert!(pending == 30_000_000 && escrow == 0 && holder.is_none() && current.is_none() && count == 0);
        test_scenario::return_shared(replacement);
        scenario.end();
    }

    #[test] fun retire_after_refund() { retire_case(true, 0); }
    #[test] fun retire_after_forfeiture() { retire_case(false, 0); }
    #[test, expected_failure(abort_code = 11, location = kirisame::umbrella)]
    fun unresolved_review() { retire_case(true, 1); }
    #[test, expected_failure(abort_code = 11, location = kirisame::umbrella)]
    fun unpaid_approved_refund() { retire_case(true, 2); }
    #[test, expected_failure(abort_code = 5, location = kirisame::umbrella)]
    fun stale_cycle() { retire_case(true, 3); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun duplicate_retirement() { retire_case(true, 4); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun retired_cannot_dock() { retire_case(true, 5); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun retired_cannot_purchase() { retire_case(true, 6); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun retired_cannot_quarantine() { retire_case(true, 7); }
    #[test, expected_failure(abort_code = 3, location = kirisame::umbrella)]
    fun retired_cannot_review() { retire_case(true, 8); }
}
