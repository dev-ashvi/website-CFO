"""Serializable mapping contracts. No persistence in this phase."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class MappingOrigin(str, Enum):
    DETERMINISTIC = "deterministic"
    AI_PROPOSED = "ai_proposed"
    USER_CONFIRMED = "user_confirmed"
    REMEMBERED = "remembered_mapping"


class MappingStatus(str, Enum):
    PROPOSED = "proposed"
    AUTO_ACCEPTED = "auto_accepted"
    REVIEW_RECOMMENDED = "review_recommended"
    USER_CONFIRMATION_REQUIRED = "user_confirmation_required"
    REJECTED = "rejected"
    CONFIRMED = "confirmed"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _enum_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    return value


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if dataclass_instance(value):
        return to_jsonable(asdict(value))
    return value


def dataclass_instance(value: Any) -> bool:
    return hasattr(value, "__dataclass_fields__") and not isinstance(value, type)


@dataclass
class ColumnMapping:
    source_column: str
    canonical_field: str
    origin: MappingOrigin = MappingOrigin.DETERMINISTIC
    status: MappingStatus = MappingStatus.PROPOSED
    model_confidence: float = 0.0
    validation_confidence: float | None = None
    final_confidence: float = 0.0
    evidence: tuple[str, ...] = ()
    alternatives: tuple[str, ...] = ()
    reason_code: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["origin"] = self.origin.value
        payload["status"] = self.status.value
        payload["evidence"] = list(self.evidence)
        payload["alternatives"] = list(self.alternatives)
        return payload


@dataclass
class FileMappingResult:
    source_file: str
    file_role: str
    confidence: float
    mappings: list[ColumnMapping] = field(default_factory=list)
    unmapped_source_columns: list[str] = field(default_factory=list)
    missing_required_fields: list[str] = field(default_factory=list)
    role_evidence: list[str] = field(default_factory=list)
    alternative_roles: list[dict[str, Any]] = field(default_factory=list)
    grain: dict[str, Any] = field(default_factory=dict)
    validation: dict[str, Any] = field(default_factory=dict)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_file": self.source_file,
            "file_role": self.file_role,
            "confidence": self.confidence,
            "mappings": [item.to_dict() for item in self.mappings],
            "unmapped_source_columns": list(self.unmapped_source_columns),
            "missing_required_fields": list(self.missing_required_fields),
            "role_evidence": list(self.role_evidence),
            "alternative_roles": list(self.alternative_roles),
            "grain": dict(self.grain),
            "validation": dict(self.validation),
            "diagnostics": list(self.diagnostics),
        }

    def mapping_dict(self) -> dict[str, str]:
        return {
            item.source_column: item.canonical_field
            for item in self.mappings
            if item.status
            not in {MappingStatus.REJECTED, MappingStatus.USER_CONFIRMATION_REQUIRED}
            or item.origin == MappingOrigin.USER_CONFIRMED
        }

    def accepted_mapping_dict(self) -> dict[str, str]:
        accepted = {
            MappingStatus.AUTO_ACCEPTED,
            MappingStatus.CONFIRMED,
            MappingStatus.REVIEW_RECOMMENDED,
        }
        return {
            item.source_column: item.canonical_field
            for item in self.mappings
            if item.status in accepted
            or item.origin in {MappingOrigin.USER_CONFIRMED, MappingOrigin.REMEMBERED}
        }


@dataclass
class MethodologySelections:
    """Client-specific interpretation that is not a financial formula."""

    platform_to_channel: dict[str, str] = field(default_factory=dict)
    cancelled_status_value: str = "Cancelled"
    all_categories_token: str = "All Categories"
    date_formats: tuple[str, ...] = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y")

    def to_dict(self) -> dict[str, Any]:
        return {
            "platform_to_channel": dict(self.platform_to_channel),
            "cancelled_status_value": self.cancelled_status_value,
            "all_categories_token": self.all_categories_token,
            "date_formats": list(self.date_formats),
        }


@dataclass
class MappingConfiguration:
    """Serializable per-client mapping memory. Persistence is later."""

    tenant_id: str | None = None
    workspace_id: str | None = None
    source_type: str = "commerce_finance"
    mapping_version: str = "v1"
    file_mappings: list[FileMappingResult] = field(default_factory=list)
    derived_fields: dict[str, str] = field(default_factory=dict)
    methodology: MethodologySelections = field(default_factory=MethodologySelections)
    created_at: str = field(default_factory=utc_now_iso)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "workspace_id": self.workspace_id,
            "source_type": self.source_type,
            "mapping_version": self.mapping_version,
            "file_mappings": [item.to_dict() for item in self.file_mappings],
            "derived_fields": dict(self.derived_fields),
            "methodology": self.methodology.to_dict(),
            "created_at": self.created_at,
            "notes": self.notes,
        }

    def mapping_for_role(self, role: str) -> FileMappingResult | None:
        for item in self.file_mappings:
            if item.file_role == role:
                return item
        return None
