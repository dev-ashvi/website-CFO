"""Tests for deterministic CFO signals."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.analytics.classification import (
    NEGATIVE_GROSS_MARGIN,
    POSITIVE_CM1_NEGATIVE_CM2,
)
from wyz_analytics.cfo_signals.generate import _profitability_signal, generate_cfo_signals
from wyz_analytics.cfo_signals.thresholds import DEFAULT_THRESHOLDS, SignalThresholds
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _signals_of_type(pack, signal_type):
    return [item for item in pack["signals"] if item["signal_type"] == signal_type]


def test_positive_cm1_negative_cm2_signal(beautyco_facts):
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="channel")
    stage_signals = _signals_of_type(pack, POSITIVE_CM1_NEGATIVE_CM2)
    assert stage_signals, "Expected at least one positive CM1 / negative CM2 channel signal"
    sample = stage_signals[0]
    assert float(sample["evidence"]["cm1_pct"] or 0) >= 0
    assert float(sample["evidence"]["cm2"] or 0) < 0


def test_negative_gross_margin_signal():
    signal = _profitability_signal(
        {
            "channel": "Test Channel",
            "net_revenue": 1_000_000,
            "gross_margin": -50_000,
            "gross_margin_pct": -0.05,
            "cm1": -80_000,
            "cm1_pct": -0.08,
            "cm2": -120_000,
            "cm2_pct": -0.12,
        },
        dimension="channel",
        filters={},
        thresholds=DEFAULT_THRESHOLDS,
        total_net=1_000_000,
        total_cm2=-120_000,
        caveats=[],
    )
    assert signal is not None
    assert signal.signal_type == NEGATIVE_GROSS_MARGIN


def test_negative_cm2_contributor(beautyco_facts):
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="sku")
    negative = _signals_of_type(pack, "NEGATIVE_CM2_CONTRIBUTOR")
    assert negative
    assert all(float(item["evidence"]["cm2"] or 0) < 0 for item in negative)


def test_top_cm2_contributor(beautyco_facts):
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="channel")
    top = _signals_of_type(pack, "TOP_CM2_CONTRIBUTOR")
    assert top
    assert float(top[0]["evidence"]["cm2"] or 0) > 0


def test_high_revenue_weak_contribution(beautyco_facts):
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="channel")
    weak_types = {"HIGH_REVENUE_LOW_CM2", "HIGH_REVENUE_NEGATIVE_CM2"}
    assert any(item["signal_type"] in weak_types for item in pack["signals"])


def test_top_and_negative_cm2_contributors(beautyco_facts):
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="channel")
    types = {item["signal_type"] for item in pack["signals"]}
    assert "TOP_CM2_CONTRIBUTOR" in types
    assert len(pack["highlighted"]) >= 1


def test_materiality_filters_small_rows(beautyco_facts):
    strict = SignalThresholds(min_revenue_share=0.25, min_abs_cm2=5_000_000)
    pack = generate_cfo_signals(beautyco_facts, filters={}, dimension="sku", thresholds=strict)
    for signal in pack["signals"]:
        assert signal["materiality"] >= 0.05 or signal["entity_type"] != "sku"


def test_filtered_context_signals(beautyco_facts):
    channels = beautyco_facts["channel"].unique().to_list()
    if not channels:
        pytest.skip("No channels")
    channel = channels[0]
    pack = generate_cfo_signals(
        beautyco_facts,
        filters={"channel": [channel]},
        dimension="category",
    )
    assert pack["scope"]["filters"]["channel"] == [channel]
    assert pack["summary"]["net_revenue"] <= float(beautyco_facts.filter(beautyco_facts["channel"] == channel)["net_revenue"].sum()) + 1


def test_no_growth_signal_without_history(beautyco_facts):
    pack = generate_cfo_signals(
        beautyco_facts,
        filters={"month_from": "2025-01", "month_to": "2025-01"},
        dimension="channel",
    )
    growth_types = {
        "HIGH_GROWTH_MARGIN_COMPRESSION",
        "HIGH_GROWTH_QUALITY_DETERIORATION",
        "DECLINING_REVENUE_MARGIN_EXPANSION",
        "DECLINING_REVENUE_QUALITY_IMPROVEMENT",
    }
    assert not any(signal["signal_type"] in growth_types for signal in pack["signals"])
