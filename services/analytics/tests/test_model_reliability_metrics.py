"""System-quality vs model-reliability metric split."""

from __future__ import annotations

from wyz_analytics.ai_cfo.benchmark.runner import aggregate_model_results, classify_answer_origin


def _perfect(case_id: str, *, source: str, fallback: bool = False, initial_valid: bool = True) -> dict:
    return {
        "case_id": case_id,
        "scored": True,
        "status": "PASS",
        "categories": {
            "numerical_grounding": 2,
            "filter_adherence": 2,
            "margin_stage": 2,
            "tool_behavior": 2,
            "materiality": 2,
            "caveat_awareness": 2,
            "hallucination_scope": 2,
        },
        "total": 14,
        "max_total": 14,
        "latency_ms": 1000,
        "answer_source": source,
        "answer_origin": classify_answer_origin(source),
        "telemetry": {
            "model_calls": 2 if fallback else 1,
            "response_validation": {
                "valid": not fallback,
                "initial_response_valid": initial_valid,
                "correction_attempted": fallback,
                "correction_succeeded": False,
                "correction_valid": False,
                "deterministic_fallback_used": fallback,
                "violations": ["malformed_schema:unstructured_or_non_json_answer"] if fallback else [],
                "initial_parse_status": "json_object" if initial_valid else "truncated",
            },
        },
    }


def test_origin_mapping():
    assert classify_answer_origin("model") == "MODEL_NATIVE"
    assert classify_answer_origin("corrected_model") == "MODEL_CORRECTED"
    assert classify_answer_origin("model_with_forced_tool") == "MODEL_WITH_FORCED_TOOL"
    assert classify_answer_origin("deterministic_guard") == "DETERMINISTIC_GUARD"
    assert classify_answer_origin("deterministic_fallback") == "DETERMINISTIC_FALLBACK"
    assert classify_answer_origin("model_semantic") == "MODEL_SEMANTIC"
    assert classify_answer_origin("model_semantic_with_forced_tool") == "MODEL_SEMANTIC_WITH_FORCED_TOOL"
    assert (
        classify_answer_origin("model_semantic_with_deterministic_override")
        == "MODEL_SEMANTIC_WITH_DETERMINISTIC_OVERRIDE"
    )
    assert classify_answer_origin("deterministic_semantic") == "DETERMINISTIC_SEMANTIC"


def test_fallback_can_pass_system_gate_while_reliability_records_failure():
    gates = {
        "min_avg_score": 12,
        "min_grounding_rate": 0.95,
        "min_filter_adherence_rate": 1.0,
        "min_tool_success_rate": 0.95,
        "max_material_hallucination_rate": 0.0,
    }
    native = _perfect("Q1", source="model", fallback=False, initial_valid=True)
    fallback = _perfect("Q4", source="deterministic_fallback", fallback=True, initial_valid=False)
    fallback["status"] = "PASS"
    agg = aggregate_model_results("openai/gpt-oss-20b", [native, fallback], gates)
    assert agg["gate_pass"] is True
    assert agg["system_quality"]["avg_score"] == 14
    assert agg["system_quality"]["pass_count"] == 2
    assert agg["model_reliability"]["deterministic_fallback_rate"] == 0.5
    assert agg["model_reliability"]["model_native_answer_rate"] == 0.5
    assert agg["model_reliability"]["initial_structured_valid_rate"] == 0.5
    assert agg["model_reliability"]["correction_recovery_rate"] == 0.0


def test_structured_validity_can_diverge_from_evidence_validity():
    gates = {
        "min_avg_score": 12,
        "min_grounding_rate": 0.95,
        "min_filter_adherence_rate": 1.0,
        "min_tool_success_rate": 0.95,
        "max_material_hallucination_rate": 0.0,
    }
    json_but_unverified = _perfect("Q3", source="deterministic_fallback", fallback=True, initial_valid=False)
    json_but_unverified["telemetry"]["response_validation"]["initial_parse_status"] = "json_object"
    json_but_unverified["telemetry"]["response_validation"]["initial_response_valid"] = False
    json_but_unverified["telemetry"]["response_validation"]["violations"] = ["evidence_0_value_not_verified:cm2=1"]
    agg = aggregate_model_results("openai/gpt-oss-20b", [json_but_unverified], gates)
    assert agg["system_quality"]["pass_count"] == 1
    assert agg["model_reliability"]["initial_structured_valid_rate"] == 1.0
    assert agg["model_reliability"]["initial_evidence_valid_rate"] == 0.0
    assert agg["model_reliability"]["deterministic_fallback_rate"] == 1.0
    assert agg["model_reliability"]["model_native_answer_rate"] == 0.0
