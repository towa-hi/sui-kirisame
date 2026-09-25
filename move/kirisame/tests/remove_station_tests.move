#[test_only]
module kirisame::remove_station_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario;

    // Two actual deposits test omission protection, revocation and refunds.
    fun removal(mode: u8) {
        let mut scenario = test_scenario::begin(@0xA);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xA);
        let first = scenario.take_shared<Umbrella>();
        let first_id = object::id(&first);
        test_scenario::return_shared(first);
        umbrella::user_create_umbrella(coin::mint_for_testing<SUI>(30_000_000, scenario.ctx()), scenario.ctx());
        scenario.next_tx(@0xD);
        let mut second = scenario.take_shared<Umbrella>();
        let mut first = scenario.take_shared_by_id<Umbrella>(first_id);
        let (admin, cap, mut station) = umbrella::station_for_testing(@0xD, scenario.ctx());
        let clock = sui::clock::create_for_testing(scenario.ctx());
        umbrella::station_dock_umbrella(&cap, &mut station, &mut first, 0, &clock, scenario.ctx());
        umbrella::station_dock_umbrella(&cap, &mut station, &mut second, 0, &clock, scenario.ctx());
        assert!(umbrella::station_docked_count(&station) == 2);
        if (mode == 1) umbrella::admin_retire_station_umbrella(&admin, &mut station, &mut first, scenario.ctx());
        umbrella::admin_remove_station(&admin, &mut station);
        assert!(umbrella::station_is_removing(&station));
        if (mode == 2) umbrella::user_undock_umbrella(&mut station, &mut first,
            coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()), 0, &clock, scenario.ctx());
        if (mode == 3) umbrella::station_dock_umbrella(&cap, &mut station, &mut first, 0, &clock, scenario.ctx());
        if (mode == 4) umbrella::station_quarantine_umbrella(&cap, &station, &mut first, 0, &clock, scenario.ctx());
        umbrella::admin_retire_station_umbrella(&admin, &mut station, &mut first, scenario.ctx());
        assert!(umbrella::retired_for_testing(&first));
        assert!(umbrella::station_docked_count(&station) == 1);
        // Repeating removal cannot omit the remaining docked umbrella.
        umbrella::admin_remove_station(&admin, &mut station);
        assert!(umbrella::station_is_removing(&station));
        if (mode == 5) umbrella::admin_retire_station_umbrella(&admin, &mut station, &mut first, scenario.ctx());
        umbrella::admin_retire_station_umbrella(&admin, &mut station, &mut second, scenario.ctx());
        assert!(umbrella::retired_for_testing(&second));
        assert!(umbrella::station_docked_count(&station) == 0);
        assert!(umbrella::station_is_removed(&station));
        umbrella::admin_remove_station(&admin, &mut station);
        assert!(umbrella::station_is_removed(&station));
        let (supplier, _, owner, pending, escrow, holder, current, _, _, _, _, _, _, _, _) = umbrella::snapshot_for_testing(&first);
        assert!(supplier == @0xA && owner == option::some(@0xA));
        assert!(pending == 0 && escrow == 0 && holder.is_none() && current.is_none());
        assert!(umbrella::condition_status_for_testing(&first) == 1);
        test_scenario::return_shared(first);
        test_scenario::return_shared(second);
        transfer::public_transfer(admin, @0xD);
        transfer::public_transfer(cap, @0xD);
        transfer::public_share_object(station);
        clock.destroy_for_testing();
        scenario.next_tx(@0xA);
        let mut paid = 0;
        while (test_scenario::has_most_recent_for_address<Coin<SUI>>(@0xA)) {
            let payment = scenario.take_from_sender<Coin<SUI>>();
            paid = paid + payment.value();
            coin::burn_for_testing(payment);
        };
        assert!(paid == 60_000_000);
        scenario.end();
    }

    #[test] fun retires_all_and_refunds_once() { removal(0); }
    #[test, expected_failure(abort_code = 13, location = kirisame::umbrella)]
    fun cannot_retire_from_active_station() { removal(1); }
    #[test, expected_failure(abort_code = 12, location = kirisame::umbrella)]
    fun cannot_checkout_during_removal() { removal(2); }
    #[test, expected_failure(abort_code = 12, location = kirisame::umbrella)]
    fun cannot_dock_during_removal() { removal(3); }
    #[test, expected_failure(abort_code = 12, location = kirisame::umbrella)]
    fun cannot_quarantine_during_removal() { removal(4); }
    #[test, expected_failure(abort_code = 4, location = kirisame::umbrella)]
    fun cannot_count_same_umbrella_twice() { removal(5); }

    #[test]
    fun empty_station_removes_immediately() {
        let mut ctx = tx_context::dummy();
        let (admin, cap, mut station) = umbrella::station_for_testing(@0xD, &mut ctx);
        umbrella::admin_remove_station(&admin, &mut station);
        assert!(umbrella::station_is_removed(&station));
        assert!(umbrella::station_docked_count(&station) == 0);
        transfer::public_transfer(admin, @0xD);
        transfer::public_transfer(cap, @0xD);
        transfer::public_share_object(station);
    }
}
