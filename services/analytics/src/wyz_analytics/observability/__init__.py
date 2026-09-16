"""P1 observability — cross-cutting events, redaction, sinks. Reuses existing telemetry shapes."""

from __future__ import annotations

from wyz_analytics.observability.emit import emit_event, is_observability_enabled
from wyz_analytics.observability.events import ObservabilityEvent, new_event_id, new_request_id
from wyz_analytics.observability.redaction import redact_attributes, sanitize_for_log

__all__ = [
    "ObservabilityEvent",
    "emit_event",
    "is_observability_enabled",
    "new_event_id",
    "new_request_id",
    "redact_attributes",
    "sanitize_for_log",
]
