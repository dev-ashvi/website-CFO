"""Regression: authoritative SYSTEM QUALITY gate uses numeric-claim grounding."""

from __future__ import annotations

from wyz_analytics.ai_cfo.benchmark.cases import DEFAULT_GATES
from wyz_analytics.ai_cfo.benchmark.report import format_report
from wyz_analytics.ai_cfo.benchmark.runner import aggregate_model_results, choose_recommendation


def _categories(*, num: int = 2, filt: int = 2, tool: int = 2, halluc: int = 2) -> dict:
    return {
        "numerical_grounding": num,
        "filter_adherence": filt,
        "margin_stage": 2,
        "tool_behavior": tool,
        "materiality": 2,
        "caveat_awareness": 2,
        "hallucination_scope": halluc,
    }


def _case(
    case_id: str,
    *,
    num: int = 2,
    claim_count: int = 0,
    grounded_count: int = 0,
    total: int = 14,
    status: str = "PASS",
    material_violation: bool = False,
) -> dict:
    return {
        "case_id": case_id,
        "scored": True,
        "status": status,
        "categories": _categories(num=num),
        "total": total,
        "max_total": 14,
        "latency_ms": 2500,
        "answer_source": "model_semantic",
        "answer_origin": "MODEL_SEMANTIC",
        "numeric_claim_count": claim_count,
        "grounded_numeric_claim_count": grounded_count,
        "material_violation": material_violation,
        "telemetry": {
            "model_calls": 1,
            "response_validation": {
                "valid": True,
                "initial_response_valid": True,
                "correction_attempted": False,
                "deterministic_fallback_used": False,
                "numeric_claims_generated": claim_count,
            },
        },
    }


def test_scope_control_num1_does_not_fail_authoritative_gate():
    """Exact live shape: 11/11 PASS, Q1–Q8 num=2, Q9–Q11 num=1, claims 100% grounded."""
    cases = [_case(f"Q{i}", num=2, claim_count=5, grounded_count=5, total=14) for i in range(1, 9)]
    cases.extend(
        [
            _case("Q9", num=1, claim_count=0, grounded_count=0, total=13),
            _case("Q10", num=1, claim_count=0, grounded_count=0, total=13),
            _case("Q11", num=1, claim_count=0, grounded_count=0, total=13),
        ]
    )

    agg = aggregate_model_results("openai/gpt-oss-20b", cases, DEFAULT_GATES)
    metrics = agg["metrics"]
    system = agg["system_quality"]

    assert metrics["fully_grounded_question_rate"] == round(8 / 11, 3)  # ~73% diagnostic
    assert metrics["numeric_claim_grounding_rate"] == 1.0
    assert system["numeric_claim_grounding_rate"] == 1.0
    assert system["pass_count"] == 11
    assert system["material_violation_count"] == 0
    assert agg["gate_pass"] is True
    assert system["gate_pass"] is True
    assert agg["recommendation_eligible"] is True
    assert agg.get("reason") is None

    decision = choose_recommendation([agg])
    assert decision["recommended"] == "openai/gpt-oss-20b"

    report = format_report(
        {
            "live": True,
            "models": [agg],
            "decision": decision,
            "case_ids": [c["case_id"] for c in cases],
        }
    )
    assert "Recommended WYZ V1 model: openai/gpt-oss-20b" in report
    assert "gate=PASS" in report
    assert "Gate failure:" not in report
    assert "diagnostic: fully_grounded_questions=" in report
    # Ranking Gate column and SYSTEM QUALITY must agree.
    assert "| PASS |" in report


def test_unsupported_numeric_claims_still_fail_grounding_gate():
    cases = [_case(f"Q{i}", num=2, claim_count=5, grounded_count=5, status="PASS") for i in range(1, 10)]
    # Many unsupported claims on an otherwise PASS answer (num=1 ≠ material wrong).
    cases.append(_case("Q10", num=1, claim_count=30, grounded_count=0, status="PASS", total=12))
    cases.append(_case("Q11", num=1, claim_count=0, grounded_count=0, status="PASS", total=12))

    agg = aggregate_model_results("openai/gpt-oss-20b", cases, DEFAULT_GATES)
    # 45 grounded / 75 claims = 0.6
    assert agg["metrics"]["numeric_claim_grounding_rate"] == 0.6
    assert agg["gate_pass"] is False
    assert agg["system_quality"]["gate_pass"] is False
    assert "numeric claim grounding below threshold" in (agg.get("reason") or "")

    decision = choose_recommendation([agg])
    assert decision["recommended"] is None
    report = format_report({"live": True, "models": [agg], "decision": decision})
    assert "Recommended WYZ V1 model: none" in report
    assert "gate=FAIL" in report
    assert "| FAIL |" in report


def test_report_ranking_gate_matches_system_quality():
    cases = [_case(f"Q{i}", num=2, claim_count=4, grounded_count=4) for i in range(1, 9)]
    cases.extend([_case(f"Q{i}", num=1, claim_count=0, grounded_count=0) for i in range(9, 12)])
    agg = aggregate_model_results("openai/gpt-oss-20b", cases, DEFAULT_GATES)
    assert agg["gate_pass"] is True
    assert agg["system_quality"]["gate_pass"] is True
    # Old mistaken gate would have failed on ~73% fully grounded questions.
    assert agg["metrics"]["fully_grounded_question_rate"] < 0.95
    assert agg["metrics"]["numeric_claim_grounding_rate"] >= 0.95
