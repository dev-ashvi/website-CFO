"""Direct strategic provider smoke test (optional live network)."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from typing import Any

from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence
from wyz_analytics.ai_cfo.strategy.model_decision import parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


def _synthetic_model_input() -> dict[str, Any]:
    catalog = [
        {"evidence_id": "summary:cm1", "semantic_role": None, "entity": None, "metric_label_or_key": "cm1", "provenance": "current_financial_view"},
        {"evidence_id": "summary:cm2", "semantic_role": None, "entity": None, "metric_label_or_key": "cm2", "provenance": "current_financial_view"},
        {"evidence_id": "summary:marketing_pct", "semantic_role": "COST_CONCENTRATION", "entity": None, "metric_label_or_key": "marketing_pct", "provenance": "current_financial_view"},
    ]
    return {
        "decision_type": "DECIDE",
        "normalized_question": "Should I cut marketing?",
        "subject": None,
        "diagnosis": {
            "insight_type": "POSITIVE_CM1_NEGATIVE_CM2",
            "driver_stage": "MARKETING",
            "diagnosis_confidence": "HIGH",
            "materiality": {"severity_class": "HIGH"},
            "temporal_persistence": "UNKNOWN",
            "conflicts": [],
            "limitations": [],
        },
        "allowed_actions": ["INVESTIGATE", "EXPERIMENT", "OPTIMIZE", "REDUCE", "MAINTAIN"],
        "forbidden_actions": ["EXIT", "PAUSE"],
        "action_metadata": {},
        "unknowns": ["DEMAND_RESPONSE"],
        "decision_confidence_ceiling": "MEDIUM",
        "evidence_catalog": catalog,
        "scenario_refs": [],
        "material_drivers": ["MARKETING"],
    }


def _contract(model_input: dict[str, Any]) -> StrategicReasoningContract:
    contract = StrategicReasoningContract(
        allowed_actions=[
            ActionType.INVESTIGATE,
            ActionType.EXPERIMENT,
            ActionType.OPTIMIZE,
            ActionType.REDUCE,
            ActionType.MAINTAIN,
        ],
        forbidden_actions=[ActionType.EXIT, ActionType.PAUSE],
        unknowns=[StrategicUnknown.DEMAND_RESPONSE],
        evidence_ids=[item["evidence_id"] for item in model_input["evidence_catalog"]],
        decision_confidence_ceiling=DecisionConfidence.MEDIUM,
    )
    return contract


def run_strategic_smoke(*, provider: str | None = None, model: str | None = None) -> dict[str, Any]:
    agent = resolve_ai_cfo_model(provider=provider or "openai_compatible", model=model)
    if not hasattr(agent, "run_strategic_turn"):
        return {
            "ok": False,
            "error": "provider_missing_run_strategic_turn",
            "provider_id": getattr(agent, "id", None),
        }
    model_input = _synthetic_model_input()
    contract = _contract(model_input)
    raw = agent.run_strategic_turn(
        message="Should I cut marketing?",
        model_input=model_input,
        context={},
    )
    provider_meta = raw.get("_provider_telemetry") if isinstance(raw, dict) else {}
    truncated = bool(isinstance(raw, dict) and raw.get("_strategic_truncated"))
    finish_reason = (provider_meta or {}).get("finish_reason")
    decision = parse_strategic_model_decision(raw)
    validation = validate_strategic_model_decision(
        decision,
        contract=contract,
        known_evidence_ids=set(contract.evidence_ids),
    )
    parse_pass = decision is not None and decision.selected_action is not None and not truncated
    return {
        "ok": bool(parse_pass and validation.ok),
        "provider_id": getattr(agent, "id", None),
        "provider_response_received": raw is not None,
        "parse_pass": parse_pass,
        "validation_pass": validation.ok,
        "truncated": truncated or finish_reason == "length",
        "selected_action": decision.selected_action.value if decision and decision.selected_action else None,
        "validation_errors": validation.errors,
        "forecast_violation_field": validation.forecast_violation_field,
        "forecast_violation_rule": validation.forecast_violation_rule,
        "latency_ms": (provider_meta or {}).get("latency_ms"),
        "finish_reason": finish_reason,
        "parse_warning": (provider_meta or {}).get("parse_warning"),
        "strategic_request": (provider_meta or {}).get("strategic_request"),
    }


def run_strategic_smoke_batch(*, runs: int, provider: str | None, model: str | None) -> dict[str, Any]:
    results = [run_strategic_smoke(provider=provider, model=model) for _ in range(max(1, runs))]
    latencies = [r["latency_ms"] for r in results if isinstance(r.get("latency_ms"), int)]
    actions = [r.get("selected_action") for r in results if r.get("selected_action")]
    p95 = sorted(latencies)[int(0.95 * (len(latencies) - 1))] if len(latencies) >= 2 else (latencies[0] if latencies else None)
    return {
        "runs": len(results),
        "successful_responses": sum(1 for r in results if r.get("provider_response_received")),
        "parse_pass_rate": sum(1 for r in results if r.get("parse_pass")) / len(results),
        "validation_pass_rate": sum(1 for r in results if r.get("validation_pass")) / len(results),
        "truncation_count": sum(1 for r in results if r.get("truncated")),
        "fallback_count": sum(1 for r in results if not r.get("ok")),
        "latency_avg_ms": statistics.mean(latencies) if latencies else None,
        "latency_p95_ms": p95,
        "action_distribution": {a: actions.count(a) for a in sorted(set(actions))},
        "results": results,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Strategic provider smoke test")
    parser.add_argument("--provider", default=None, help="AI CFO provider (default: openai_compatible)")
    parser.add_argument("--model", default=None, help="Model id override")
    parser.add_argument("--runs", type=int, default=1, help="Repeat smoke runs and aggregate")
    parser.add_argument("--json", action="store_true", help="Print JSON result")
    args = parser.parse_args(argv)

    if args.runs > 1:
        result = run_strategic_smoke_batch(runs=args.runs, provider=args.provider, model=args.model)
        ok = result["validation_pass_rate"] >= 0.8 and result["truncation_count"] == 0
    else:
        result = run_strategic_smoke(provider=args.provider, model=args.model)
        ok = bool(result.get("ok"))

    if args.json:
        print(json.dumps(result, indent=2))
    elif args.runs > 1:
        print(f"runs: {result['runs']}")
        print(f"parse pass rate: {result['parse_pass_rate']:.0%}")
        print(f"validation pass rate: {result['validation_pass_rate']:.0%}")
        print(f"truncation count: {result['truncation_count']}")
        print(f"latency avg/p95: {result['latency_avg_ms']}/{result['latency_p95_ms']} ms")
        print(f"actions: {result['action_distribution']}")
    else:
        print(f"provider: {result.get('provider_id')}")
        print(f"response received: {result.get('provider_response_received')}")
        print(f"parse: {'PASS' if result.get('parse_pass') else 'FAIL'}")
        print(f"validation: {'PASS' if result.get('validation_pass') else 'FAIL'}")
        print(f"truncated: {result.get('truncated')}")
        print(f"selected_action: {result.get('selected_action')}")
        print(f"latency_ms: {result.get('latency_ms')}")
        print(f"finish_reason: {result.get('finish_reason')}")
        if result.get("strategic_request"):
            print(f"strategic_request: {result['strategic_request']}")
        if result.get("validation_errors"):
            print(f"errors: {result['validation_errors']}")
        if result.get("forecast_violation_field"):
            print(f"forecast_field: {result['forecast_violation_field']} rule: {result['forecast_violation_rule']}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
