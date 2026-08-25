"""Run BeautyCo AI CFO model comparison benchmark."""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from typing import Any, Callable

import polars as pl

from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.benchmark.cases import (
    BENCHMARK_CASES,
    DEFAULT_GATES,
    DEFAULT_MODELS,
)
from wyz_analytics.ai_cfo.benchmark.latency import classify_stage_latency
from wyz_analytics.ai_cfo.benchmark.output import record_output_write_result, write_benchmark_output
from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status, format_progress_prefix
from wyz_analytics.ai_cfo.benchmark.scorer import MAX_TOTAL, score_response
from wyz_analytics.ai_cfo.openai_compatible import (
    OpenAICompatibleAiCfoModel,
    ProviderError,
    resolve_http_timeout_sec,
)
from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model

DEFAULT_QUESTION_TIMEOUT_SEC = 300

ANSWER_ORIGIN_MAP = {
    "model": "MODEL_NATIVE",
    "model_with_strategy_boundary": "MODEL_NATIVE",
    "model_semantic": "MODEL_SEMANTIC",
    "model_semantic_with_forced_tool": "MODEL_SEMANTIC_WITH_FORCED_TOOL",
    "model_semantic_with_deterministic_override": "MODEL_SEMANTIC_WITH_DETERMINISTIC_OVERRIDE",
    "corrected_model": "MODEL_CORRECTED",
    "model_with_post_intervention": "MODEL_CORRECTED",
    "model_with_forced_tool": "MODEL_WITH_FORCED_TOOL",
    "deterministic_guard": "DETERMINISTIC_GUARD",
    "deterministic_replacement": "DETERMINISTIC_GUARD",
    "deterministic_semantic": "DETERMINISTIC_SEMANTIC",
    "deterministic_fallback": "DETERMINISTIC_FALLBACK",
}


def classify_answer_origin(answer_source: str | None) -> str:
    return ANSWER_ORIGIN_MAP.get(str(answer_source or ""), "UNKNOWN")


def load_beautyco_facts() -> pl.DataFrame:
    from pathlib import Path as PathType

    from wyz_analytics.adapters.beautyco import load_beautyco_sources
    from wyz_analytics.engine.pipeline import build_line_facts
    from wyz_analytics.facts.persist import build_fact_frame

    candidates: list[PathType] = []
    env = os.environ.get("WYZ_ANALYTICS_GOLDEN_DIR")
    if env:
        candidates.append(PathType(env))
    analytics_root = PathType(__file__).resolve().parents[4]  # services/analytics
    candidates.extend(
        [
            analytics_root / "tests" / "data" / "beautyco",
            PathType.home() / "Downloads",
        ]
    )
    data_dir = None
    for path in candidates:
        if (path / "01_ORDER_LINES.csv").exists() and (path / "02_SKU_MASTER_COGS.csv").exists():
            data_dir = path
            break
    if data_dir is None:
        raise FileNotFoundError(
            "BeautyCo CSVs not found. Set WYZ_ANALYTICS_GOLDEN_DIR or place files in tests/data/beautyco."
        )
    sources = load_beautyco_sources(data_dir)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def resolve_question_timeout_sec(explicit: float | None = None) -> float:
    if explicit is not None:
        return float(explicit)
    raw = os.environ.get("WYZ_AI_CFO_QUESTION_TIMEOUT_SEC")
    if raw:
        try:
            return float(raw)
        except ValueError:
            pass
    # Bound question wall-clock above HTTP timeout * tool-loop budget.
    http_timeout = resolve_http_timeout_sec()
    return max(float(DEFAULT_QUESTION_TIMEOUT_SEC), http_timeout * 4)


def select_cases(*, limit: int | None = None, question: str | None = None) -> list[dict[str, Any]]:
    cases = list(BENCHMARK_CASES)
    if question:
        needle = question.strip().upper()
        if not needle.startswith("Q") and needle.isdigit():
            needle = f"Q{needle}"
        cases = [case for case in cases if case["id"].upper() == needle]
        if not cases:
            known = ", ".join(case["id"] for case in BENCHMARK_CASES)
            raise ValueError(f"Unknown question '{question}'. Known ids: {known}")
    if limit is not None:
        if limit < 0:
            raise ValueError("--limit must be >= 0")
        cases = cases[: int(limit)]
    return cases


