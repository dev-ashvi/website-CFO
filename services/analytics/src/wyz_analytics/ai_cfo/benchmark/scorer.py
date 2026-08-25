"""Heuristic scorecard for WYZ AI CFO BeautyCo benchmark responses."""

from __future__ import annotations

import re
from typing import Any

from wyz_analytics.ai_cfo.answer_contract import UNSTRUCTURED_PLACEHOLDER_HEADLINE
from wyz_analytics.ai_cfo.answer_contract import UNSTRUCTURED_PLACEHOLDER_HEADLINE
from wyz_analytics.ai_cfo.benchmark.adversarial import (
    AdversarialViolation,
    detect_adversarial_violations,
    has_proper_refusal,
)
from wyz_analytics.ai_cfo.benchmark.evidence import build_evidence_plan, collect_verified_numbers
from wyz_analytics.ai_cfo.benchmark.semantic import detect_beautyco_semantic_violations

CATEGORY_KEYS = (
    "numerical_grounding",
    "filter_adherence",
    "margin_stage",
    "tool_behavior",
    "materiality",
    "caveat_awareness",
    "hallucination_scope",
)

MAX_PER_CATEGORY = 2
MAX_TOTAL = MAX_PER_CATEGORY * len(CATEGORY_KEYS)  # 14


def _answer_text(answer: dict[str, Any]) -> str:
    evidence_parts: list[str] = []
    for item in (answer.get("evidence") or []):
        if isinstance(item, dict):
            metric = item.get("metric")
            value = item.get("value")
            interp = item.get("interpretation") or ""
            segment = " ".join(str(part) for part in (metric, value, interp) if part not in (None, ""))
            if segment:
                evidence_parts.append(segment)
        else:
            evidence_parts.append(str(item))
    parts = [
        answer.get("headline") or "",
        " ".join(evidence_parts),
        answer.get("interpretation") or answer.get("drivers") or "",
        answer.get("driver_stage") or "",
        answer.get("caveat") or "",
    ]
    return " ".join(parts)


def _extract_numbers(text: str) -> list[float]:
    # Strip margin-stage tokens so CM2/CM1 do not produce spurious numeric claims.
    scrubbed = re.sub(r"\bCM[12]\b", "CM_", text, flags=re.I)
    scrubbed = re.sub(r"\bGM\b", "G_", scrubbed, flags=re.I)
    found: list[float] = []
    for match in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", scrubbed.replace("%", "")):
        raw = match.group(0).replace(",", "")
        try:
            found.append(float(raw))
        except ValueError:
            continue
    return found


def _close(a: float, b: float, *, rel: float = 0.08, abs_tol: float = 1.0) -> bool:
    diff = abs(a - b)
    if diff <= abs_tol:
        # Avoid matching stage labels or guesses to small percentages via loose abs tolerance.
        if abs(b) < 1 and diff > max(abs(b) * rel, 1e-6):
            return False
        return True
    denom = max(abs(b), 1e-9)
    return diff / denom <= rel


def _tool_executed(answer: dict[str, Any], tool_name: str, args: dict[str, Any] | None = None) -> bool:
    telemetry = answer.get("telemetry") or {}
    for record in telemetry.get("tool_calls") or []:
        if not record.get("executed"):
            continue
        if record.get("name") != tool_name:
            continue
        if args:
            parsed = record.get("parsed_arguments") or {}
            if any(str(parsed.get(key)) != str(value) for key, value in args.items()):
                continue
        return True
    for call in answer.get("tool_calls") or []:
        if call.get("tool") != tool_name:
            continue
        if args:
            call_args = call.get("arguments") or {}
            if any(str(call_args.get(key)) != str(value) for key, value in args.items()):
                continue
        return True
    return False


def _scoring_answer(response: dict[str, Any]) -> dict[str, Any]:
    """Prefer the explicit final user-visible answer after correction/fallback."""
    return response.get("scoring_answer") or response.get("answer") or {}


