"""Rescore the published GPT-OSS-20B live snapshot with the fixed evaluator."""

from __future__ import annotations

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES
from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status
from wyz_analytics.ai_cfo.benchmark.runner import aggregate_model_results, load_beautyco_facts
from wyz_analytics.ai_cfo.benchmark.scorer import score_response

# Captured from live run in terminal (old evaluator).
OLD_LIVE: dict[str, dict] = {
    "Q1": {"total": 12, "status": "PASS", "too": 1, "hal": 2, "headline": "Q‑commerce and Nykaa channels dominate CM2"},
    "Q2": {"total": 12, "status": "TOOL_FAIL", "too": 0, "hal": 2, "headline": "Q‑commerce channel leads CM2 contribution"},
    "Q3": {"total": 13, "status": "PASS", "too": 2, "hal": 2, "headline": "Skincare has the weakest contribution economics"},
    "Q4": {"total": 13, "status": "PASS", "too": 1, "hal": 2, "headline": "Channel fulfillment and marketing costs are the biggest margin drains"},
    "Q5": {"total": 13, "status": "PASS", "too": 1, "hal": 2, "headline": "Marketing spend exceeds channel contribution, driving negative CM2"},
    "Q6": {"total": 13, "status": "PASS", "too": 1, "hal": 2, "headline": "Marketing spend is eroding profitability on the D2C Website"},
    "Q7": {"total": 12, "status": "TOOL_FAIL", "too": 0, "hal": 2, "headline": "SKU001 and SKU003 dominate contribution on Amazon Lips channel"},
    "Q8": {"total": 12, "status": "TOOL_FAIL", "too": 0, "hal": 2, "headline": "SKU001 and SKU003 are the primary drivers of margin pressure on Amazon Lips"},
    "Q9": {"total": 14, "status": "PASS", "too": 2, "hal": 2, "headline": "High channel cost pressure and marketing spend point to customer dissatisfaction with SKU001"},
    "Q10": {"total": 12, "status": "REASONING_FAIL", "too": 2, "hal": 0, "headline": "D2C Website remains top gross‑margin driver but marketing spend erodes profitability"},
    "Q11": {"total": 11, "status": "REASONING_FAIL", "too": 2, "hal": 0, "headline": "Verified financial interpretation"},
}


def main() -> None:
    facts = load_beautyco_facts()
    lineage = {
        "workspace_id": "rescore",
        "dataset_id": "beautyco",
        "dataset_version": 1,
        "mapping_version": "rescore",
        "job_id": "rescore",
        "engine_version": "rescore",
    }
    rescored: list[dict] = []
    print("GPT-OSS-20B live snapshot — old vs new evaluator")
    print("=" * 72)
    print(f"{'Q':<4} {'Old':>12} {'New':>12} {'Δ':>4}  Old status -> New status")
    print("-" * 72)
    for case in BENCHMARK_CASES:
        case_id = case["id"]
        old = OLD_LIVE[case_id]
        turn = run_ai_cfo_turn(
            facts,
            lineage=lineage,
            analytical=case["analytical"],
            message=case["question"],
        )
        context = turn["context"]
        scored = score_response(
            case=case,
            response={
                "answer": {
                    "headline": old["headline"],
                    "evidence": [old["headline"]],
                    "drivers": "rescore",
                    "tool_calls": [],
                },
                "context": context,
            },
        )
        scored["status"] = classify_case_status(scored)
        scored["headline"] = old["headline"]
        rescored.append(scored)
        delta = scored["total"] - old["total"]
        sign = "+" if delta > 0 else ""
        print(
            f"{case_id:<4} {old['total']:>3}/14 {old['status']:<12} "
            f"{scored['total']:>3}/14 {scored['status']:<14} {sign}{delta}  "
            f"too {old['too']}->{scored['categories']['tool_behavior']} "
            f"hal {old['hal']}->{scored['categories']['hallucination_scope']}"
        )
        if scored.get("evidence_plan"):
            print(f"     evidence: {scored['evidence_plan']['explanation']}")
        for note in scored.get("notes") or []:
            if "Material violation" in note or "TOOL_FAIL" in note or "tool not required" in note:
                print(f"     note: {note}")

    agg = aggregate_model_results("openai/gpt-oss-20b", rescored, {
        "min_avg_score": 12.0,
        "min_grounding_rate": 0.95,
        "min_filter_adherence_rate": 1.0,
        "min_tool_success_rate": 0.95,
        "max_material_hallucination_rate": 0.0,
    })
    print("-" * 72)
    print(
        f"Aggregate old: avg=12.45/14 grounding=91% tool=73% gate=FAIL"
    )
    print(
        f"Aggregate new: avg={agg['avg_score']:.2f}/14 "
        f"grounding={agg['metrics']['grounding_rate']:.0%} "
        f"tool={agg['metrics']['tool_success_rate']:.0%} "
        f"material_violations={agg['metrics']['material_violation_count']} "
        f"gate={'PASS' if agg['gate_pass'] else 'FAIL'}"
    )


if __name__ == "__main__":
    main()