def run_case(
    facts: pl.DataFrame,
    case: dict[str, Any],
    *,
    model: Any,
) -> dict[str, Any]:
    lineage = {
        "workspace_id": "benchmark",
        "dataset_id": "beautyco",
        "dataset_version": 1,
        "mapping_version": "benchmark",
        "job_id": "benchmark-job",
        "engine_version": "benchmark",
    }
    started = time.perf_counter()
    try:
        first = run_ai_cfo_turn(
            facts,
            lineage=lineage,
            analytical=case["analytical"],
            message=case["question"],
            model=model,
            reconciliation={"ok": True},
        )
        history = [
            {"role": "user", "content": case["question"]},
            {"role": "assistant", "content": first["answer"].get("headline") or ""},
        ]
        follow = case.get("follow_up")
        if follow:
            second = run_ai_cfo_turn(
                facts,
                lineage=lineage,
                analytical=case["analytical"],
                message=follow,
                model=model,
                history=history,
                reconciliation={"ok": True},
            )
            response = second
            response["follow_up_question"] = follow
            response["prior_answer"] = first.get("answer")
        else:
            response = first
        latency_ms = int((time.perf_counter() - started) * 1000)
        scored = score_response(case=case, response=response)
        scored["latency_ms"] = latency_ms
        scored["question"] = case["question"]
        if follow:
            scored["follow_up"] = follow
        final_answer = response.get("scoring_answer") or response.get("answer") or {}
        scored["headline"] = final_answer.get("headline")
        scored["telemetry"] = final_answer.get("telemetry") or {}
        scored["answer_source"] = (final_answer.get("telemetry") or {}).get("answer_source")
        scored["answer_origin"] = classify_answer_origin(scored["answer_source"])
        trace = (final_answer.get("telemetry") or {}).get("answer_trace") or {}
        scored["answer_trace"] = {
            "initial_headline": trace.get("initial_headline"),
            "corrected_headline": trace.get("corrected_headline"),
            "final_headline": final_answer.get("headline"),
            "answer_source": scored["answer_source"],
        }
        _persist_validation_diagnostics(case, scored)
        if case["id"] == "Q1":
            latency_flag = classify_stage_latency(stage="q1", latency_ms=latency_ms)
            if latency_flag:
                scored["latency_status"] = latency_flag
        scored["status"] = classify_case_status(scored)
        return scored
    except ProviderError as exc:
        scored = score_response(
            case=case,
            response={},
            infra_error={"code": exc.code, "message": str(exc), "status": exc.status},
        )
        scored["latency_ms"] = int((time.perf_counter() - started) * 1000)
        scored["question"] = case["question"]
        scored["status"] = classify_case_status(scored)
        return scored
    except Exception as exc:  # noqa: BLE001 — benchmark must record unexpected failures
        scored = score_response(
            case=case,
            response={},
            infra_error={"code": "model_answer_failure", "message": str(exc)},
        )
        scored["latency_ms"] = int((time.perf_counter() - started) * 1000)
        scored["question"] = case["question"]
        scored["status"] = classify_case_status(scored)
        return scored


