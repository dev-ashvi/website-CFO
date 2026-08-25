from __future__ import annotations

INR_TOL = 0.05
PCT_TOL = 1e-9


def test_company_waterfall_matches_golden_workbook(beautyco_result, expected):
    actual = beautyco_result.waterfall
    gold = expected["company_waterfall_inr"]
    rates = expected["company_rates"]

    assert actual.gross_revenue == pytest_approx(gold["gross_revenue"])
    assert actual.discounts == pytest_approx(gold["discounts"])
    assert actual.returns_rto_cancellations == pytest_approx(gold["returns_rto_cancellations"])
    assert actual.net_revenue == pytest_approx(gold["net_revenue"])
    assert actual.product_cogs == pytest_approx(gold["product_cogs"])
    assert actual.gross_margin == pytest_approx(gold["gross_margin"])
    assert actual.cm1_costs == pytest_approx(gold["cm1_costs"])
    assert actual.cm1 == pytest_approx(gold["cm1"])
    assert actual.marketing_spend == pytest_approx(gold["marketing_spend"])
    assert actual.cm2 == pytest_approx(gold["cm2"])
    assert actual.gross_margin_pct == pytest_approx(rates["gross_margin_pct"], PCT_TOL)
    assert actual.cm1_pct == pytest_approx(rates["cm1_pct"], PCT_TOL)
    assert actual.cm2_pct == pytest_approx(rates["cm2_pct"], PCT_TOL)


def test_engine_does_not_hard_code_company_totals():
    from pathlib import Path

    engine_root = Path(__file__).resolve().parents[1] / "src" / "wyz_analytics"
    banned = ["16.22", "14.14", "162214069", "141371321.67", "23490374"]
    blob = "\n".join(path.read_text(encoding="utf-8") for path in engine_root.rglob("*.py"))
    for token in banned:
        assert token not in blob, f"engine source must not hard-code {token}"


def pytest_approx(value, abs_tol=INR_TOL):
    return _Approx(value, abs_tol)


class _Approx:
    def __init__(self, expected: float, abs_tol: float):
        self.expected = float(expected)
        self.abs_tol = abs_tol

    def __eq__(self, actual: object) -> bool:
        return abs(float(actual) - self.expected) <= self.abs_tol

    def __repr__(self) -> str:
        return f"approx({self.expected}, abs={self.abs_tol})"
