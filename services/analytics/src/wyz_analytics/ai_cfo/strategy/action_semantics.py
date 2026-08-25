"""Theme × Action semantic realization — founder-facing prose without choosing the action."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject
from wyz_analytics.ai_cfo.strategy.decision_frame import PrioritizeCandidate
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme


@dataclass(frozen=True)
class StrategicActionSemantics:
    """Deterministic realization of a final validated strategic choice."""

    theme: DecisionTheme
    action: ActionType | None
    subject: DecisionSubject | None
    priority_candidate_id: str | None
    direct_answer: str
    next_step: str | None
    semantic_variant: str | None
    next_step_variant: str | None
    priority_candidate_label_resolved: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "theme": self.theme.value,
            "action": self.action.value if self.action else None,
            "subject": self.subject.to_dict() if self.subject else None,
            "priority_candidate_id": self.priority_candidate_id,
            "direct_answer": self.direct_answer,
            "next_step": self.next_step,
            "semantic_variant": self.semantic_variant,
            "next_step_variant": self.next_step_variant,
            "priority_candidate_label_resolved": self.priority_candidate_label_resolved,
        }


def _subject_label(subject: DecisionSubject | None, *, default: str = "this channel") -> str:
    if subject and subject.entity:
        return str(subject.entity)
    return default


# ActionType × DecisionTheme → semantic variant key (not a recommendation chooser).
_SEMANTIC_VARIANT: dict[tuple[DecisionTheme, ActionType], str] = {
    (DecisionTheme.MARKETING, ActionType.EXPERIMENT): "marketing_controlled_reduction",
    (DecisionTheme.MARKETING, ActionType.OPTIMIZE): "marketing_optimize_pressure",
    (DecisionTheme.MARKETING, ActionType.REDUCE): "marketing_measured_reduce",
    (DecisionTheme.MARKETING, ActionType.INVESTIGATE): "marketing_investigate_drivers",
    (DecisionTheme.MARKETING, ActionType.MONITOR): "marketing_monitor",
    (DecisionTheme.MARKETING, ActionType.MAINTAIN): "marketing_maintain",
    (DecisionTheme.CHANNEL_EXIT, ActionType.EXPERIMENT): "channel_test_before_exit",
    (DecisionTheme.CHANNEL_EXIT, ActionType.INVESTIGATE): "channel_exit_hold",
    (DecisionTheme.CHANNEL_EXIT, ActionType.OPTIMIZE): "channel_improve_before_exit",
    (DecisionTheme.CHANNEL_EXIT, ActionType.MONITOR): "channel_monitor",
    (DecisionTheme.CHANNEL_EXIT, ActionType.PAUSE): "channel_pause",
    (DecisionTheme.CHANNEL_EXIT, ActionType.EXIT): "channel_exit",
    (DecisionTheme.SKU_EXIT, ActionType.EXPERIMENT): "sku_test_before_exit",
    (DecisionTheme.SKU_EXIT, ActionType.INVESTIGATE): "sku_exit_hold",
    (DecisionTheme.SKU_EXIT, ActionType.EXIT): "sku_exit",
    (DecisionTheme.PRICE, ActionType.EXPERIMENT): "price_bounded_test",
    (DecisionTheme.PRICE, ActionType.INVESTIGATE): "price_hold",
    (DecisionTheme.PRICE, ActionType.MONITOR): "price_monitor",
    (DecisionTheme.PRICE, ActionType.INCREASE): "price_increase_careful",
    (DecisionTheme.PRODUCT_COST, ActionType.OPTIMIZE): "product_cost_optimize",
    (DecisionTheme.PRODUCT_COST, ActionType.INVESTIGATE): "product_cost_investigate",
    (DecisionTheme.PRODUCT_COST, ActionType.REDUCE): "product_cost_reduce",
    (DecisionTheme.PRIORITIZE, ActionType.OPTIMIZE): "prioritize_focus",
    (DecisionTheme.PRIORITIZE, ActionType.INVESTIGATE): "prioritize_focus",
    (DecisionTheme.PRIORITIZE, ActionType.REDUCE): "prioritize_focus",
    (DecisionTheme.PRIORITIZE, ActionType.EXPERIMENT): "prioritize_focus",
    (DecisionTheme.PRIORITIZE, ActionType.MONITOR): "prioritize_monitor",
}


def semantic_variant_key(
    theme: DecisionTheme | None,
    action: ActionType | None,
) -> str | None:
    if not theme or not action:
        return None
    return _SEMANTIC_VARIANT.get((theme, action))


def resolve_strategic_position(
    *,
    decision_theme: DecisionTheme | None,
    selected_action: ActionType | None,
    subject: DecisionSubject | None = None,
    primary_reason_key: str | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
    position_key_or_text: str | None = None,
    fallback_used: bool = False,
) -> tuple[str, str | None]:
    """Return (founder-facing direct answer, semantic_variant).

    Does NOT choose selected_action — only realizes theme×action meaning.
    """
    theme = decision_theme or DecisionTheme.GENERIC
    variant = semantic_variant_key(theme, selected_action)

    if theme == DecisionTheme.PRIORITIZE:
        if priority_candidate:
            label = priority_candidate.founder_label()
            return (f"My first focus would be {label}.", "prioritize_focus")
        if fallback_used:
            return (
                "I can't reliably rank these pressures yet because the verified evidence isn't clear enough.",
                "prioritize_insufficient",
            )

    subject_name = _subject_label(subject, default="D2C" if theme == DecisionTheme.CHANNEL_EXIT else "this line")

    realized = _realize_variant(variant, subject_name=subject_name)
    if realized:
        return (realized, variant)

    from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
        is_internal_template_key,
        resolve_position_text,
        theme_fallback_copy,
    )

    if position_key_or_text and not is_internal_template_key(str(position_key_or_text).split(".")[0]):
        resolved = resolve_position_text(position_key_or_text)
        if resolved and not _is_cross_theme_leak(resolved, theme):
            return (resolved[:500], variant)

    if fallback_used:
        return (theme_fallback_copy(theme).split(".")[0].strip() + ".", "theme_fallback")

    defaults = {
        DecisionTheme.MARKETING: "I'd test a controlled reduction before making a broad cut.",
        DecisionTheme.CHANNEL_EXIT: (
            f"I wouldn't exit {subject_name} yet. The channel is under pressure, "
            "but the evidence isn't strong enough to justify an exit."
        ),
        DecisionTheme.SKU_EXIT: f"I wouldn't remove {subject_name} yet from the current evidence alone.",
        DecisionTheme.PRICE: "I wouldn't make a broad price increase from this evidence alone.",
        DecisionTheme.PRODUCT_COST: "I'd work on the verified product-cost pressure before broader commercial changes.",
        DecisionTheme.PRIORITIZE: "I can't reliably rank these pressures yet because the verified evidence isn't clear enough.",
        DecisionTheme.GENERIC: "I'd investigate the verified drivers before recommending a stronger move.",
    }
    return (defaults.get(theme, defaults[DecisionTheme.GENERIC]), variant or "theme_default")


def resolve_strategic_next_step(
    *,
    decision_theme: DecisionTheme | None,
    selected_action: ActionType | None,
    subject: DecisionSubject | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
) -> tuple[str | None, str | None]:
    """Realize next-step prose from FINAL selected action (not a separate next_step_action)."""
    theme = decision_theme or DecisionTheme.GENERIC
    action = selected_action
    subject_name = _subject_label(
        (priority_candidate.subject if priority_candidate and priority_candidate.subject else subject),
        default="this channel",
    )
    variant = semantic_variant_key(theme, action)

    if theme == DecisionTheme.PRIORITIZE and priority_candidate:
        label = priority_candidate.founder_label()
        if action == ActionType.MONITOR:
            return (f"I'd monitor {label} closely before acting.", "prioritize_monitor")
        if action == ActionType.EXPERIMENT:
            return (
                f"I'd run a bounded test focused on {label} before a broader change.",
                "prioritize_experiment",
            )
        if action == ActionType.OPTIMIZE:
            return (f"I'd optimize the controllable drivers behind {label}.", "prioritize_optimize")
        return (f"I'd dig into {label} next and isolate the controllable drivers.", "prioritize_investigate")

    next_map = {
        "marketing_controlled_reduction": (
            "Run a controlled marketing reduction and compare the contribution improvement "
            "against any deterioration in revenue or orders."
        ),
        "marketing_optimize_pressure": "I'd optimize the least productive marketing pressure points.",
        "marketing_measured_reduce": (
            "Run a controlled marketing reduction and compare the CM2 improvement "
            "against any deterioration in revenue or orders."
        ),
        "marketing_investigate_drivers": "I'd isolate which marketing drivers are least productive.",
        "marketing_monitor": "I'd monitor CM1, marketing %, CM2, and net revenue closely before acting.",
        "marketing_maintain": "I'd maintain current spend while monitoring margin response closely.",
        "channel_test_before_exit": (
            f"I'd run a bounded test of whether {subject_name} economics can improve before considering exit."
        ),
        "channel_exit_hold": f"I'd isolate whether {subject_name} weakness is channel-wide or concentrated in categories/SKUs.",
        "channel_improve_before_exit": f"I'd improve controllable pressures in {subject_name} before exit talk.",
        "channel_monitor": f"I'd monitor {subject_name} contribution, revenue share, and CM2 margin closely.",
        "channel_pause": f"I'd pause {subject_name} only if verified weakness remains after driver isolation.",
        "channel_exit": f"I'd exit {subject_name} and monitor portfolio contribution after the change.",
        "sku_test_before_exit": f"I'd test whether {subject_name} contribution can be corrected first.",
        "sku_exit_hold": f"I'd isolate persistence and concentration for {subject_name} before exit.",
        "sku_exit": f"I'd exit {subject_name} and monitor portfolio contribution after the change.",
        "price_bounded_test": "I'd test a bounded price change on a limited cohort before considering a broader increase.",
        "price_hold": "I'd establish whether pricing is actually the binding constraint.",
        "price_monitor": "I'd monitor gross margin %, CM1 margin, CM2 margin, and orders.",
        "price_increase_careful": "I'd increase prices carefully only after a bounded test supports it.",
        "product_cost_optimize": "I'd target the verified cost components from the scoped breakdown.",
        "product_cost_investigate": "I'd investigate which cost components dominate the pressure.",
        "product_cost_reduce": "I'd reduce the verified cost pressure in a measured way.",
    }
    if variant and variant in next_map:
        return (next_map[variant], variant)

    # Action-family fallbacks when theme×action mapping is missing.
    if action == ActionType.MONITOR:
        return ("I'd monitor the key metrics closely before acting.", "action_monitor")
    if action == ActionType.EXPERIMENT:
        return ("I'd run a controlled test before making a broader change.", "action_experiment")
    if action == ActionType.INVESTIGATE:
        return ("I'd investigate and isolate the verified drivers first.", "action_investigate")
    if action == ActionType.OPTIMIZE:
        return ("I'd optimize the verified pressure points next.", "action_optimize")
    if action == ActionType.REDUCE:
        return ("I'd reduce exposure in a measured way while monitoring response.", "action_reduce")
    if action == ActionType.INCREASE:
        return ("I'd increase carefully only after a bounded test supports it.", "action_increase")
    if action == ActionType.PAUSE:
        return ("I'd pause only if verified weakness remains after driver isolation.", "action_pause")
    if action == ActionType.EXIT:
        return ("I'd exit only with the current evidence burden already met.", "action_exit")
    return (None, None)


# Back-compat alias used by older imports.
def resolve_next_step_prose(
    *,
    decision_theme: DecisionTheme | None,
    next_action: ActionType | None,
    subject: DecisionSubject | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
) -> str | None:
    text, _ = resolve_strategic_next_step(
        decision_theme=decision_theme,
        selected_action=next_action,
        subject=subject,
        priority_candidate=priority_candidate,
    )
    return text


def realize_strategic_action_semantics(
    *,
    decision_theme: DecisionTheme | None,
    selected_action: ActionType | None,
    subject: DecisionSubject | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
    primary_reason_key: str | None = None,
    position_key_or_text: str | None = None,
    fallback_used: bool = False,
) -> StrategicActionSemantics:
    theme = decision_theme or DecisionTheme.GENERIC
    direct, variant = resolve_strategic_position(
        decision_theme=theme,
        selected_action=selected_action,
        subject=subject,
        primary_reason_key=primary_reason_key,
        priority_candidate=priority_candidate,
        position_key_or_text=position_key_or_text,
        fallback_used=fallback_used,
    )
    next_step, next_variant = resolve_strategic_next_step(
        decision_theme=theme,
        selected_action=selected_action,
        subject=subject,
        priority_candidate=priority_candidate,
    )
    return StrategicActionSemantics(
        theme=theme,
        action=selected_action,
        subject=subject,
        priority_candidate_id=priority_candidate.candidate_id if priority_candidate else None,
        direct_answer=direct,
        next_step=next_step,
        semantic_variant=variant,
        next_step_variant=next_variant,
        priority_candidate_label_resolved=(
            priority_candidate.founder_label() if priority_candidate else None
        ),
    )


def action_next_step_consistent(
    *,
    selected_action: ActionType | None,
    next_step: str | None,
) -> bool:
    if not selected_action or not next_step:
        return True
    lower = next_step.lower()
    if selected_action == ActionType.EXPERIMENT:
        return any(tok in lower for tok in ("test", "experiment", "bounded", "controlled"))
    if selected_action == ActionType.MONITOR:
        return "monitor" in lower or "watch" in lower
    if selected_action == ActionType.INVESTIGATE:
        return any(tok in lower for tok in ("investigate", "isolate", "dig", "establish", "diagnos"))
    if selected_action == ActionType.OPTIMIZE:
        return "optim" in lower or "improve" in lower or "target" in lower
    if selected_action == ActionType.EXIT:
        return "exit" in lower
    if selected_action == ActionType.PAUSE:
        return "pause" in lower
    return True


def _realize_variant(variant: str | None, *, subject_name: str) -> str | None:
    if not variant:
        return None
    copy = {
        "marketing_controlled_reduction": "I'd test a controlled reduction before making a broad cut.",
        "marketing_optimize_pressure": "I'd optimize verified marketing pressure before cutting broadly.",
        "marketing_measured_reduce": "I'd reduce marketing in a measured way, not with a broad cut.",
        "marketing_investigate_drivers": "I'd investigate which marketing drivers are least productive first.",
        "marketing_monitor": "I'd maintain current spend while monitoring margin response closely.",
        "marketing_maintain": "I'd maintain current spend while monitoring margin response closely.",
        "channel_test_before_exit": (
            f"I wouldn't exit {subject_name} yet. I'd test whether its economics can be improved "
            "before considering an exit."
        ),
        "channel_exit_hold": (
            f"I wouldn't exit {subject_name} yet. The channel is under pressure, "
            "but the evidence isn't strong enough to justify an exit."
        ),
        "channel_improve_before_exit": (
            f"I wouldn't exit {subject_name} yet. I'd improve controllable pressures first."
        ),
        "channel_monitor": f"I wouldn't exit {subject_name} yet. I'd monitor channel contribution closely first.",
        "channel_pause": f"I'd pause {subject_name} activity only if verified weakness remains after driver isolation.",
        "channel_exit": f"I'd exit {subject_name} — persistent negative contribution meets the evidence burden.",
        "sku_test_before_exit": (
            f"I wouldn't remove {subject_name} yet. I'd test whether the contribution problem can be corrected first."
        ),
        "sku_exit_hold": f"I wouldn't remove {subject_name} yet from the current evidence alone.",
        "sku_exit": f"I'd exit {subject_name} — persistent negative contribution is material.",
        "price_bounded_test": "I wouldn't make a broad price change yet. I'd run a bounded pricing test first.",
        "price_hold": "I wouldn't make a broad price increase from this evidence alone.",
        "price_monitor": "I wouldn't raise prices yet. I'd monitor margin structure first.",
        "price_increase_careful": "I'd increase prices carefully only after a bounded test supports it.",
        "product_cost_optimize": "I'd work on the verified product-cost pressure before making broader commercial changes.",
        "product_cost_investigate": "I'd investigate which cost components are driving the pressure first.",
        "product_cost_reduce": "I'd reduce the verified cost pressure in a measured way.",
    }
    return copy.get(variant)


def _is_cross_theme_leak(text: str, theme: DecisionTheme) -> bool:
    lower = text.lower()
    if theme == DecisionTheme.CHANNEL_EXIT and "controlled reduction" in lower and "exit" not in lower:
        return True
    if theme == DecisionTheme.CHANNEL_EXIT and "broad cut" in lower and "exit" not in lower:
        return True
    if theme == DecisionTheme.PRICE and "controlled reduction" in lower:
        return True
    if theme == DecisionTheme.PRIORITIZE and "investigate the verified drivers" in lower:
        return True
    return False


def scope_comparison_mode(*, theme: DecisionTheme | None, filters: dict[str, Any] | None) -> str:
    filters = filters if isinstance(filters, dict) else {}
    if theme == DecisionTheme.CHANNEL_EXIT:
        if filters.get("channel"):
            return "within_channel_concentration"
        return "multi_channel_peer_comparison"
    if theme == DecisionTheme.SKU_EXIT:
        return "peer_sku_comparison"
    return "none"