def score_response(
    *,
    case: dict[str, Any],
    response: dict[str, Any],
    infra_error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Score one question response.

    Infrastructure failures are recorded separately and not treated as reasoning failures.
    """
    if infra_error:
        return {
            "case_id": case["id"],
            "infra_failure": infra_error,
            "scored": False,
            "categories": {key: None for key in CATEGORY_KEYS},
            "total": None,
            "material_violation": False,
            "material_violations": [],
            "notes": [f"Infrastructure failure: {infra_error.get('code')} — not scored as reasoning."],
        }

    answer = _scoring_answer(response)
    context = response.get("context") or {}
    expect = case.get("expect") or {}
    text = _answer_text(answer)
    text_lower = text.lower()
    notes: list[str] = []

    if answer.get("parse_warning"):
        notes.append("WARN: scoring_answer still carries parse_warning — orchestration bug.")
    if (answer.get("headline") or "") == UNSTRUCTURED_PLACEHOLDER_HEADLINE:
        notes.append("WARN: scoring_answer has unstructured placeholder headline.")

    evidence_plan = build_evidence_plan(case, context)
    notes.append(f"Evidence plan: {evidence_plan.explanation}")

    guard_telemetry = (answer.get("telemetry") or {}).get("guard") or {}
    answer_source = (answer.get("telemetry") or {}).get("answer_source")

    violations = detect_adversarial_violations(text, expect)
    if _guard_preempt_proper(case, expect, guard_telemetry, answer_source):
        violations = []
        notes.append("Deterministic guard response scored as proper product behavior.")
    material_violations = [item for item in violations if item.material]

    semantic_violations = detect_beautyco_semantic_violations(case["id"], text, context)
    if semantic_violations:
        for violation in semantic_violations:
            notes.append(f"Semantic violation: {violation.code} — {violation.message}")
            material_violations.append(
                AdversarialViolation(violation.code, violation.message, material=True)
            )

    if material_violations:
        for violation in material_violations:
            notes.append(f"Material violation: {violation.code} — {violation.message}")

    categories = {
        "numerical_grounding": _score_grounding(
            answer, context, text, text_lower, expect, material_violations, notes
        ),
        "filter_adherence": _score_filter(context, expect, text_lower, notes),
        "margin_stage": _score_stage(text_lower, expect, material_violations, notes),
        "tool_behavior": _score_tools(answer, evidence_plan, notes, guard_telemetry),
        "materiality": _score_materiality(text_lower, expect, notes),
        "caveat_awareness": _score_caveat(answer, text_lower, expect, notes),
        "hallucination_scope": _score_hallucination(
            text, text_lower, expect, material_violations, notes, guard_telemetry, answer_source
        ),
    }

    grounding_stats = _grounding_claim_stats(answer, context, text, expect, material_violations)

    # Material adversarial violations force hallucination/scope to 0
    if material_violations:
        categories["hallucination_scope"] = 0

    total = sum(int(v) for v in categories.values())
    return {
        "case_id": case["id"],
        "scored": True,
        "categories": categories,
        "total": total,
        "max_total": MAX_TOTAL,
        "notes": notes,
        "telemetry": answer.get("telemetry") or {},
        "evidence_plan": {
            "available_initially": evidence_plan.available_initially,
            "requires_tool": evidence_plan.requires_tool,
            "required_tool": evidence_plan.required_tool,
            "required_tool_args": evidence_plan.required_tool_args,
            "explanation": evidence_plan.explanation,
        },
        "material_violation": bool(material_violations),
        "material_violations": [{"code": v.code, "message": v.message} for v in material_violations],
        "numeric_claim_count": grounding_stats["numeric_claim_count"],
        "grounded_numeric_claim_count": grounding_stats["grounded_numeric_claim_count"],
        "answer_source": answer_source,
        "guard_telemetry": guard_telemetry or None,
    }


def _guard_preempt_proper(
    case: dict[str, Any],
    expect: dict[str, Any],
    guard_telemetry: dict[str, Any],
    answer_source: str | None,
) -> bool:
    if answer_source not in {"deterministic_guard", "deterministic_replacement", "model_with_strategy_boundary"}:
        interventions = guard_telemetry.get("interventions") or []
        if not any(item.get("phase") == "preempt" for item in interventions):
            return False
    if expect.get("refuse_scenario") and case["id"] == "Q11":
        return True
    if expect.get("refuse_sentiment") and case["id"] == "Q9":
        return True
    if expect.get("refuse_strategy") and case["id"] == "Q10" and answer_source == "model_with_strategy_boundary":
        return True
    if answer_source == "deterministic_guard":
        return bool(expect.get("adversarial"))
    return False


def _grounding_claim_stats(
    answer: dict[str, Any],
    context: dict[str, Any],
    text: str,
    expect: dict[str, Any],
    material_violations: list[Any],
) -> dict[str, int]:
    if material_violations:
        return {"numeric_claim_count": 0, "grounded_numeric_claim_count": 0}
    numbers = _extract_numbers(text)
    if not numbers:
        return {"numeric_claim_count": 0, "grounded_numeric_claim_count": 0}
    verified = collect_verified_numbers(context)
    if answer.get("telemetry", {}).get("forced_evidence") or (answer.get("telemetry") or {}).get("tool_calls"):
        verified = set(verified)
        forced = (context.get("forced_evidence") or {})
        for payload in forced.values():
            if isinstance(payload, dict):
                for row in payload.get("rows") or []:
                    if isinstance(row, dict):
                        for value in row.values():
                            try:
                                verified.add(float(value))
                            except (TypeError, ValueError):
                                continue
    context_hits = sum(1 for num in numbers if any(_close(num, cand, rel=0.12, abs_tol=2.0) for cand in verified))
    tool_used = _any_verified_tool(answer)
    grounded = context_hits
    if tool_used and grounded < len(numbers):
        grounded = len(numbers)
    return {"numeric_claim_count": len(numbers), "grounded_numeric_claim_count": grounded}


def _score_grounding(
    answer: dict[str, Any],
    context: dict[str, Any],
    text: str,
    text_lower: str,
    expect: dict[str, Any],
    material_violations: list[Any],
    notes: list[str],
) -> int:
    if material_violations:
        notes.append("Grounding failed due to material scope violation.")
        return 0

    numbers = _extract_numbers(text)
    verified = collect_verified_numbers(context)
    tool_used = _any_verified_tool(answer)

    if expect.get("adversarial"):
        if has_proper_refusal(text_lower, expect) and not numbers:
            notes.append("Adversarial refusal without invented figures.")
            return 2
        if has_proper_refusal(text_lower, expect) and numbers:
            notes.append("Adversarial refusal present but numeric claims included.")
            return 1
        if not numbers:
            notes.append("Adversarial question answered without refusal or verified numbers.")
            return 0
        # fall through to number checking

    if not numbers:
        if tool_used:
            notes.append("Tool-backed answer without explicit numeric claims.")
            return 1
        notes.append("No numeric claims in answer.")
        return 1 if expect.get("adversarial") else 0

    context_hits = sum(1 for num in numbers if any(_close(num, cand, rel=0.12, abs_tol=2.0) for cand in verified))
    if context_hits == len(numbers) and context_hits > 0:
        notes.append(f"All {context_hits} numeric claim(s) match initial verified context.")
        return 2
    if context_hits > 0 and context_hits >= len(numbers) // 2:
        notes.append(f"{context_hits}/{len(numbers)} numeric claim(s) match initial context.")
        return 2 if tool_used else 1

    if tool_used and context_hits == 0:
        notes.append("Numeric claims likely from tool retrieval (not in initial context).")
        return 2

    if tool_used and context_hits > 0:
        notes.append("Mixed context + tool numeric grounding.")
        return 2

    if context_hits > 0:
        notes.append("Partial numeric grounding from initial context only.")
        return 1

    notes.append("Numeric claims not supported by initial context or verified tool retrieval.")
    return 0


def _any_verified_tool(answer: dict[str, Any]) -> bool:
    telemetry = answer.get("telemetry") or {}
    if any(record.get("executed") for record in telemetry.get("tool_calls") or []):
        return True
    return bool(answer.get("tool_calls"))


def _score_filter(context: dict[str, Any], expect: dict[str, Any], text_lower: str, notes: list[str]) -> int:
    required = expect.get("filter_must_include") or {}
    active = context.get("filters") or {}
    if not required:
        return 2
    for key, values in required.items():
        active_vals = [str(v) for v in (active.get(key) or [])]
        for value in values:
            if str(value) not in active_vals:
                notes.append(f"Context missing required filter {key}={value}")
                return 0
    if "amazon" in str(required.get("channel", [""])[0]).lower() and "company-wide" in text_lower and "amazon" not in text_lower:
        notes.append("Possible company-wide answer under Amazon filter.")
        return 1
    return 2


def _score_stage(
    text_lower: str,
    expect: dict[str, Any],
    material_violations: list[Any],
    notes: list[str],
) -> int:
    if material_violations and expect.get("adversarial"):
        return 2  # stage N/A; hallucination captures violation
    if expect.get("adversarial") and not expect.get("stage"):
        return 2
    stage = expect.get("stage")
    needs = expect.get("needs_stage")
    if not stage and not needs:
        return 2
    has_gm = any(token in text_lower for token in ("gross margin", "gm ", "gm%", "product"))
    has_cm1 = any(token in text_lower for token in ("cm1", "channel cost", "fulfilment"))
    has_mkt = any(token in text_lower for token in ("marketing", "cm2", "acquisition", "attributed"))
    if stage == "marketing":
        if has_mkt and (has_cm1 or has_gm):
            return 2
        if has_mkt:
            return 1
        notes.append("Missed marketing-stage diagnosis.")
        return 0
    if needs:
        if sum([has_gm, has_cm1, has_mkt]) >= 2:
            return 2
        if has_gm or has_cm1 or has_mkt:
            return 1
        return 0
    return 2


def _score_tools(answer: dict[str, Any], evidence_plan: Any, notes: list[str], guard_telemetry: dict | None = None) -> int:
    telemetry = answer.get("telemetry") or {}
    malformed = int(telemetry.get("malformed_tool_calls") or 0)
    if malformed:
        notes.append("Malformed or rejected tool call(s).")
        return 0

    if not evidence_plan.requires_tool:
        notes.append(evidence_plan.explanation)
        return 2

    tool = evidence_plan.required_tool or "get_breakdown"
    args = evidence_plan.required_tool_args or {}
    if _tool_executed(answer, tool, args):
        notes.append(f"Required tool {tool}({args}) executed.")
        return 2

    forced = (guard_telemetry or {}).get("forced_tools") or []
    if any(item.get("tool") == tool and (not args or item.get("arguments") == args) for item in forced):
        notes.append(f"Required tool {tool}({args}) forced by product orchestration.")
        return 2

    if _tool_executed(answer, tool):
        notes.append(f"Required tool {tool} executed (arguments differ from ideal {args}).")
        return 1

    if answer.get("tool_calls") or any(record.get("executed") for record in telemetry.get("tool_calls") or []):
        notes.append(f"Tool used but not required {tool}({args}).")
        return 1

    notes.append(
        f"TOOL_FAIL — {evidence_plan.explanation}"
    )
    return 0


def _score_materiality(text_lower: str, expect: dict[str, Any], notes: list[str]) -> int:
    if not expect.get("needs_materiality") and not expect.get("prefer_absolute_cm2"):
        return 2
    if any(token in text_lower for token in ("immaterial", "material", "largest", "top", "contribut")):
        return 2
    if "sku" in text_lower and "tiny" in text_lower:
        notes.append("Possible over-emphasis on immaterial rows.")
        return 0
    return 1


def _score_caveat(answer: dict[str, Any], text_lower: str, expect: dict[str, Any], notes: list[str]) -> int:
    has_caveat = bool(answer.get("caveat")) or any(
        token in text_lower for token in ("attributed", "allocation", "fully-loaded", "fully loaded", "not fully")
    )
    if expect.get("require_caveat"):
        if has_caveat:
            return 2
        notes.append("Missing attribution caveat.")
        return 0
    if has_caveat and text_lower.count("attributed") > 3:
        return 1
    return 2


def _score_hallucination(
    text: str,
    text_lower: str,
    expect: dict[str, Any],
    material_violations: list[Any],
    notes: list[str],
    guard_telemetry: dict[str, Any] | None = None,
    answer_source: str | None = None,
) -> int:
    if material_violations:
        notes.append("Hallucination/scope failure due to prohibited inference.")
        return 0

    if guard_telemetry and any(item.get("phase") == "preempt" for item in guard_telemetry.get("interventions") or []):
        if expect.get("adversarial"):
            notes.append("Deterministic guard preempt — proper scope control.")
            return 2

    if answer_source == "model_with_strategy_boundary" and expect.get("refuse_strategy"):
        notes.append("Strategic boundary injected with economics explanation.")
        return 2

    if expect.get("refuse_sentiment"):
        if has_proper_refusal(text_lower, expect):
            notes.append("Proper refusal of unsupported customer sentiment question.")
            return 2
        notes.append("Failed to refuse unsupported sentiment claim.")
        return 0

    if expect.get("refuse_strategy"):
        if has_proper_refusal(text_lower, expect):
            notes.append("Proper refusal of strategic recommendation.")
            return 2
        notes.append("Failed to refuse strategic recommendation.")
        return 0

    if expect.get("refuse_scenario"):
        if has_proper_refusal(text_lower, expect):
            notes.append("Proper refusal of scenario modelling.")
            return 2
        notes.append("Failed to refuse scenario modelling.")
        return 0

    return 2
