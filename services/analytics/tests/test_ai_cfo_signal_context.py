"""Phase 1B: Signal → AI CFO structured signal_context."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope, compute_scope_hash
from wyz_analytics.ai_cfo.signal_context import (
    SOURCE_CONVERSATION,
    SOURCE_CURRENT_SIGNAL,
    SOURCE_INVALID,
    SOURCE_STALE_DROPPED,
    build_signal_id,
    match_verified_signal,
    resolve_signal_context,
)
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame

LINEAGE = {
    "workspace_id": "local",
    "dataset_id": "beautyco",
    "dataset_version": 1,
    "mapping_version": "m1",
    "job_id": "job1",
    "engine_version": "test",
}


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _topic(*, scope_hash: str, dataset_id: str = "beautyco", **overrides):
    base = {
        "signal_type": "MARKETING_PRESSURE",
        "entity": "D2C Website",
        "dimension": "channel",
        "stage": "MARKETING",
        "label": "Marketing pressure",
        "economic_role": "MARKETING_PRESSURE",
        "scope_hash": scope_hash,
        "dataset_id": dataset_id,
        "signal_id": build_signal_id(
            dataset_id=dataset_id,
            scope_hash=scope_hash,
            signal_type="MARKETING_PRESSURE",
            dimension="channel",
            entity="D2C Website",
        ),
    }
    base.update(overrides)
    return base


def _ask(facts, filters, message, **kwargs):
    return run_ai_cfo_turn(
        facts,
        lineage=LINEAGE,
        analytical={"filters": filters, "surface": "margin", "dimension": kwargs.pop("dimension", "channel")},
        message=message,
        model=kwargs.pop("model", FakeAiCfoModel()),
        **kwargs,
    )


def test_b1_signal_context_payload_separate_from_filters(beautyco_facts):
    filters = {
        "channel": ["D2C Website"],
        "category": ["Lips"],
        "month_from": "2025-12",
        "month_to": "2026-03",
    }
    scope = build_financial_scope(dataset_id="beautyco", filters=filters)
    signal_context = _topic(scope_hash=scope["scope_hash"])
    signal_context["evidence"] = {"cm2": -99999}
    signal_context["filters"] = {"channel": ["Amazon"]}

    response = _ask(
        beautyco_facts,
        filters,
        "Explain this signal.",
        signal_context=signal_context,
    )
    assert response["scope"]["filters"]["channel"] == ["D2C Website"]
    assert response["scope"]["filters"]["category"] == ["Lips"]
    assert "Amazon" not in (response["scope"]["filters"].get("channel") or [])
    assert response["context"]["filters"]["channel"] == ["D2C Website"]
    topic = response["context"]["active_signal_topic"]
    assert topic["entity"] == "D2C Website"
    assert topic["signal_type"] == "MARKETING_PRESSURE"
    assert "evidence" not in (response["conversation"].get("signal_context") or {})
    assert response["telemetry"]["signal_context_present"] is True
    assert response["telemetry"]["signal_context_scope_match"] is True
    assert response["telemetry"]["signal_context_source"] == SOURCE_CURRENT_SIGNAL


def test_b2_ask_without_investigate_keeps_company_scope(beautyco_facts):
    company = build_financial_scope(dataset_id="beautyco", filters={})
    signal_context = _topic(scope_hash=company["scope_hash"])
    response = _ask(beautyco_facts, {}, "Explain this signal.", signal_context=signal_context)
    assert response["scope"]["filters"] == {}
    assert response["scope_hash"] == company["scope_hash"]
    assert response["context"]["active_signal_topic"]["entity"] == "D2C Website"
    assert response["scope"]["filters"].get("channel") in (None, [])


def test_b3_ask_after_investigate_same_scope(beautyco_facts):
    filters = {"channel": ["D2C Website"]}
    scope = build_financial_scope(dataset_id="beautyco", filters=filters)
    response = _ask(
        beautyco_facts,
        filters,
        "Explain this signal.",
        signal_context=_topic(scope_hash=scope["scope_hash"]),
    )
    assert response["scope"]["filters"]["channel"] == ["D2C Website"]
    assert response["telemetry"]["signal_context_scope_match"] is True
    assert response["conversation"]["signal_context"]["scope_hash"] == scope["scope_hash"]


def test_b4_stale_signal_context_mismatch(beautyco_facts):
    company = build_financial_scope(dataset_id="beautyco", filters={})
    current = {"channel": ["Amazon"], "category": ["Lips"]}
    response = _ask(
        beautyco_facts,
        current,
        "Explain this signal.",
        signal_context=_topic(scope_hash=company["scope_hash"]),
    )
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert response["scope"]["filters"]["category"] == ["Lips"]
    assert response["telemetry"]["signal_context_scope_match"] is False
    assert response["telemetry"]["signal_context_source"] == SOURCE_STALE_DROPPED
    assert response["context"]["active_signal_topic"] is None
    assert response["context"]["active_signal_verified"] is None
    assert response["conversation"].get("signal_context") is None


def test_b5_current_ui_scope_always_wins(beautyco_facts):
    d2c = build_financial_scope(dataset_id="beautyco", filters={"channel": ["D2C Website"]})
    current = {"channel": ["Amazon"], "category": ["Lips"]}
    response = _ask(
        beautyco_facts,
        current,
        "What's driving CM2?",
        signal_context=_topic(scope_hash=d2c["scope_hash"]),
    )
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert "D2C Website" not in (response["scope"]["filters"].get("channel") or [])
    envelope = response["context"]["evidence_envelope"]
    assert envelope["scope_hash"] == response["scope_hash"]
    assert envelope["current_scope"]["filters"]["channel"] == ["Amazon"]


def test_b6_same_scope_followup_inherits_signal_topic(beautyco_facts):
    filters = {"channel": ["D2C Website"]}
    scope = build_financial_scope(dataset_id="beautyco", filters=filters)
    first = _ask(
        beautyco_facts,
        filters,
        "Explain this signal.",
        signal_context=_topic(scope_hash=scope["scope_hash"]),
    )
    previous = [
        {
            "question": "Explain this signal.",
            "scope_hash": first["scope_hash"],
            "signal_context": first["conversation"]["signal_context"],
            "selected_entities": first["conversation"]["selected_entities"],
            "selected_evidence_ids": first["conversation"]["selected_evidence_ids"],
        }
    ]
    second = _ask(
        beautyco_facts,
        filters,
        "Why?",
        conversation_id=first["conversation"]["conversation_id"],
        previous_turns=previous,
        signal_context=None,
    )
    assert second["telemetry"]["signal_context_source"] == SOURCE_CONVERSATION
    assert second["context"]["active_signal_topic"]["entity"] == "D2C Website"
    assert second["telemetry"]["signal_context_scope_match"] is True


def test_b7_scope_change_invalidates_signal_grounding(beautyco_facts):
    filters = {"channel": ["D2C Website"]}
    scope = build_financial_scope(dataset_id="beautyco", filters=filters)
    first = _ask(
        beautyco_facts,
        filters,
        "Explain this signal.",
        signal_context=_topic(scope_hash=scope["scope_hash"]),
    )
    previous = [
        {
            "question": "Explain this signal.",
            "scope_hash": first["scope_hash"],
            "signal_context": first["conversation"]["signal_context"],
            "selected_evidence_ids": first["conversation"]["selected_evidence_ids"],
            "selected_entities": first["conversation"]["selected_entities"],
        }
    ]
    second = _ask(
        beautyco_facts,
        {"channel": ["Amazon"], "category": ["Lips"]},
        "Why?",
        conversation_id=first["conversation"]["conversation_id"],
        previous_turns=previous,
    )
    assert second["scope"]["filters"]["channel"] == ["Amazon"]
    assert second["context"]["active_signal_topic"] is None


def test_b8_and_acceptance_fake_values_ignored(beautyco_facts):
    scope = build_financial_scope(dataset_id="beautyco", filters={})
    dirty = _topic(scope_hash=scope["scope_hash"])
    dirty["evidence"] = {"cm2": -1_000_000, "fabricated": True}
    dirty["filters"] = {"channel": ["ShouldNotApply"]}
    dirty["cm2"] = -1_000_000
    response = _ask(beautyco_facts, {}, "Explain this signal.", signal_context=dirty)
    assert response["scope"]["filters"] == {}
    lean = response["conversation"]["signal_context"]
    assert lean is not None
    assert "evidence" not in lean
    assert "cm2" not in lean
    assert "filters" not in lean


def test_invalid_signal_context_fails_closed(beautyco_facts):
    response = _ask(
        beautyco_facts,
        {},
        "What's driving CM2?",
        signal_context={"signal_type": "X", "entity": "Y"},
    )
    assert response["answer"]["headline"]
    assert response["telemetry"]["signal_context_valid"] is False
    assert response["context"]["active_signal_topic"] is None


def test_dataset_mismatch_drops_signal_context(beautyco_facts):
    scope = build_financial_scope(dataset_id="beautyco", filters={})
    response = _ask(
        beautyco_facts,
        {},
        "Explain this signal.",
        signal_context=_topic(scope_hash=scope["scope_hash"], dataset_id="other-ds"),
    )
    assert response["telemetry"]["signal_context_source"] == SOURCE_INVALID
    assert response["context"]["active_signal_topic"] is None


def test_verified_signal_match_and_topic_only():
    scope = build_financial_scope(dataset_id="beautyco", filters={})
    verified = [
        {
            "signal_type": "MARKETING_PRESSURE",
            "entity": "D2C Website",
            "entity_type": "channel",
            "stage": "MARKETING",
            "label": "Marketing pressure",
        }
    ]
    matched = resolve_signal_context(
        _topic(scope_hash=scope["scope_hash"]),
        current_scope=scope,
        verified_signals=verified,
    )
    assert matched["matched_verified_signal"] is True
    assert matched["grounding_allowed"] is True

    unmatched = resolve_signal_context(
        _topic(scope_hash=scope["scope_hash"], signal_type="DOES_NOT_EXIST"),
        current_scope=scope,
        verified_signals=verified,
    )
    assert unmatched["matched_verified_signal"] is False
    assert unmatched["grounding_allowed"] is False
    assert unmatched["active_signal_topic"]["signal_type"] == "DOES_NOT_EXIST"


def test_match_verified_signal_helper():
    topic = {"signal_type": "MARKETING_PRESSURE", "entity": "D2C Website", "dimension": "channel"}
    assert match_verified_signal(
        topic, [{"signal_type": "MARKETING_PRESSURE", "entity": "Amazon", "entity_type": "channel"}]
    ) is None
    assert (
        match_verified_signal(
            topic,
            [{"signal_type": "MARKETING_PRESSURE", "entity": "D2C Website", "entity_type": "channel"}],
        )["entity"]
        == "D2C Website"
    )


def test_investigate_vs_ask_scope_hash_identity():
    company = compute_scope_hash("beautyco", {})
    narrowed = compute_scope_hash("beautyco", {"channel": ["D2C Website"]})
    assert company != narrowed
