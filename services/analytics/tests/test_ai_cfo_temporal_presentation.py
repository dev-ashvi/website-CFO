"""Temporal ChangeEvidence presentation — display only; raw math untouched."""

from __future__ import annotations

from wyz_analytics.ai_cfo.change_evidence import (
    ChangeEvidence,
    change_to_evidence_item,
    compose_temporal_answer,
)
from wyz_analytics.ai_cfo.followup import ComparisonBasis
from wyz_analytics.ai_cfo.presentation import (
    economic_direction_for_metric,
    format_comparison_period_label,
    format_period_label,
    format_signed_delta,
    present_change_evidence,
)
from wyz_analytics.ai_cfo.semantic_contract import InsightType


def test_cm2_currency_movement_and_display_delta():
    raw_from, raw_to = 5681.6, 11901.2
    raw_delta = raw_to - raw_from
    presented = present_change_evidence(
        metric="cm2",
        from_period="2025-12",
        to_period="2026-03",
        from_value=raw_from,
        to_value=raw_to,
        absolute_change=raw_delta,
    )
    display = presented["display"]
    assert display["label"] == "CM2"
    assert display["formatted_from"] == "₹5,682"
    assert display["formatted_to"] == "₹11,901"
    assert display["formatted_delta"] == "+₹6,219"
    assert display["delta_format_type"] == "currency"
    assert display["movement_direction"] == "INCREASE"
    assert display["economic_direction"] == "IMPROVED"
    # Raw values preserved
    assert presented["from_value"] == raw_from
    assert presented["to_value"] == raw_to
    assert presented["absolute_change"] == raw_delta
    assert presented["display_delta"] == 6219.0


def test_cm2_margin_percentage_points():
    presented = present_change_evidence(
        metric="cm2_pct",
        from_period="2025-12",
        to_period="2026-03",
        from_value=0.004,
        to_value=0.008,
        absolute_change=0.004,
    )
    display = presented["display"]
    assert display["label"] == "CM2 Margin"
    assert display["formatted_from"] == "0.4%"
    assert display["formatted_to"] == "0.8%"
    assert display["formatted_delta"] == "+0.4 pp"
    assert display["delta_format_type"] == "percentage_points"
    assert "→" in display["formatted_range"]
    assert display["context"] is None


def test_negative_margin_percentage_points():
    presented = present_change_evidence(
        metric="cm2_pct",
        from_period="2025-12",
        to_period="2026-03",
        from_value=0.08,
        to_value=0.05,
        absolute_change=-0.03,
    )
    assert presented["display"]["formatted_from"] == "8.0%"
    assert presented["display"]["formatted_to"] == "5.0%"
    assert presented["display"]["formatted_delta"] == "-3.0 pp"
    assert presented["display"]["movement_direction"] == "DECREASE"
    assert presented["display"]["economic_direction"] == "DETERIORATED"


def test_net_revenue_currency_formatter():
    presented = present_change_evidence(
        metric="net_revenue",
        from_period="2025-12",
        to_period="2026-03",
        from_value=1_460_000,
        to_value=1_470_000,
        absolute_change=10_000,
    )
    assert presented["display"]["label"] == "Net Revenue"
    assert "L" in presented["display"]["formatted_from"]
    assert presented["display"]["format_type"] == "currency"


def test_comparison_period_formatting():
    assert format_period_label("2025-12") == "Dec 2025"
    assert format_period_label("2026-03") == "Mar 2026"
    assert format_comparison_period_label("2025-12", "2026-03") == "Dec 2025 → Mar 2026"
    assert "…" not in format_comparison_period_label("2025-12", "2026-03")
    assert "2025-12 → 2" not in format_comparison_period_label("2025-12", "2026-03")


def test_economic_direction_only_where_defined():
    assert economic_direction_for_metric("cm2", "INCREASE") == "IMPROVED"
    assert economic_direction_for_metric("return_pct", "INCREASE") == "DETERIORATED"
    assert economic_direction_for_metric("marketing_pct", "INCREASE") == "UNKNOWN"
    assert economic_direction_for_metric("unknown_metric", "INCREASE") == "UNKNOWN"


def test_presentation_does_not_mutate_raw_change_evidence():
    change = ChangeEvidence(
        metric="cm2",
        from_period="2025-12",
        to_period="2026-03",
        from_value=5681.6,
        to_value=11901.2,
        absolute_change=6219.6,
        percentage_change=1.095,
        direction="up",
        scope_hash="abc",
        basis="WITHIN_PERIOD",
        evidence_id="change:test:cm2",
    )
    item = change_to_evidence_item(change)
    assert change.from_value == 5681.6
    assert change.to_value == 11901.2
    assert change.absolute_change == 6219.6
    assert item["absolute_change"] == 6219.6
    assert item["display"]["label"] == "CM2"


def test_compose_temporal_answer_presentation_shape():
    changes = [
        ChangeEvidence(
            metric="cm2",
            from_period="2025-12",
            to_period="2026-03",
            from_value=5681.6,
            to_value=11901.2,
            absolute_change=6219.6,
            percentage_change=None,
            direction="up",
            scope_hash="s",
            basis="WITHIN_PERIOD",
            evidence_id="change:1:cm2",
        ),
        ChangeEvidence(
            metric="cm2_pct",
            from_period="2025-12",
            to_period="2026-03",
            from_value=0.004,
            to_value=0.008,
            absolute_change=0.004,
            percentage_change=None,
            direction="up",
            scope_hash="s",
            basis="WITHIN_PERIOD",
            evidence_id="change:1:cm2_pct",
        ),
    ]
    answer = compose_temporal_answer(
        changes=changes,
        primary=changes[0],
        insight=InsightType.MARGIN_IMPROVEMENT,
        context={"meta": {"context_version": "t"}, "caveats": []},
        basis=ComparisonBasis.WITHIN_PERIOD,
    )
    assert answer["comparison"]["label"] == "Dec 2025 → Mar 2026"
    assert answer["evidence"][0]["display"]["label"] == "CM2"
    assert answer["evidence"][0]["display"]["context"] is None
    assert "pp" in answer["evidence"][1]["display"]["formatted_delta"]
    assert "get_trend" not in (answer.get("methodology") or "")
    assert "FinancialScope" not in (answer.get("methodology") or "")
    assert "verified monthly financial data" in (answer.get("methodology") or "").lower()
    assert "leading verified contributor" not in (answer.get("headline") or "").lower()


def test_signed_delta_percentage_points_helper():
    out = format_signed_delta("cm2_pct", from_value=0.004, to_value=0.008, raw_delta=0.004)
    assert out["formatted"] == "+0.4 pp"
    assert out["delta_format_type"] == "percentage_points"
