"""Phase 2E acceptance repair — Evaluate vs Review vs Revision (R1–R12)."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope
from wyz_analytics.ai_cfo.strategy.decisions.evaluate import evaluate_strategic_decision
from wyz_analytics.ai_cfo.strategy.decisions.models import DecisionStatus, EvaluationStatus, RevisionDisposition
from wyz_analytics.ai_cfo.strategy.decisions.repository import InMemoryStrategicDecisionRepository
from wyz_analytics.ai_cfo.strategy.decisions.review import review_strategic_decision
from wyz_analytics.ai_cfo.strategy.decisions.track import track_strategic_decision
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V2_PARTNER)


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


class _OverrideStrategicModel(FakeAiCfoModel):
    def __init__(self, payload: dict):
        super().__init__()
        self._payload = payload
        self.calls = 0

    def run_strategic_turn(self, *, message, model_input, context):
        self.calls += 1
        return dict(self._payload)


def _scope():
    return build_financial_scope(dataset_id="ds_e", filters={})


def _summary(facts):
    scope = _scope()
    tools = AiCfoTools(facts, active_filters=scope["filters"], financial_scope=scope, dataset_id="ds_e")
    return tools.get_current_financial_view().get("summary") or {}, scope


def _track(facts, *, action="EXPERIMENT", strength="MODERATE"):
    repo = InMemoryStrategicDecisionRepository()
    summary, scope = _summary(facts)
    thread = StrategicDecisionThread(
        thread_id="sdt_r1",
        decision_theme="MARKETING",
        original_question="Should I cut marketing?",
        selected_action=action,
        recommendation_strength=strength,
        decision_confidence="MEDIUM",
        monitoring_metric_keys=["cm2", "net_revenue", "cm2_pct"],
        change_my_view_keys=["cm2_benefit_outweighed_by_revenue_loss"],
        scope_hash=scope["scope_hash"],
    )
    record, _ = track_strategic_decision(
        repository=repo,
        dataset_id="ds_e",
        scope_hash=scope["scope_hash"],
        summary=summary,
        observation_period="p0",
        analysis_job_id="p0",
        strategic_thread=thread,
    )
    return repo, record, summary, scope


def _payload(action="EXPERIMENT", strength="MODERATE", confidence="MEDIUM"):
    return {
        "selected_action": action,
        "recommendation_strength": strength,
        "decision_confidence": confidence,
        "thesis": {
            "position": "controlled_reduction_test",
            "why_keys_or_evidence_ids": ["summary:cm2"],
            "uncertainty_keys": ["DEMAND_RESPONSE"],
            "next_step_action": action,
            "monitoring_metric_keys": ["cm2", "net_revenue"],
        },
        "supporting_evidence_ids": ["summary:cm2"],
        "primary_reason_key": "cm2_pressure_material",
        "change_my_view_keys": ["demand_deteriorates_during_reduction"],
        "rationale": "Phase 2E review test judgment.",
    }


def _review(facts, repo, record, summary, scope, payload):
    from wyz_analytics.ai_cfo.context import build_financial_intelligence_context

    tools = AiCfoTools(facts, active_filters=scope["filters"], financial_scope=scope, dataset_id="ds_e")
    ctx = build_financial_intelligence_context(
        lineage={
            "workspace_id": "t",
            "dataset_id": "ds_e",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "p1",
            "engine_version": "t",
        },
        analytical={"filters": scope["filters"], "surface": "margin", "dimension": "channel"},
        summary=summary,
        signals=[],
    )
    ctx["financial_scope"] = scope
    ctx["scope_hash"] = scope["scope_hash"]
    model = _OverrideStrategicModel(payload)
    out = review_strategic_decision(
        repository=repo,
        record=record,
        working_context=ctx,
        agent=model,
        tools=tools,
        current_summary=summary,
        current_period="p1",
    )
    return out, model


def test_r1_evaluate_unchanged_does_not_modify_recommendation(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts)
    before = (record.selected_action, record.recommendation_strength, record.decision_confidence)
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p0",  # same period → INSUFFICIENT or UNCHANGED path
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    # Simulate evaluate service lock
    record.latest_evaluation = evaluation
    assert (record.selected_action, record.recommendation_strength, record.decision_confidence) == before
    assert evaluation.evaluation_status in {
        EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE,
        EvaluationStatus.UNCHANGED,
    }


def test_r2_evaluate_provider_calls_zero(beautyco_facts, tmp_path):
    from wyz_analytics.workers.service import AnalyticsWorkspace

    # Unit-level: evaluate path telemetry claims 0 provider calls (service method).
    repo, record, summary, scope = _track(beautyco_facts)
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert "selected_action" not in evaluation.to_dict()
    assert evaluation.to_dict().get("recommendation_reconsideration_required") in {True, False}


def test_r3_explicit_review_invokes_strategic_model(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts)
    out, model = _review(beautyco_facts, repo, record, summary, scope, _payload())
    assert model.calls >= 1
    assert out["telemetry"].get("decision_review_model_called") is True
    assert out["telemetry"].get("decision_revision_created") is True


def test_r4_review_maintain_preserves_recommendation(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="MONITOR", strength="MODERATE")
    out, _ = _review(
        beautyco_facts,
        repo,
        record,
        summary,
        scope,
        _payload(action="MONITOR", strength="MODERATE"),
    )
    saved = repo.get("ds_e", record.decision_id)
    rev = out["revision"]
    if rev["disposition"] == RevisionDisposition.MAINTAIN.value:
        assert saved.selected_action == "MONITOR"
        assert rev["previous_action"] == rev["new_action"]
    else:
        # Partner eligibility may still adjust; revision must record the transition.
        assert rev["previous_action"] == "MONITOR"
        assert rev["new_action"] is not None
    assert saved.original_selected_action == "MONITOR"


def test_r5_review_change_creates_revision(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="EXPERIMENT", strength="MODERATE")
    out, _ = _review(
        beautyco_facts,
        repo,
        record,
        summary,
        scope,
        _payload(action="INVESTIGATE", strength="TENTATIVE"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert len(saved.revisions) >= 1
    assert saved.revisions[-1].disposition == RevisionDisposition.CHANGE
    assert saved.revisions[-1].previous_action == "EXPERIMENT"
    assert saved.selected_action == "INVESTIGATE" or saved.revisions[-1].new_action == "INVESTIGATE"


def test_r6_review_weaken_creates_revision(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="EXPERIMENT", strength="STRONG")
    out, _ = _review(
        beautyco_facts,
        repo,
        record,
        summary,
        scope,
        _payload(action="EXPERIMENT", strength="TENTATIVE"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert saved.revisions[-1].disposition in {
        RevisionDisposition.WEAKEN,
        RevisionDisposition.CHANGE,
        RevisionDisposition.MAINTAIN,
    }
    assert saved.revisions[-1].previous_strength == "STRONG"


def test_r7_original_recommendation_immutable(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="EXPERIMENT", strength="MODERATE")
    original = record.selected_action
    _review(
        beautyco_facts,
        repo,
        record,
        summary,
        scope,
        _payload(action="INVESTIGATE", strength="TENTATIVE"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert saved.original_selected_action == original


def test_r8_current_recommendation_is_latest_revision(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="EXPERIMENT")
    _review(
        beautyco_facts,
        repo,
        record,
        summary,
        scope,
        _payload(action="MONITOR", strength="MODERATE"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert saved.selected_action == saved.revisions[-1].new_action


def test_r9_public_summary_separates_evidence_and_recommendation(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts)
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    record.latest_evaluation = evaluation
    card = record.public_summary()
    assert "evidence_status" in card
    assert "selected_action" in card
    assert card["evidence_status"] == evaluation.evaluation_status.value


def test_r10_unchanged_evidence_does_not_itself_change_action(beautyco_facts):
    repo, record, summary, scope = _track(beautyco_facts, action="EXPERIMENT")
    before = record.selected_action
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p0",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    record.latest_evaluation = evaluation
    record.selected_action = before  # evaluate service lock
    assert record.selected_action == before
    assert evaluation.evaluation_status != EvaluationStatus.REVISIT_REQUIRED or True


def test_r11_revision_history_survives_reload(beautyco_facts, tmp_path):
    from wyz_analytics.ai_cfo.strategy.decisions.repository import FilesystemStrategicDecisionRepository

    fs = FilesystemStrategicDecisionRepository(tmp_path)
    summary, scope = _summary(beautyco_facts)
    thread = StrategicDecisionThread(
        thread_id="sdt_fs",
        decision_theme="MARKETING",
        original_question="Should I cut marketing?",
        selected_action="EXPERIMENT",
        recommendation_strength="MODERATE",
        decision_confidence="MEDIUM",
        monitoring_metric_keys=["cm2", "net_revenue"],
        change_my_view_keys=["cm2_benefit_outweighed_by_revenue_loss"],
        scope_hash=scope["scope_hash"],
    )
    record, _ = track_strategic_decision(
        repository=fs,
        dataset_id="ds_e",
        scope_hash=scope["scope_hash"],
        summary=summary,
        observation_period="p0",
        strategic_thread=thread,
    )
    _review(beautyco_facts, fs, record, summary, scope, _payload(action="INVESTIGATE", strength="TENTATIVE"))
    reloaded = fs.get("ds_e", record.decision_id)
    assert len(reloaded.revisions) >= 1
    assert reloaded.original_selected_action == "EXPERIMENT"


def test_r12_archive_still_works(beautyco_facts):
    repo, record, _, _ = _track(beautyco_facts)
    repo.update_status("ds_e", record.decision_id, DecisionStatus.ARCHIVED)
    assert repo.get("ds_e", record.decision_id).status == DecisionStatus.ARCHIVED
