"""Human-readable BeautyCo AI CFO benchmark report."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status


def format_report(result: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("WYZ AI CFO - BeautyCo Model Benchmark")
    lines.append("=" * 40)
    mode = "LIVE openai_compatible" if result.get("live") else "OFFLINE fake model"
    if result.get("cancelled"):
        mode += " (CANCELLED)"
    lines.append(f"Mode: {mode}")
    if result.get("case_ids"):
        lines.append(f"Questions: {', '.join(result['case_ids'])}")
    if result.get("http_timeout_sec") is not None:
        lines.append(
            f"Timeouts: http={result.get('http_timeout_sec')}s question={result.get('question_timeout_sec')}s"
        )
    if result.get("output_path"):
        lines.append(f"Output: {result['output_path']}")
    output_errors = result.get("output_write_errors") or []
    if output_errors:
        lines.append("Output write failures (not model/provider/reasoning failures):")
        for err in output_errors:
            lines.append(f"  - {err.get('path')}: {err.get('message')}")
    lines.append("")

    from wyz_analytics.ai_cfo.benchmark.cases import DEFAULT_MODELS

    def _canonical(name: str) -> str:
        text = name or ""
        if text.startswith("fake(") and text.endswith(")"):
            return text[5:-1]
        return text

    order = {name: index for index, name in enumerate(DEFAULT_MODELS)}
    ranked = sorted(
        result.get("models") or [],
        key=lambda item: (
            0 if item.get("gate_pass") else 1,
            -(item.get("avg_score") or -1),
            order.get(_canonical(item.get("model") or ""), 99),
            item.get("metrics", {}).get("avg_latency_ms") or 10**9,
        ),
    )

    lines.append(
        "| Rank | Model | Avg score | Fully grounded Qs | Numeric claims | Filter | Tools | Latency | Gate |"
    )
    lines.append(
        "| ---- | ----- | --------: | ----------------: | -------------: | -----: | ----: | ------: | ---- |"
    )
    for index, item in enumerate(ranked, start=1):
        metrics = item.get("metrics") or {}
        avg = item.get("avg_score")
        avg_s = f"{avg:.2f}/{item.get('max_score', 14)}" if avg is not None else "n/a"
        gate = "PASS" if item.get("gate_pass") else "FAIL"
        if metrics.get("scored_questions", 0) == 0 and metrics.get("infra_failed_questions", 0) > 0:
            gate = "INSUFFICIENT"
        claim_rate = metrics.get("numeric_claim_grounding_rate")
        claim_s = f"{claim_rate:.0%}" if claim_rate is not None else "n/a"
        lines.append(
            "| {rank} | {model} | {avg} | {fg:.0%} | {ng} | {f:.0%} | {t:.0%} | {lat} | {gate} |".format(
                rank=index,
                model=item.get("model"),
                avg=avg_s,
                fg=metrics.get("fully_grounded_question_rate") or metrics.get("grounding_rate") or 0,
                ng=claim_s,
                f=metrics.get("filter_adherence_rate") or 0,
                t=metrics.get("tool_success_rate") or 0,
                lat=_latency(metrics.get("avg_latency_ms")),
                gate=gate,
            )
        )

    lines.append("")
    lines.append(
        "Note: Fully grounded Qs = share with rubric numerical_grounding==2 (diagnostic). "
        "Gate uses Numeric claims grounding (verified claims / emitted claims)."
    )

    lines.append("")
    decision = result.get("decision") or {}
    recommended = decision.get("recommended")
    if recommended:
        lines.append(f"Recommended WYZ V1 model: {recommended}")
    else:
        lines.append("Recommended WYZ V1 model: none")
    lines.append(f"Why: {decision.get('why')}")
    lines.append("")

    for item in result.get("models") or []:
        lines.append("-" * 40)
        lines.append(f"Model: {item.get('model')}")
        summary = item.get("status_summary") or {}
        if summary:
            lines.append(
                "Status counts: "
                + ", ".join(f"{key}={summary[key]}" for key in sorted(summary))
            )
        metrics = item.get("metrics") or {}
        if any(metrics.get(key) for key in ("guard_preempted_turn_count", "guard_forced_tool_count")):
            lines.append(
                "Guard interventions: "
                f"preempt={metrics.get('guard_preempted_turn_count', 0)}, "
                f"forced_tools={metrics.get('guard_forced_tool_count', 0)}, "
                f"post_response={metrics.get('guard_post_response_intervention_count', 0)}, "
                f"retries={metrics.get('guard_retry_count', 0)}, "
                f"replacements={metrics.get('guard_deterministic_replacement_count', 0)}"
            )
        if metrics.get("numeric_claim_count_total"):
            lines.append(
                "Numeric claim grounding: "
                f"{metrics.get('grounded_numeric_claim_count_total', 0)}/"
                f"{metrics.get('numeric_claim_count_total', 0)} claims "
                f"({(metrics.get('numeric_claim_grounding_rate') or 0):.0%})"
            )
        if metrics.get("structured_output_valid_rate") is not None:
            initial_rate = metrics.get("structured_output_initial_valid_rate")
            after_rate = metrics.get("structured_output_after_correction_valid_rate")
            fb_rate = metrics.get("deterministic_fallback_rate")
            budget_usage = metrics.get("average_claim_budget_usage")
            budget_str = f", budget_usage={budget_usage:.2f}x" if budget_usage else ""
            lines.append(
                "Structured output: "
                f"initial_valid={_pct(initial_rate)}, "
                f"after_correction={_pct(after_rate)}, "
                f"fallback={_pct(fb_rate)}"
                f"{budget_str}"
            )
            lines.append(
                "  detail: "
                f"corrections={metrics.get('correction_attempt_count', 0)}/"
                f"{metrics.get('correction_success_count', 0)}, "
                f"budget_violations={metrics.get('claim_budget_violation_count', 0)}, "
                f"avg_claims={metrics.get('average_numeric_claims_per_answer', 0)}"
            )
        system = item.get("system_quality") or {}
        reliability = item.get("model_reliability") or {}
        if system:
            lines.append("")
            lines.append("SYSTEM QUALITY")
            system_gate = "PASS" if system.get("gate_pass") else "FAIL"
            lines.append(
                f"  {system.get('pass_count', 0)}/{system.get('scored_questions', 0)} PASS  "
                f"avg {system.get('avg_score')}/{item.get('max_score', 14)}  "
                f"grounding={_pct(system.get('numeric_claim_grounding_rate'))}  "
                f"filters={_pct(system.get('filter_adherence_rate'))}  "
                f"tools={_pct(system.get('tool_success_rate'))}  "
                f"material_violations={system.get('material_violation_count', 0)}  "
                f"gate={system_gate}"
            )
            if system.get("fully_grounded_question_rate") is not None:
                lines.append(
                    f"  diagnostic: fully_grounded_questions="
                    f"{_pct(system.get('fully_grounded_question_rate'))}"
                )
        if reliability:
            lines.append("MODEL RELIABILITY")
            lines.append(
                f"  semantic_contract={_pct(reliability.get('semantic_contract_valid_rate'))}  "
                f"evidence_ids={_pct(reliability.get('evidence_id_selection_valid_rate'))}  "
                f"insight_type={_pct(reliability.get('insight_type_valid_rate'))}  "
                f"driver_stage={_pct(reliability.get('driver_stage_valid_rate'))}"
            )
            lines.append(
                f"  insight_override={_pct(reliability.get('deterministic_insight_override_rate'))}  "
                f"driver_override={_pct(reliability.get('deterministic_driver_override_rate'))}  "
                f"det_semantic={_pct(reliability.get('deterministic_semantic_replacement_rate'))}"
            )
            lines.append(
                f"  model_answers={_pct(reliability.get('model_native_answer_rate'))}  "
                f"legacy_fallback={_pct(reliability.get('deterministic_fallback_rate'))}  "
                f"avg_provider_calls={reliability.get('average_provider_calls_per_answer')}  "
                f"native_latency={_latency(reliability.get('model_native_latency_ms'))}  "
                f"e2e_latency={_latency(reliability.get('end_to_end_latency_ms'))}"
            )
            origins = reliability.get("answer_origin_counts") or {}
            if origins:
                lines.append(
                    "  origins: "
                    + ", ".join(f"{key}={origins[key]}" for key in sorted(origins))
                )
        if item.get("reason"):
            lines.append(f"Gate failure: {item['reason']}")
        if item.get("material_violations"):
            lines.append("Material scope violations:")
            for violation in item["material_violations"]:
                lines.append(f"  - {violation.get('case_id')}: {violation.get('material_violations')}")
        if item.get("infra_failures"):
            lines.append("Infrastructure failures (not scored as reasoning):")
            for failure in item["infra_failures"]:
                err = failure.get("infra_failure") or {}
                status = failure.get("status") or classify_case_status(failure)
                lines.append(
                    f"  - {failure.get('case_id')}: {status} ({err.get('code')}) — {err.get('message')}"
                )
        lines.append("Per-question scores:")
        for case in item.get("cases") or []:
            status = case.get("status") or classify_case_status(case)
            if not case.get("scored"):
                lines.append(
                    f"  {case.get('case_id')}: {status} — {case.get('question') or ''}"
                )
                continue
            cats = case.get("categories") or {}
            detail = ", ".join(f"{key[0:3]}={cats.get(key)}" for key in cats)
            lines.append(
                f"  {case.get('case_id')}: {status} {case.get('total')}/{case.get('max_total')} "
                f"({detail}) — {case.get('headline') or ''}"
            )
            for note in case.get("notes") or []:
                lines.append(f"      note: {note}")
            if case.get("evidence_plan"):
                lines.append(f"      evidence: {case['evidence_plan'].get('explanation')}")
            trace = case.get("answer_trace") or {}
            if trace:
                lines.append(
                    "      answer_trace: "
                    f"source={trace.get('answer_source')}, "
                    f"initial={_short(trace.get('initial_headline'))}, "
                    f"corrected={_short(trace.get('corrected_headline'))}, "
                    f"final={_short(trace.get('final_headline'))}"
                )
            vd = case.get("validation_diagnostics")
            if vd and vd.get("all_violations"):
                lines.append(
                    f"      validation: evidence={vd.get('evidence_item_count')}, "
                    f"claims={vd.get('numeric_claim_count')}, "
                    f"corrected={vd.get('correction_succeeded')}, "
                    f"fallback={vd.get('deterministic_fallback_used')}"
                )
                for v in vd["all_violations"]:
                    lines.append(f"        - {v}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _short(value: str | None, limit: int = 80) -> str:
    if not value:
        return "n/a"
    text = str(value).replace("\n", " ")
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.0%}"


def _latency(value: int | None) -> str:
    if value is None:
        return "n/a"
    if value >= 1000:
        return f"{value / 1000:.1f}s"
    return f"{value}ms"
