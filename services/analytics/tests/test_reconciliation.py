def test_reconciliation_passes(beautyco_result):
    report = beautyco_result.reconciliation
    failed = [check for check in report.checks if not check["ok"]]
    assert report.ok, failed


def test_cm1_and_marketing_are_fully_allocated(beautyco_result):
    names = {check["name"]: check for check in beautyco_result.reconciliation.checks}
    assert names["cm1_costs_match_settlements"]["ok"]
    assert names["cm1_costs_allocated_to_lines"]["ok"]
    assert names["marketing_allocated_to_source"]["ok"]
    assert names["unmapped_platform_spend"]["ok"]
    assert names["unmatched_sku_rows"]["ok"]
    assert names["order_settlement_grain"]["ok"]
    assert names["waterfall_cm2"]["ok"]
