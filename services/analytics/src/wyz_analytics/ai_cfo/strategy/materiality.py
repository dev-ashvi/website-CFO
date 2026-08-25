"""Semantic materiality classes for strategic eligibility (no magic scores)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AbsoluteImpactClass(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class ContributionShareClass(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class SeverityClass(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


@dataclass
class Materiality:
    """Classed materiality — not a single opaque score.

    Derived from existing CFO signal materiality / severity when present,
    otherwise from summary contribution semantics (cm2 sign + marketing pressure).
    """

    absolute_impact_class: AbsoluteImpactClass = AbsoluteImpactClass.UNKNOWN
    contribution_share_class: ContributionShareClass = ContributionShareClass.UNKNOWN
    severity_class: SeverityClass = SeverityClass.UNKNOWN
    basis_evidence_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "absolute_impact_class": self.absolute_impact_class.value,
            "contribution_share_class": self.contribution_share_class.value,
            "severity_class": self.severity_class.value,
            "basis_evidence_ids": list(self.basis_evidence_ids),
        }

    @property
    def supports_high_impact(self) -> bool:
        """True when issue is material enough to consider PAUSE/EXIT burden checks."""
        if self.severity_class == SeverityClass.HIGH:
            return True
        if self.absolute_impact_class == AbsoluteImpactClass.HIGH:
            return True
        if (
            self.absolute_impact_class == AbsoluteImpactClass.MEDIUM
            and self.contribution_share_class in {ContributionShareClass.MEDIUM, ContributionShareClass.HIGH}
        ):
            return True
        return False

    @property
    def is_low(self) -> bool:
        return (
            self.absolute_impact_class == AbsoluteImpactClass.LOW
            or self.contribution_share_class == ContributionShareClass.LOW
            or self.severity_class == SeverityClass.LOW
        ) and not self.supports_high_impact


def _class_from_materiality_float(value: float | None) -> AbsoluteImpactClass:
    if value is None:
        return AbsoluteImpactClass.UNKNOWN
    if value >= 0.15:
        return AbsoluteImpactClass.HIGH
    if value >= 0.05:
        return AbsoluteImpactClass.MEDIUM
    if value > 0:
        return AbsoluteImpactClass.LOW
    return AbsoluteImpactClass.UNKNOWN


def _share_from_materiality_float(value: float | None) -> ContributionShareClass:
    if value is None:
        return ContributionShareClass.UNKNOWN
    if value >= 0.15:
        return ContributionShareClass.HIGH
    if value >= 0.05:
        return ContributionShareClass.MEDIUM
    if value > 0:
        return ContributionShareClass.LOW
    return ContributionShareClass.UNKNOWN


def _severity_from_signal(severity: str | None) -> SeverityClass:
    text = str(severity or "").lower()
    if text == "high":
        return SeverityClass.HIGH
    if text == "medium":
        return SeverityClass.MEDIUM
    if text == "low":
        return SeverityClass.LOW
    return SeverityClass.UNKNOWN


def derive_materiality(
    *,
    signals: list[dict[str, Any]] | None,
    summary: dict[str, Any] | None,
    evidence_ids: list[str] | None = None,
) -> Materiality:
    """Reuse CFO signal materiality/severity; fall back to summary pressure hints."""
    basis = list(evidence_ids or [])
    best: Materiality | None = None
    for signal in signals or []:
        if not isinstance(signal, dict):
            continue
        mat = signal.get("materiality")
        try:
            mat_f = float(mat) if mat is not None else None
        except (TypeError, ValueError):
            mat_f = None
        candidate = Materiality(
            absolute_impact_class=_class_from_materiality_float(mat_f),
            contribution_share_class=_share_from_materiality_float(mat_f),
            severity_class=_severity_from_signal(str(signal.get("severity") or "")),
            basis_evidence_ids=basis[:5],
        )
        if best is None or (
            candidate.supports_high_impact and not best.supports_high_impact
        ):
            best = candidate
        elif best and candidate.severity_class == SeverityClass.HIGH:
            best = candidate

    if best and best.absolute_impact_class != AbsoluteImpactClass.UNKNOWN:
        return best

    summary = summary or {}
    cm2 = summary.get("cm2")
    marketing_pct = summary.get("marketing_pct")
    cm1 = summary.get("cm1")
    # Semantic only: negative CM2 with positive CM1 is a known pressure pattern.
    if cm2 is not None and float(cm2) < 0 and cm1 is not None and float(cm1) > 0:
        return Materiality(
            absolute_impact_class=AbsoluteImpactClass.MEDIUM,
            contribution_share_class=ContributionShareClass.MEDIUM,
            severity_class=SeverityClass.MEDIUM,
            basis_evidence_ids=[eid for eid in basis if "cm2" in eid or "cm1" in eid][:5] or basis[:3],
        )
    if marketing_pct is not None and float(marketing_pct) >= 0.25:
        return Materiality(
            absolute_impact_class=AbsoluteImpactClass.MEDIUM,
            contribution_share_class=ContributionShareClass.MEDIUM,
            severity_class=SeverityClass.MEDIUM,
            basis_evidence_ids=[eid for eid in basis if "marketing" in eid][:5] or basis[:3],
        )
    if cm2 is not None and float(cm2) < 0:
        return Materiality(
            absolute_impact_class=AbsoluteImpactClass.LOW,
            contribution_share_class=ContributionShareClass.LOW,
            severity_class=SeverityClass.LOW,
            basis_evidence_ids=[eid for eid in basis if "cm2" in eid][:3] or basis[:2],
        )
    return Materiality(basis_evidence_ids=basis[:3])
