"""Execute v2_partner strategic judgment path (Phase 2C / 2D reconsider)."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.strategy.assessment import ScenarioRef, StrategicAssessment
from wyz_analytics.ai_cfo.strategy.cfo_actions import build_strategic_cfo_actions
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.decision_evidence import build_decision_evidence_pack
from wyz_analytics.ai_cfo.strategy.decision_frame import build_decision_frame
from wyz_analytics.ai_cfo.strategy.fallback import (
    apply_model_decision_to_assessment,
    build_strategic_fallback_decision,
)
from wyz_analytics.ai_cfo.strategy.model_decision import parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.reasoning_input import build_strategic_model_input
from wyz_analytics.ai_cfo.strategy.followup_answers import compose_reconsideration_presentation
from wyz_analytics.ai_cfo.strategy.scenario_context import (
    model_facing_scenario_context,
    resolve_scenario_context_for_reconsider,
    scenario_evidence_rows,
)
from wyz_analytics.ai_cfo.strategy.strategic_composer import compose_strategic_partner_answer
from wyz_analytics.ai_cfo.strategy.thread import (
    RecommendationRevision,
    compute_revision_disposition,
    create_thread_from_strategic_result,
    update_thread_after_reconsider,
)
from wyz_analytics.ai_cfo.strategy.validation import validate_strategic_assessment


def run_strategic_partner_judgment(
    *,
    message: str,
    working_context: dict[str, Any],
    agent: Any,
    forced_calls: list[dict[str, Any]] | None = None,
    reconsider_thread: Any | None = None,
) -> tuple[dict[str, Any], dict[str, Any], StrategicAssessment]:
    """Call model for strategic judgment, validate, compose answer.

    When reconsider_thread is set, conversation/scenario context is attached for Phase 2D
    reconsideration. Scenario presence never raises the decision-confidence ceiling.
    """
    # Reconsider must re-evaluate the ORIGINAL decision under current scope.
    frame_message = message
    if reconsider_thread is not None and reconsider_thread.original_question:
        frame_message = reconsider_thread.original_question

    plane = build_strategic_control_plane(
        frame_message,
        capability_is_strategic=True,
        financial_scope=working_context.get("financial_scope"),
        context=working_context,
        strategy_mode=STRATEGY_MODE_V2_PARTNER,
    )
    assessment: StrategicAssessment = plane["assessment"]
    pack = plane["diagnosis_pack"]
    contract = plane["reasoning_contract"]
    contract.recommendations_enabled = True

    conversation_context = None
    scenario_context = None
    scenario_context_full = None
    prior_action = None
    prior_strength = None
    prior_confidence = None
    if reconsider_thread is not None:
        prior_action = reconsider_thread.selected_action
        prior_strength = reconsider_thread.recommendation_strength
        prior_confidence = reconsider_thread.decision_confidence
        conversation_context = {
            "previous_action": prior_action,
            "previous_strength": prior_strength,
            "previous_confidence": prior_confidence,
            "previous_position_key": reconsider_thread.position_key or reconsider_thread.current_position,
            "followup_type": "RECONSIDER",
            "thread_id": reconsider_thread.thread_id,
            "decision_theme": reconsider_thread.decision_theme,
            "prior_position": {
                "selected_action": prior_action,
                "strength": prior_strength,
                "confidence": prior_confidence,
                "position_key": reconsider_thread.position_key or reconsider_thread.current_position,
                "unknowns": list(reconsider_thread.unknowns or [])[:6],
            },
        }
        # Resolve lean ref → canonical same-scope ScenarioResult (never trust client numbers).
        tools = working_context.get("tools")
        financial_scope = working_context.get("financial_scope") or {}
        if tools is not None and financial_scope:
            scenario_context_full = resolve_scenario_context_for_reconsider(
                reconsider_thread,
                tools=tools,
                financial_scope=financial_scope,
            )
        scenario_context = model_facing_scenario_context(scenario_context_full)
        if scenario_context is None:
            # Fall back to lean keys only when re-sim unavailable (still no client numbers).
            ref = reconsider_thread.latest_scenario_ref
            if ref and ref.scope_hash == assessment.scope_hash:
                scenario_context = {
                    "type": "SCENARIO",
                    "scenario_ref": ref.scenario_ref,
                    "lever": ref.lever,
                    "direction": ref.direction,
                    "percentage": ref.percentage,
                    "mechanical_effects": [
                        {"metric_key": k, "direction": "UNKNOWN", "delta_kind": "KEY"}
                        for k in (ref.mechanical_effect_keys or [])[:4]
                    ],
                    "assumptions": [],
                    "provenance": "CALCULATED_SCENARIO",
                }
        if scenario_context and scenario_context.get("scenario_ref"):
            existing = list(pack.scenario_refs or [])
            digests = {r.digest for r in existing if r.digest}
            digest = scenario_context.get("scenario_ref")
            if digest not in digests:
                existing.append(
                    ScenarioRef(
                        scope_hash=str(scenario_context.get("scope_hash") or assessment.scope_hash or ""),
                        lever=scenario_context.get("lever"),
                        operation="PERCENT_CHANGE",
                        value=None,
                        digest=digest,
                    )
                )
                pack.scenario_refs = existing
            contract.scenario_refs = [r.to_dict() for r in pack.scenario_refs]

    envelope = working_context.get("evidence_envelope") or build_evidence_envelope(
        frame_message, working_context
    )

    decision_frame = build_decision_frame(
        frame_message, pack=pack, assessment=assessment, context=working_context
    )
    decision_evidence = build_decision_evidence_pack(
        theme=pack.theme or decision_frame.decision_theme,
        pack=pack,
        envelope=envelope,
        context=working_context,
    )
    contract.unknowns = list(decision_frame.relevant_unknowns)
    expanded_ids = list(dict.fromkeys(decision_evidence.all_ids() + list(contract.evidence_ids or [])))[:12]
    contract.evidence_ids = expanded_ids

    strategic_ids = list(decision_evidence.all_ids()) or list(
        pack.strategic_supporting_evidence_ids if pack else []
    ) or list(pack.evidence_ids if pack else [])
    known_ids = set(strategic_ids)
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            if isinstance(item, dict) and item.get("evidence_id"):
                known_ids.add(str(item["evidence_id"]))
    if scenario_context:
        for effect in scenario_context.get("mechanical_effects") or []:
            for key in ("scenario_evidence_id", "baseline_evidence_id"):
                if effect.get(key):
                    known_ids.add(str(effect[key]))

    model_input = build_strategic_model_input(
        message=frame_message if reconsider_thread is not None else message,
        assessment=assessment,
        pack=pack,
        eligibilities=plane.get("action_eligibility") or [],
        contract=contract,
        envelope=envelope,
        decision_frame=decision_frame,
        decision_evidence=decision_evidence,
        conversation_context=conversation_context,
        scenario_context=scenario_context,
    )

    invoke_meta: dict[str, Any] = {}
    raw = _invoke_strategic_model(
        agent,
        message=message,
        model_input=model_input,
        context=working_context,
        meta=invoke_meta,
    )
    model_selected = None
    model_priority = None
    if isinstance(raw, dict):
        model_selected = raw.get("selected_action") or raw.get("action")
        model_priority = raw.get("priority_candidate_id") or raw.get("priority") or raw.get("priority_id")

    truncated = bool(invoke_meta.get("strategic_output_truncated"))
    decision = parse_strategic_model_decision(raw)
    parse_valid = decision is not None and decision.selected_action is not None and not truncated
    scenario_digests = {r.digest for r in (pack.scenario_refs or []) if r.digest}

    require_priority = decision_frame.decision_theme.value == "PRIORITIZE" and bool(
        decision_frame.prioritize_candidates
    )
    allowed_priority_ids = {c.candidate_id for c in decision_frame.prioritize_candidates}

    validation = validate_strategic_model_decision(
        decision,
        contract=contract,
        known_evidence_ids=known_ids,
        allowed_scenario_digests=scenario_digests if scenario_digests else None,
        allowed_reason_keys=set(decision_frame.allowed_reason_keys),
        allowed_change_my_view_keys=set(decision_frame.allowed_change_my_view_keys),
        allowed_tradeoff_keys=set(decision_frame.allowed_tradeoff_keys),
        allowed_priority_candidate_ids=allowed_priority_ids if require_priority else None,
        require_priority_candidate=require_priority,
    )

    fallback_used = False
    answer_source = "model_strategic"
    failure_stage: str | None = None
    failure_codes: list[str] = []

    if truncated:
        failure_stage = "provider_output_truncated"
        failure_codes = ["finish_reason_length"]
    elif not parse_valid:
        failure_stage = "parse"
        failure_codes = ["missing_or_unparseable_strategic_model_decision"]
    elif not validation.ok:
        failure_stage = "validation"
        failure_codes = list(validation.errors)

    if not validation.ok or decision is None or not parse_valid or truncated:
        fallback_used = True
        answer_source = "deterministic_strategic_fallback"
        decision = build_strategic_fallback_decision(
            assessment=assessment,
            pack=pack,
            contract=contract,
            envelope=envelope,
        )
        validation = validate_strategic_model_decision(
            decision,
            contract=contract,
            known_evidence_ids=known_ids,
            allowed_scenario_digests=scenario_digests if scenario_digests else None,
            allowed_reason_keys=set(decision_frame.allowed_reason_keys),
            allowed_change_my_view_keys=set(decision_frame.allowed_change_my_view_keys),
            allowed_tradeoff_keys=set(decision_frame.allowed_tradeoff_keys),
            allowed_priority_candidate_ids=allowed_priority_ids if require_priority else None,
            require_priority_candidate=False,
        )
    elif validation.confidence_clamped or validation.strength_clamped:
        answer_source = "model_strategic_clamped"

    final_conf = validation.clamped_decision_confidence or contract.decision_confidence_ceiling
    final_strength = validation.clamped_strength or decision.recommendation_strength
    apply_model_decision_to_assessment(
        assessment,
        decision,
        final_confidence=final_conf,
        final_strength=final_strength,
    )
    assessment.next_actions = build_strategic_cfo_actions(
        decision=decision,
        assessment=assessment,
        pack=pack,
        message=message,
    )

    validate_strategic_assessment(
        assessment,
        active_scope_hash=assessment.scope_hash,
        known_evidence_ids=known_ids,
        allowed_actions=list(contract.allowed_actions),
    )

    cfo_actions = assessment.next_actions
    answer = compose_strategic_partner_answer(
        decision=decision,
        assessment=assessment,
        envelope=envelope,
        context=working_context,
        cfo_actions=cfo_actions,
        pack=pack,
        decision_evidence=decision_evidence,
        decision_frame=decision_frame,
        answer_source=answer_source,
        fallback_used=fallback_used,
        validation_meta=validation.to_dict(),
        tool_calls=forced_calls,
    )

    from wyz_analytics.ai_cfo.strategy.action_semantics import scope_comparison_mode

    filters = (working_context.get("financial_scope") or {}).get("filters") or working_context.get("filters")
    answer_telem = answer.get("telemetry") if isinstance(answer.get("telemetry"), dict) else {}

    revision = None
    if reconsider_thread is not None:
        new_action = decision.selected_action.value if decision.selected_action else None
        new_strength = final_strength.value if final_strength else None
        disposition = compute_revision_disposition(
            previous_action=prior_action,
            new_action=new_action,
            previous_strength=prior_strength,
            new_strength=new_strength,
        )
        revision = RecommendationRevision(
            disposition=disposition,
            previous_action=prior_action,
            new_action=new_action,
            previous_strength=prior_strength,
            new_strength=new_strength,
            reason_keys=[decision.primary_reason_key] if decision.primary_reason_key else [],
            evidence_ids=list(decision.supporting_evidence_ids or [])[:6],
        )
        thesis = decision.thesis
        if thesis and thesis.uncertainty_keys:
            unknowns = [str(u) for u in thesis.uncertainty_keys][:6]
        else:
            unknowns = [u.value for u in assessment.unknowns][:6]
        monitor_keys = (
            list(thesis.monitoring_metric_keys)[:8]
            if thesis and thesis.monitoring_metric_keys
            else list(reconsider_thread.monitoring_metric_keys)
        )
        updated_thread = update_thread_after_reconsider(
            reconsider_thread,
            selected_action=new_action,
            recommendation_strength=new_strength,
            decision_confidence=final_conf.value if final_conf else None,
            unknowns=unknowns,
            monitoring_metric_keys=monitor_keys,
            change_my_view_keys=list(decision.change_my_view_keys or reconsider_thread.change_my_view_keys),
            supporting_evidence_ids=list(decision.supporting_evidence_ids or [])[:8],
            primary_reason_key=decision.primary_reason_key,
            position_key=(thesis.position if thesis else None) or reconsider_thread.position_key,
            current_position=(thesis.position if thesis else None) or reconsider_thread.current_position,
            priority_candidate_id=decision.priority_candidate_id,
            revision=revision,
            turn_id=(working_context.get("conversation") or {}).get("turn_id"),
        )
        updated_thread.original_question = reconsider_thread.original_question
        updated_thread.latest_scenario_ref = reconsider_thread.latest_scenario_ref
        updated_thread.created_turn_id = reconsider_thread.created_turn_id
        answer["strategic_thread"] = updated_thread.to_lean_dict()

        # Preserve DEMAND_RESPONSE for marketing reconsideration when scenario is mechanical only.
        if reconsider_thread.decision_theme == "MARKETING" and "DEMAND_RESPONSE" not in {
            str(u).upper() for u in unknowns
        }:
            unknowns = list(unknowns) + ["DEMAND_RESPONSE"]
            updated_thread.unknowns = unknowns[:6]
            answer["strategic_thread"] = updated_thread.to_lean_dict()

        from wyz_analytics.ai_cfo.strategy.action_semantics import realize_strategic_action_semantics
        from wyz_analytics.ai_cfo.strategy.strategic_presentation import resolve_monitoring_labels

        semantics = realize_strategic_action_semantics(
            decision_theme=decision_frame.decision_theme,
            selected_action=decision.selected_action,
            subject=assessment.subject,
            priority_candidate=None,
            primary_reason_key=decision.primary_reason_key,
            position_key_or_text=(thesis.position if thesis else None) or decision.rationale,
            fallback_used=fallback_used,
        )
        headline = semantics.direct_answer
        why_text = (answer.get("strategic") or {}).get("why") or decision.rationale
        has_mech = bool(scenario_context_full and scenario_context_full.get("mechanical_effects"))
        if has_mech and reconsider_thread.decision_theme == "MARKETING":
            # Founder-facing reconsideration: mechanical sensitivity ≠ observed demand response.
            if disposition.value == "STRENGTHEN":
                headline = (
                    "The scenario strengthens the case for a measured reduction test, but I wouldn't "
                    "commit to a broad cut until we observe demand response."
                )
            elif disposition.value == "WEAKEN":
                headline = (
                    "I'd be more cautious now. The sensitivity still shows a mechanical CM2 lift, but "
                    "that alone isn't enough to push toward a broader cut while demand response remains unknown."
                )
            elif disposition.value == "CHANGE":
                headline = semantics.direct_answer
            else:
                headline = (
                    "The scenario strengthens the case for a measured reduction test, but I wouldn't "
                    "commit to a broad cut until we observe demand response."
                )

        uncertainty_list = list((answer.get("strategic") or {}).get("uncertainty") or [])
        if reconsider_thread.decision_theme == "MARKETING":
            demand_line = "We still don't know how revenue or orders respond when acquisition spend falls."
            if not any("demand" in str(u).lower() or "revenue" in str(u).lower() for u in uncertainty_list):
                uncertainty_list = [demand_line] + uncertainty_list

        monitor_labels = resolve_monitoring_labels(monitor_keys, theme=decision_frame.decision_theme)
        recon_body = compose_reconsideration_presentation(
            headline=headline,
            why=why_text,
            uncertainty=uncertainty_list[:3],
            next_step=semantics.next_step,
            monitoring=monitor_labels,
            revision_disposition=disposition.value,
            prior_action=prior_action,
            scenario_context=scenario_context_full,
            evidence=[],
        )
        recon_body["followup_type"] = "RECONSIDER"
        recon_body["thread_id"] = updated_thread.thread_id
        recon_body["revision"] = disposition.value
        recon_body["revision_detail"] = revision.to_dict()
        from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
            sanitize_founder_prose,
            sanitize_strategic_presentation_fields,
        )

        recon_body, pres_telem = sanitize_strategic_presentation_fields(recon_body)
        answer["strategic"] = recon_body
        answer["headline"] = sanitize_founder_prose(headline) or headline[:500]
        answer["telemetry"] = {
            **(answer.get("telemetry") or {}),
            **pres_telem,
            "strategic_scenario_effect_variant": recon_body.get("strategic_scenario_effect_variant"),
        }

        # Display scenario effect evidence (Python-owned re-simulation).
        scenario_rows = scenario_evidence_rows(
            scenario_context_full, scope_hash=str(assessment.scope_hash or "")
        )
        if scenario_rows:
            answer["evidence"] = scenario_rows
            answer["scenario_comparisons"] = [
                {
                    "metric": row.get("metric"),
                    "baseline_value": row.get("from_value"),
                    "scenario_value": row.get("to_value"),
                    "absolute_change": row.get("absolute_change"),
                    "display": row.get("display"),
                    "provenance": "CALCULATED_SCENARIO",
                }
                for row in scenario_rows
            ]
            answer["answer_kind"] = "STRATEGIC"
            # Keep strategic card primary; scenario rows render via evidence.
            answer["telemetry"] = {
                **(answer.get("telemetry") or {}),
                "scenario_evidence_shown": True,
                "scenario_evidence_provenance": "CALCULATED_SCENARIO",
            }
    else:
        # New strategic decision → create ACTIVE lean thread.
        thesis = decision.thesis
        subject_dict = assessment.subject.to_dict() if assessment.subject else None
        answer["strategic_thread"] = create_thread_from_strategic_result(
            message=message,
            scope_hash=str(assessment.scope_hash or ""),
            turn_id=(working_context.get("conversation") or {}).get("turn_id"),
            decision_theme=decision_frame.decision_theme.value if decision_frame else None,
            decision_type=assessment.decision_type.value if assessment.decision_type else None,
            subject=subject_dict,
            selected_action=decision.selected_action.value if decision.selected_action else None,
            recommendation_strength=final_strength.value if final_strength else None,
            decision_confidence=final_conf.value if final_conf else None,
            diagnosis_confidence=(
                assessment.diagnosis_confidence.value if assessment.diagnosis_confidence else None
            ),
            unknowns=(
                [str(u) for u in thesis.uncertainty_keys][:6]
                if thesis and thesis.uncertainty_keys
                else [u.value for u in assessment.unknowns][:6]
            ),
            monitoring_metric_keys=(
                list(thesis.monitoring_metric_keys)[:8]
                if thesis and thesis.monitoring_metric_keys
                else list(decision_frame.decision_specific_monitoring_metrics if decision_frame else [])[:8]
            ),
            change_my_view_keys=list(decision.change_my_view_keys or [])[:4],
            supporting_evidence_ids=list(decision.supporting_evidence_ids or [])[:8],
            primary_reason_key=decision.primary_reason_key,
            position_key=(thesis.position if thesis else None),
            priority_candidate_id=decision.priority_candidate_id,
            current_position=(thesis.position if thesis else None) or (decision.rationale or None),
        ).to_lean_dict()
        if isinstance(answer.get("strategic"), dict):
            answer["strategic"]["thread_id"] = answer["strategic_thread"]["thread_id"]

    telemetry = dict(plane.get("telemetry") or {})
    telemetry.update(
        {
            "strategic_model_called": bool(invoke_meta.get("strategic_model_called", True)),
            "strategic_reconsideration_model_called": bool(reconsider_thread is not None),
            "strategic_model_response_received": bool(invoke_meta.get("strategic_model_response_received")),
            "strategic_model_parse_valid": parse_valid and not fallback_used,
            "strategic_model_validation_valid": validation.ok and not fallback_used,
            "strategic_failure_stage": failure_stage,
            "strategic_failure_codes": failure_codes,
            "allowed_actions": [a.value for a in contract.allowed_actions],
            "model_selected_action": model_selected,
            "model_priority_candidate": model_priority,
            "final_selected_action": decision.selected_action.value if decision.selected_action else None,
            "selected_action": decision.selected_action.value if decision.selected_action else None,
            "selected_action_severity": None,
            "model_recommendation_strength": (
                decision.recommendation_strength.value if decision.recommendation_strength else None
            ),
            "final_recommendation_strength": final_strength.value if final_strength else None,
            "model_decision_confidence": (
                decision.decision_confidence.value if decision.decision_confidence else None
            ),
            "final_decision_confidence": final_conf.value if final_conf else None,
            "confidence_clamped": validation.confidence_clamped,
            "strength_clamped": validation.strength_clamped,
            "supporting_evidence_count": len(decision.supporting_evidence_ids),
            "scenario_ref_used": bool(decision.scenario_ref_digest) or bool(scenario_context),
            "strategic_fallback_used": fallback_used,
            "actions_emitted": len(cfo_actions),
            "decision_theme": decision_frame.decision_theme.value if decision_frame else telemetry.get("decision_theme"),
            "decision_frame_built": decision_frame is not None,
            "priority_candidate_count": answer_telem.get("priority_candidate_count"),
            "final_priority_candidate": answer_telem.get("final_priority_candidate"),
            "priority_candidate_label_resolved": answer_telem.get("priority_candidate_label_resolved"),
            "strategic_evidence_section_roles": answer_telem.get("strategic_evidence_section_roles"),
            "strategic_display_evidence_count": answer_telem.get("strategic_display_evidence_count"),
            "strategic_evidence_deduped_count": answer_telem.get("strategic_evidence_deduped_count"),
            "strategic_semantic_variant": answer_telem.get("strategic_semantic_variant"),
            "strategic_next_step_variant": answer_telem.get("strategic_next_step_variant"),
            "action_next_step_consistent": answer_telem.get("action_next_step_consistent"),
            "scope_comparison_mode": scope_comparison_mode(
                theme=decision_frame.decision_theme if decision_frame else None,
                filters=filters if isinstance(filters, dict) else {},
            ),
            "recommendations_enabled": True,
            "answer_source": answer_source,
            "provider_calls": invoke_meta.get("provider_calls"),
            "provider_latency_ms": invoke_meta.get("provider_latency_ms"),
            "strategic_provider_id": invoke_meta.get("provider_id"),
            "strategic_finish_reason": invoke_meta.get("finish_reason"),
            "strategic_request_max_tokens": invoke_meta.get("strategic_request_max_tokens"),
            "strategic_previous_action": prior_action,
            "strategic_current_action": decision.selected_action.value if decision.selected_action else None,
            "recommendation_revision_disposition": revision.disposition.value if revision else None,
            "conversation_context_used": bool(conversation_context),
            "strategic_thread_scenario_present": bool(scenario_context),
            "strategic_thread_scenario_scope_match": bool(scenario_context),
        }
    )
    if decision.selected_action:
        from wyz_analytics.ai_cfo.strategy.actions import action_severity

        telemetry["selected_action_severity"] = action_severity(decision.selected_action).value

    plane_payload = {
        "strategy_mode": STRATEGY_MODE_V2_PARTNER,
        "strategic_intent_detected": True,
        "assessment": assessment.to_dict(),
        "diagnosis_pack": pack.to_dict() if pack else None,
        "action_eligibility": [e.to_dict() for e in (plane.get("action_eligibility") or [])],
        "reasoning_contract": contract.to_dict(),
        "validation": plane.get("validation"),
        "recommendations_enabled": True,
    }
    working_context["strategic_control_plane"] = plane_payload

    return answer, telemetry, assessment


def _invoke_strategic_model(
    agent: Any,
    *,
    message: str,
    model_input: dict[str, Any],
    context: dict[str, Any],
    meta: dict[str, Any],
) -> Any:
    meta["strategic_model_called"] = True
    if not hasattr(agent, "run_strategic_turn"):
        meta["strategic_model_response_received"] = False
        meta["strategic_failure_stage"] = "provider_missing_method"
        return {"selected_action": None}

    result = agent.run_strategic_turn(message=message, model_input=model_input, context=context)
    meta["strategic_model_response_received"] = result is not None
    if isinstance(result, dict):
        provider_telemetry = result.get("_provider_telemetry") or {}
        meta["provider_calls"] = provider_telemetry.get("model_calls") or provider_telemetry.get("provider_calls")
        meta["provider_latency_ms"] = provider_telemetry.get("latency_ms")
        meta["provider_id"] = provider_telemetry.get("model") or getattr(agent, "id", None)
        meta["finish_reason"] = provider_telemetry.get("finish_reason")
        req = provider_telemetry.get("strategic_request") or {}
        meta["strategic_request_max_tokens"] = req.get("max_tokens")
        if result.get("_strategic_truncated") or provider_telemetry.get("parse_warning") == "strategic_output_truncated":
            meta["strategic_output_truncated"] = True
            meta.setdefault("strategic_failure_codes", []).append("finish_reason_length")
        elif provider_telemetry.get("parse_warning"):
            meta.setdefault("strategic_failure_codes", []).append(str(provider_telemetry["parse_warning"]))
    return result