def run_case_bounded(
    facts: pl.DataFrame,
    case: dict[str, Any],
    *,
    model: Any,
    question_timeout_sec: float,
) -> dict[str, Any]:
    """Run one case with a hard wall-clock bound (tool-loop / orchestration protection)."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(run_case, facts, case, model=model)
        try:
            return future.result(timeout=question_timeout_sec)
        except FuturesTimeout:
            scored = score_response(
                case=case,
                response={},
                infra_error={
                    "code": "timeout",
                    "message": f"Question exceeded {int(question_timeout_sec)}s wall-clock limit",
                    "status": None,
                },
            )
            scored["latency_ms"] = int(question_timeout_sec * 1000)
            scored["question"] = case["question"]
            scored["status"] = "TIMEOUT"
            return scored


def aggregate_model_results(model_name: str, case_scores: list[dict[str, Any]], gates: dict[str, Any]) -> dict[str, Any]:
    scored = [item for item in case_scores if item.get("scored")]
    infra = [item for item in case_scores if item.get("infra_failure")]
    if not scored:
        return {
            "model": model_name,
            "avg_score": None,
            "gate_pass": False,
            "infra_failures": infra,
            "cases": case_scores,
            "recommendation_eligible": False,
            "metrics": {
                "scored_questions": 0,
                "infra_failed_questions": len(infra),
            },
            "reason": "No scored questions — infrastructure failures only.",
            "status_summary": _status_counts(case_scores),
        }

    totals = [item["total"] for item in scored]
    avg = sum(totals) / len(totals)

    # Diagnostic only: share of questions with rubric numerical_grounding == 2.
    # Scope-control PASS answers (often num=1, zero unsupported claims) correctly pull this below 100%.
    fully_grounded_question_rate = (
        sum(1 for item in scored if item["categories"]["numerical_grounding"] == 2) / len(scored)
    )
    claim_total = sum(int(item.get("numeric_claim_count") or 0) for item in scored)
    claim_grounded = sum(int(item.get("grounded_numeric_claim_count") or 0) for item in scored)
    # Authoritative grounding: verified numeric claims. No claims ⇒ vacuously grounded.
    numeric_claim_grounding = (claim_grounded / claim_total) if claim_total else 1.0
    grounding_for_gate = numeric_claim_grounding

    guard_preempted = 0
    guard_forced_tools = 0
    guard_post_interventions = 0
    guard_retries = 0
    guard_replacements = 0
    for item in scored:
        guard = (item.get("guard_telemetry") or {})
        guard_preempted += int(guard.get("preempted_turn_count") or 0)
        guard_forced_tools += int(guard.get("forced_tool_count") or 0)
        guard_post_interventions += int(guard.get("post_response_intervention_count") or 0)
        guard_retries += int(guard.get("retry_count") or 0)
        guard_replacements += int(guard.get("deterministic_replacement_count") or 0)
    validation_total = 0
    validation_valid = 0
    claim_budget_violations = 0
    deterministic_fallback_count = 0
    correction_attempt_count = 0
    correction_success_count = 0
    avg_numeric_claims = 0.0
    for item in scored:
        telemetry = item.get("telemetry") or {}
        rv = telemetry.get("response_validation") or {}
        if rv:
            validation_total += 1
            if rv.get("valid"):
                validation_valid += 1
            claim_budget_violations += sum(
                1
                for violation in (rv.get("violations") or [])
                if "budget" in str(violation)
            )
            deterministic_fallback_count += 1 if rv.get("deterministic_fallback_used") else 0
            correction_attempt_count += 1 if rv.get("correction_attempted") else 0
            correction_success_count += 1 if rv.get("correction_succeeded") else 0
        avg_numeric_claims += float(rv.get("numeric_claims_generated") or 0)
    avg_numeric_claims = (avg_numeric_claims / len(scored)) if scored else 0.0
    filter_ok = sum(1 for item in scored if item["categories"]["filter_adherence"] == 2) / len(scored)
    halluc_fail = sum(1 for item in scored if item["categories"]["hallucination_scope"] == 0) / len(scored)

    tool_scores = []
    for item in scored:
        tool = item["categories"]["tool_behavior"]
        if tool is not None:
            tool_scores.append(1 if tool >= 1 else 0)
    tool_success = (sum(tool_scores) / len(tool_scores)) if tool_scores else 0.0

    latencies = [item.get("latency_ms") for item in scored if item.get("latency_ms") is not None]
    avg_latency = (sum(latencies) / len(latencies)) if latencies else None
    p95_latency = _p95_latency(latencies)
    latency_unsuitable = sum(
        1 for item in case_scores if item.get("latency_status") == "LATENCY_UNSUITABLE_FOR_V1"
    )

    material_violations = [item for item in scored if item.get("material_violation")]
    material_wrong = any(
        item["categories"]["numerical_grounding"] == 0 or item["categories"]["filter_adherence"] == 0
        for item in scored
    )
    all_questions_pass = all(
        (item.get("status") or classify_case_status(item)) == "PASS" for item in scored
    )

    gate_pass = (
        all_questions_pass
        and avg >= float(gates["min_avg_score"])
        and grounding_for_gate >= float(gates["min_grounding_rate"])
        and filter_ok >= float(gates["min_filter_adherence_rate"])
        and tool_success >= float(gates["min_tool_success_rate"])
        and halluc_fail <= float(gates["max_material_hallucination_rate"])
        and not material_wrong
        and not infra
        and not material_violations
    )

    return {
        "model": model_name,
        "avg_score": round(avg, 2),
        "max_score": MAX_TOTAL,
        "gate_pass": gate_pass,
        "recommendation_eligible": gate_pass,
        "infra_failures": infra,
        "material_violations": material_violations,
        "cases": case_scores,
        "metrics": {
            # Backward-compatible alias for fully_grounded_question_rate (diagnostic only).
            "grounding_rate": round(fully_grounded_question_rate, 3),
            "fully_grounded_question_rate": round(fully_grounded_question_rate, 3),
            "numeric_claim_grounding_rate": round(numeric_claim_grounding, 3),
            "filter_adherence_rate": round(filter_ok, 3),
            "tool_success_rate": round(tool_success, 3),
            "material_hallucination_rate": round(halluc_fail, 3),
            "avg_latency_ms": int(avg_latency) if avg_latency is not None else None,
            "p95_latency_ms": int(p95_latency) if p95_latency is not None else None,
            "latency_unsuitable_count": latency_unsuitable,
            "scored_questions": len(scored),
            "infra_failed_questions": len(infra),
            "material_violation_count": len(material_violations),
            "guard_preempted_turn_count": guard_preempted,
            "guard_forced_tool_count": guard_forced_tools,
            "guard_post_response_intervention_count": guard_post_interventions,
            "guard_retry_count": guard_retries,
            "guard_deterministic_replacement_count": guard_replacements,
            "numeric_claim_count_total": claim_total,
            "grounded_numeric_claim_count_total": claim_grounded,
            "structured_output_valid_rate": round((validation_valid / validation_total), 3)
            if validation_total
            else None,
            "structured_output_initial_valid_rate": round(
                (
                    sum(
                        1
                        for item in scored
                        if (item.get("telemetry") or {})
                        .get("response_validation", {})
                        .get("initial_response_valid")
                    )
                    / validation_total
                ),
                3,
            )
            if validation_total
            else None,
            "structured_output_after_correction_valid_rate": round(
                (
                    sum(
                        1
                        for item in scored
                        if (item.get("telemetry") or {})
                        .get("response_validation", {})
                        .get("correction_valid")
                    )
                    / max(
                        sum(
                            1
                            for item in scored
                            if (item.get("telemetry") or {})
                            .get("response_validation", {})
                            .get("correction_attempted")
                        ),
                        1,
                    )
                ),
                3,
            )
            if validation_total
            else None,
            "deterministic_fallback_rate": round(
                (deterministic_fallback_count / validation_total), 3
            ) if validation_total else None,
            "average_claim_budget_usage": round(
                (avg_numeric_claims / 3.0), 3
            ) if avg_numeric_claims > 0 else 0.0,
            "average_numeric_claims_per_answer": round(avg_numeric_claims, 2),
            "claim_budget_violation_count": int(claim_budget_violations),
            "deterministic_fallback_count": int(deterministic_fallback_count),
            "correction_attempt_count": int(correction_attempt_count),
            "correction_success_count": int(correction_success_count),
        },
        "reason": None if gate_pass else _fail_reason(
            avg,
            grounding_for_gate,
            filter_ok,
            tool_success,
            halluc_fail,
            material_wrong,
            infra,
            material_violations,
            gates,
            all_questions_pass=all_questions_pass,
            fully_grounded_question_rate=fully_grounded_question_rate,
        ),
        "status_summary": _status_counts(case_scores),
        "system_quality": {
            "pass_count": sum(
                1 for item in scored if (item.get("status") or classify_case_status(item)) == "PASS"
            ),
            "fail_count": sum(
                1
                for item in scored
                if (item.get("status") or classify_case_status(item)) == "REASONING_FAIL"
            ),
            "scored_questions": len(scored),
            "avg_score": round(avg, 2),
            "all_questions_pass": all_questions_pass,
            "numeric_claim_grounding_rate": round(numeric_claim_grounding, 3),
            "fully_grounded_question_rate": round(fully_grounded_question_rate, 3),
            "filter_adherence_rate": round(filter_ok, 3),
            "tool_success_rate": round(tool_success, 3),
            "material_violation_count": len(material_violations),
            "gate_pass": gate_pass,
        },
        "model_reliability": _model_reliability(scored, validation_total),
    }


def _model_reliability(scored: list[dict[str, Any]], validation_total: int) -> dict[str, Any]:
    n = len(scored) or 1
    origins: dict[str, int] = {}
    malformed = 0
    initial_valid = 0
    initial_evidence_valid = 0
    correction_attempts = 0
    correction_success = 0
    fallback = 0
    budget_violations = 0
    provider_calls = 0.0
    native_latencies: list[float] = []
    e2e_latencies: list[float] = []
    semantic_valid = 0
    evidence_id_valid = 0
    insight_type_valid = 0
    driver_stage_valid = 0
    deterministic_insight_override = 0
    deterministic_driver_override = 0
    deterministic_semantic = 0
    for item in scored:
        origin = item.get("answer_origin") or classify_answer_origin(item.get("answer_source"))
        origins[origin] = origins.get(origin, 0) + 1
        telemetry = item.get("telemetry") or {}
        rv = telemetry.get("response_validation") or {}
        semantic = telemetry.get("semantic") or {}
        parse = telemetry.get("parse") or {}
        status = str(rv.get("initial_parse_status") or parse.get("status") or "")
        initial_errors = (rv.get("correction_diagnostics") or {}).get("initial_validation_errors") or []
        semantic_ok = rv.get("model_semantic_valid")
        if semantic_ok is None:
            semantic_ok = semantic.get("parse_ok")
        structured_ok = (
            bool(semantic_ok)
            or status in {"json_object", "fenced_json"}
            or bool(rv.get("initial_response_valid"))
        )
        if structured_ok:
            initial_valid += 1
        if semantic_ok:
            semantic_valid += 1
        if rv.get("initial_response_valid") or (
            semantic_ok and not (rv.get("invalid_evidence_ids") or semantic.get("invalid_evidence_ids"))
        ):
            initial_evidence_valid += 1
            evidence_id_valid += 1
        if rv.get("insight_type_valid") or semantic.get("insight_type_valid"):
            insight_type_valid += 1
        if rv.get("driver_stage_valid") or semantic.get("driver_stage_valid"):
            driver_stage_valid += 1
        if rv.get("deterministic_insight_override") or semantic.get("deterministic_insight_override"):
            deterministic_insight_override += 1
        if rv.get("deterministic_driver_override") or semantic.get("deterministic_driver_override"):
            deterministic_driver_override += 1
        if status in {"malformed", "truncated", "empty", "prose"} or any(
            "malformed_schema" in str(v) for v in initial_errors or (rv.get("violations") or [])
        ):
            if not rv.get("initial_response_valid") and not semantic_ok:
                malformed += 1
        if rv.get("correction_attempted"):
            correction_attempts += 1
        if rv.get("correction_succeeded") or rv.get("correction_valid"):
            correction_success += 1
        if rv.get("deterministic_fallback_used") or origin == "DETERMINISTIC_FALLBACK":
            fallback += 1
        if origin == "DETERMINISTIC_SEMANTIC" or rv.get("deterministic_evidence_selection_used"):
            if origin == "DETERMINISTIC_SEMANTIC":
                deterministic_semantic += 1
        budget_source = initial_errors or (rv.get("violations") or [])
        budget_violations += sum(1 for v in budget_source if "budget" in str(v))
        provider_calls += float(
            telemetry.get("model_calls")
            or rv.get("provider_calls")
            or (2 if rv.get("correction_attempted") else 1)
        )
        if item.get("latency_ms") is not None:
            e2e_latencies.append(float(item["latency_ms"]))
        if origin in {
            "MODEL_NATIVE",
            "MODEL_SEMANTIC",
            "MODEL_SEMANTIC_WITH_FORCED_TOOL",
            "MODEL_SEMANTIC_WITH_DETERMINISTIC_OVERRIDE",
        } and item.get("latency_ms") is not None:
            native_latencies.append(float(item["latency_ms"]))
    return {
        "initial_structured_valid_rate": round(initial_valid / n, 3),
        "semantic_contract_valid_rate": round(semantic_valid / n, 3),
        "evidence_id_selection_valid_rate": round(evidence_id_valid / n, 3),
        "insight_type_valid_rate": round(insight_type_valid / n, 3),
        "driver_stage_valid_rate": round(driver_stage_valid / n, 3),
        "deterministic_insight_override_rate": round(deterministic_insight_override / n, 3),
        "deterministic_driver_override_rate": round(deterministic_driver_override / n, 3),
        "deterministic_semantic_replacement_rate": round(deterministic_semantic / n, 3),
        "initial_evidence_valid_rate": round(initial_evidence_valid / n, 3),
        "correction_recovery_rate": round((correction_success / correction_attempts), 3)
        if correction_attempts
        else None,
        "deterministic_fallback_rate": round(fallback / n, 3),
        "malformed_output_rate": round(malformed / n, 3),
        "claim_budget_violation_rate": round(budget_violations / n, 3),
        "model_native_answer_rate": round(
            (
                origins.get("MODEL_NATIVE", 0)
                + origins.get("MODEL_SEMANTIC", 0)
                + origins.get("MODEL_SEMANTIC_WITH_FORCED_TOOL", 0)
                + origins.get("MODEL_SEMANTIC_WITH_DETERMINISTIC_OVERRIDE", 0)
            )
            / n,
            3,
        ),
        "average_provider_calls_per_answer": round(provider_calls / n, 2),
        "model_native_latency_ms": int(sum(native_latencies) / len(native_latencies)) if native_latencies else None,
        "end_to_end_latency_ms": int(sum(e2e_latencies) / len(e2e_latencies)) if e2e_latencies else None,
        "answer_origin_counts": origins,
    }


def _p95_latency(latencies: list[int | float]) -> float | None:
    if not latencies:
        return None
    ordered = sorted(float(item) for item in latencies)
    index = max(0, min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1)))))
    return ordered[index]


def _status_counts(case_scores: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in case_scores:
        status = item.get("status") or classify_case_status(item)
        counts[status] = counts.get(status, 0) + 1
    return counts


def _fail_reason(
    avg,
    grounding_for_gate,
    filter_ok,
    tool_success,
    halluc_fail,
    material_wrong,
    infra,
    material_violations,
    gates,
    *,
    all_questions_pass: bool = True,
    fully_grounded_question_rate: float | None = None,
) -> str:
    reasons = []
    if infra:
        reasons.append("infrastructure failures present")
    if material_violations:
        reasons.append(f"material scope violations ({len(material_violations)} question(s))")
    if not all_questions_pass:
        reasons.append("not all required questions PASS")
    if avg < float(gates["min_avg_score"]):
        reasons.append(f"avg score {avg:.1f} < {gates['min_avg_score']}")
    if grounding_for_gate < float(gates["min_grounding_rate"]):
        reasons.append("numeric claim grounding below threshold")
        if fully_grounded_question_rate is not None:
            reasons.append(
                f"(fully grounded questions={fully_grounded_question_rate:.0%} is diagnostic only)"
            )
    if filter_ok < float(gates["min_filter_adherence_rate"]):
        reasons.append("filter adherence below threshold")
    if tool_success < float(gates["min_tool_success_rate"]):
        reasons.append("tool success below threshold")
    if halluc_fail > float(gates["max_material_hallucination_rate"]):
        reasons.append("material hallucination detected")
    if material_wrong:
        reasons.append("materially wrong financial or filter answers")
    return "; ".join(reasons) or "failed gates"


def choose_recommendation(model_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Prefer the smallest/first listed model that passes gates."""
    eligible = [item for item in model_results if item.get("recommendation_eligible")]
    any_scored = any((item.get("metrics") or {}).get("scored_questions") for item in model_results)
    if not eligible:
        if not any_scored:
            return {
                "recommended": None,
                "why": (
                    "Insufficient successful inference to select a winner "
                    "(infrastructure/auth/timeout/provider failures only). Recommend neither."
                ),
            }
        return {
            "recommended": None,
            "why": "Neither candidate met WYZ V1 gating criteria. Recommend neither.",
        }

    def _canonical(name: str) -> str:
        text = name or ""
        if text.startswith("fake(") and text.endswith(")"):
            return text[5:-1]
        return text

    order = {name: index for index, name in enumerate(DEFAULT_MODELS)}
    eligible.sort(key=lambda item: order.get(_canonical(item["model"]), 99))
    winner = eligible[0]
    canonical = _canonical(winner["model"])
    if canonical == DEFAULT_MODELS[0] or order.get(canonical, 99) == 0:
        why = (
            f"{winner['model']} passes all WYZ V1 gates "
            f"(avg {winner['avg_score']}/{MAX_TOTAL}). Prefer smallest capable model."
        )
    else:
        why = (
            f"Smaller candidate failed gates; {winner['model']} is the smallest that passes "
            f"(avg {winner['avg_score']}/{MAX_TOTAL})."
        )
    return {"recommended": winner["model"], "why": why}


