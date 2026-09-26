#[test_only]
module kirisame::kirisame_tests {
    use kirisame::umbrella::{Self, Umbrella};
    use sui::sui::SUI;

    #[test]
    fun test_create_umbrella() {
        let supplier = @0xA;
        let mut scenario = sui::test_scenario::begin(supplier);
        let bond = sui::coin::mint_for_testing<SUI>(30_000_000, scenario.ctx());
        umbrella::user_create_umbrella(bond, 0, b"Test umbrella".to_string(), scenario.ctx());
        scenario.next_tx(supplier);

        let umbrella = scenario.take_shared<Umbrella>();
        let (
            recorded_supplier,
            is_created,
            pending_condition_owner,
            pending_condition,
            active_escrow,
            holder,
            current_station_id,
            checkout_station_id,
            checkout_payout_address,
            checkout_time_ms,
            inspection_deadline_ms,
            owner_count,
            purchase_price,
            condition_bond,
            fee_per_ms,
        ) = umbrella::snapshot_for_testing(&umbrella);
        assert!(umbrella::color(&umbrella) == 0);
        assert!(umbrella::name(&umbrella) == &b"Test umbrella".to_string());
        assert!(recorded_supplier == supplier);
        assert!(is_created);
        assert!(pending_condition_owner == option::some(supplier));
        assert!(pending_condition == 30_000_000);
        assert!(active_escrow == 0);
        assert!(holder.is_none());
        assert!(current_station_id.is_none());
        assert!(checkout_station_id.is_none());
        assert!(checkout_payout_address.is_none());
        assert!(checkout_time_ms == 0);
        assert!(inspection_deadline_ms == 0);
        assert!(owner_count == 0);
        assert!(purchase_price == 100_000_000);
        assert!(condition_bond == 30_000_000);
        assert!(fee_per_ms == 0);
        let (docked, condition_amount, condition_cycle, pending) = umbrella::docking_snapshot_for_testing(&umbrella);
        assert!(!docked && pending);
        assert!(condition_amount == 30_000_000 && condition_cycle == 0);

        sui::test_scenario::return_shared(umbrella);
        scenario.end();
    }

    #[test]
    fun test_create_umbrella_colors() {
        let mut color = 0u8;
        while (color <= 2) {
            let mut scenario = sui::test_scenario::begin(@0xA);
            let bond = sui::coin::mint_for_testing<SUI>(30_000_000, scenario.ctx());
            umbrella::user_create_umbrella(bond, color, b"Test umbrella".to_string(), scenario.ctx());
            scenario.next_tx(@0xA);
            let umbrella = scenario.take_shared<Umbrella>();
            assert!(umbrella::color(&umbrella) == color);
            sui::test_scenario::return_shared(umbrella);
            scenario.end();
            color = color + 1;
        };
    }

    #[test]
    #[expected_failure(abort_code = 14, location = kirisame::umbrella)]
    fun test_create_umbrella_invalid_color() {
        let mut ctx = tx_context::dummy();
        let bond = sui::coin::mint_for_testing<SUI>(30_000_000, &mut ctx);
        umbrella::user_create_umbrella(bond, 3, b"Test umbrella".to_string(), &mut ctx);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = kirisame::umbrella)]
    fun test_create_umbrella_underpayment() {
        let mut ctx = tx_context::dummy();
        umbrella::user_create_umbrella(sui::coin::mint_for_testing<SUI>(29_999_999, &mut ctx), 0, b"Test umbrella".to_string(), &mut ctx);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = kirisame::umbrella)]
    fun test_create_umbrella_overpayment() {
        let mut ctx = tx_context::dummy();
        umbrella::user_create_umbrella(sui::coin::mint_for_testing<SUI>(30_000_001, &mut ctx), 0, b"Test umbrella".to_string(), &mut ctx);
    }
    #[test]
    #[expected_failure(abort_code = 16, location = kirisame::umbrella)]
    fun test_create_umbrella_empty_name() {
        let mut ctx = tx_context::dummy();
        let bond = sui::coin::mint_for_testing<SUI>(30_000_000, &mut ctx);
        umbrella::user_create_umbrella(bond, 0, b"".to_string(), &mut ctx);
    }

    #[test]
    #[expected_failure(abort_code = 16, location = kirisame::umbrella)]
    fun test_create_umbrella_long_name() {
        let mut ctx = tx_context::dummy();
        let bond = sui::coin::mint_for_testing<SUI>(30_000_000, &mut ctx);
        let mut bytes = vector[];
        let mut i = 0;
        while (i < 257) { bytes.push_back(65); i = i + 1; };
        umbrella::user_create_umbrella(bond, 0, bytes.to_string(), &mut ctx);
    }

}