def _persist_validation_diagnostics(case: dict[str, Any], scored: dict[str, Any]) -> None:
    """Attach safe validation diagnostics to scored result for reporting."""
    telemetry = scored.get("telemetry") or {}
    rv = telemetry.get("response_validation") or {}
    if not rv:
        return
    scored["validation_diagnostics"] = {
        "case_id": case.get("id"),
        "evidence_item_count": rv.get("evidence_items_used"),
        "numeric_claim_count": rv.get("numeric_claims_generated"),
        "claim_budget": rv.get("claim_budget") or {},
        "schema_violations": [v for v in (rv.get("violations") or []) if "schema" in v or "driver_stage" in v],
        "evidence_violations": [v for v in (rv.get("violations") or []) if "evidence" in v or "value" in v or "scope" in v or "metric" in v],
        "budget_violations": [v for v in (rv.get("violations") or []) if "budget" in v],
        "semantic_violations": [v for v in (rv.get("violations") or []) if "margin" in v or "attribution" in v],
        "all_violations": list(rv.get("violations") or []),
        "correction_attempted": rv.get("correction_attempted", False),
        "correction_succeeded": rv.get("correction_succeeded", False),
        "deterministic_fallback_used": rv.get("deterministic_fallback_used", False),
        "initial_response_valid": rv.get("initial_response_valid"),
        "correction_valid": rv.get("correction_valid"),
        "fallback_used": rv.get("fallback_used"),
        "valid": rv.get("valid", False),
        "answer_source": scored.get("answer_source"),
        "initial_headline": (scored.get("answer_trace") or {}).get("initial_headline"),
        "corrected_headline": (scored.get("answer_trace") or {}).get("corrected_headline"),
        "final_headline": (scored.get("answer_trace") or {}).get("final_headline"),
        "initial_parse_status": rv.get("initial_parse_status"),
        "correction_diagnostics": rv.get("correction_diagnostics"),
    }


def _checkpoint(
    path: str | None,
    payload: dict[str, Any],
    *,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> None:
    write_result = write_benchmark_output(path, payload)
    record_output_write_result(payload, write_result)
    if not write_result.ok and on_progress:
        on_progress(
            {
                "message": (
                    "OUTPUT_WRITE_FAIL — "
                    f"{write_result.error.get('message') if write_result.error else 'unknown error'} "
                    "(benchmark results retained in memory; not a model/provider failure)"
                ),
                "level": "warn",
            }
        )


def run_benchmark(
    *,
    models: list[str] | None = None,
    live: bool = False,
    facts: pl.DataFrame | None = None,
    gates: dict[str, Any] | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    limit: int | None = None,
    question: str | None = None,
    question_timeout_sec: float | None = None,
    http_timeout_sec: float | None = None,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
    out_path: str | None = None,
) -> dict[str, Any]:
    model_names = models or list(DEFAULT_MODELS)
    gate_cfg = {**DEFAULT_GATES, **(gates or {})}
    cases = select_cases(limit=limit, question=question)
    frame = facts if facts is not None else load_beautyco_facts()
    q_timeout = resolve_question_timeout_sec(question_timeout_sec)
    log = on_progress or (lambda _event: None)
    cancelled = False

    result: dict[str, Any] = {
        "live": live,
        "gates": gate_cfg,
        "models": [],
        "decision": {"recommended": None, "why": "Benchmark incomplete."},
        "cancelled": False,
        "case_ids": [case["id"] for case in cases],
        "question_timeout_sec": q_timeout,
        "http_timeout_sec": resolve_http_timeout_sec(http_timeout_sec),
    }

    try:
        for name in model_names:
            if live:
                agent = OpenAICompatibleAiCfoModel(
                    model=name,
                    base_url=base_url,
                    api_key=api_key,
                    timeout_sec=http_timeout_sec,
                    on_progress=lambda event, _name=name: log(
                        {
                            **event,
                            "prefix": event.get("prefix") or "",
                            "message": event.get("message"),
                            "model": _name,
                        }
                    ),
                )
            else:
                agent = resolve_ai_cfo_model(provider="fake")

            case_scores: list[dict[str, Any]] = []
            total_q = len(cases)
            for index, case in enumerate(cases, start=1):
                prefix = format_progress_prefix(index, total_q)
                log(
                    {
                        "prefix": prefix,
                        "message": f"{name} - {case['id']} starting",
                        "level": "info",
                    }
                )

                def _case_progress(event: dict[str, Any], _prefix=prefix) -> None:
                    log({**event, "prefix": _prefix})

                if live and isinstance(agent, OpenAICompatibleAiCfoModel):
                    agent._on_progress = _case_progress  # noqa: SLF001 — scoped progress for this question

                started = time.perf_counter()
                if live:
                    scored = run_case_bounded(frame, case, model=agent, question_timeout_sec=q_timeout)
                else:
                    scored = run_case(frame, case, model=agent)
                elapsed = time.perf_counter() - started
                case_scores.append(scored)

                if scored.get("infra_failure"):
                    status = scored.get("status") or classify_case_status(scored)
                    log(
                        {
                            "prefix": prefix,
                            "message": f"FAIL - {status} after {elapsed:.1f}s",
                            "level": "info",
                        }
                    )
                else:
                    log(
                        {
                            "prefix": prefix,
                            "message": (
                                f"completed - {elapsed:.1f}s - score "
                                f"{scored.get('total')}/{scored.get('max_total')} ({scored.get('status')})"
                            ),
                            "level": "info",
                        }
                    )

                # Incremental aggregate + checkpoint after each question
                partial_models = list(result["models"])
                display_name = name if live else f"fake({name})"
                # Replace in-progress model aggregate
                in_progress = aggregate_model_results(display_name, case_scores, gate_cfg)
                remaining = [item for item in partial_models if item.get("model") != display_name]
                result["models"] = remaining + [in_progress]
                result["decision"] = choose_recommendation(result["models"])
                _checkpoint(out_path, result, on_progress=log)

            display_name = name if live else f"fake({name})"
            final_model = aggregate_model_results(display_name, case_scores, gate_cfg)
            result["models"] = [item for item in result["models"] if item.get("model") != display_name] + [final_model]
            result["decision"] = choose_recommendation(result["models"])
            _checkpoint(out_path, result, on_progress=log)

    except KeyboardInterrupt:
        cancelled = True
        result["cancelled"] = True
        result["decision"] = {
            "recommended": None,
            "why": "Benchmark cancelled by user (KeyboardInterrupt). Partial results retained where available.",
        }
        _checkpoint(out_path, result, on_progress=log)
        log({"message": "Benchmark cancelled (Ctrl+C). Partial results retained.", "level": "info"})

    if not cancelled:
        result["decision"] = choose_recommendation(result["models"])
        _checkpoint(out_path, result, on_progress=log)
    return result
