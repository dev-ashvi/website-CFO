"""Emit ObservabilityEvent to structured stdout and optional rotating JSONL."""

from __future__ import annotations

import json
import logging
import threading
from logging.handlers import RotatingFileHandler
from typing import Any

from wyz_analytics.observability.config import ObservabilityConfig
from wyz_analytics.observability.context import get_dataset_id, get_request_id
from wyz_analytics.observability.events import ObservabilityEvent
from wyz_analytics.observability.redaction import redact_attributes
from wyz_analytics.workers.logging_config import log_event

logger = logging.getLogger("wyz_analytics.observability")

_CONFIG: ObservabilityConfig | None = None
_FILE_LOGGER: logging.Logger | None = None
_LOCK = threading.Lock()


def get_config() -> ObservabilityConfig:
    global _CONFIG
    if _CONFIG is None:
        _CONFIG = ObservabilityConfig.from_env()
    return _CONFIG


def reset_config_for_tests() -> None:
    global _CONFIG, _FILE_LOGGER
    with _LOCK:
        _CONFIG = None
        _FILE_LOGGER = None


def is_observability_enabled() -> bool:
    return get_config().enabled


def _file_logger() -> logging.Logger | None:
    global _FILE_LOGGER
    cfg = get_config()
    if not cfg.file_enabled or not cfg.file_path:
        return None
    with _LOCK:
        if _FILE_LOGGER is not None:
            return _FILE_LOGGER
        cfg.file_path.parent.mkdir(parents=True, exist_ok=True)
        file_logger = logging.getLogger("wyz_analytics.observability.file")
        file_logger.handlers.clear()
        file_logger.propagate = False
        file_logger.setLevel(logging.INFO)
        handler = RotatingFileHandler(
            cfg.file_path,
            maxBytes=cfg.max_bytes,
            backupCount=cfg.backup_count,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        file_logger.addHandler(handler)
        _FILE_LOGGER = file_logger
        return _FILE_LOGGER


def emit_event(
    event_name: str,
    *,
    component: str,
    category: str,
    severity: str = "INFO",
    request_id: str | None = None,
    conversation_id: str | None = None,
    turn_id: str | None = None,
    dataset_id: str | None = None,
    job_id: str | None = None,
    decision_id: str | None = None,
    scope_hash: str | None = None,
    duration_ms: int | None = None,
    attributes: dict[str, Any] | None = None,
    session_id: str | None = None,
) -> ObservabilityEvent | None:
    """Emit one safe structured event. Returns the event or None if disabled."""
    if not is_observability_enabled():
        return None
    event = ObservabilityEvent(
        event_name=event_name,
        component=component,
        category=category,
        severity=(severity or "INFO").upper(),
        request_id=request_id or get_request_id(),
        session_id=session_id,
        conversation_id=conversation_id,
        turn_id=turn_id,
        dataset_id=dataset_id or get_dataset_id(),
        job_id=job_id,
        decision_id=decision_id,
        scope_hash=scope_hash,
        duration_ms=duration_ms,
        attributes=redact_attributes(attributes),
    )
    payload = event.to_dict()
    # Stdout/stderr via existing log_event spine (JSON formatter when configured).
    level = getattr(logging, event.severity, logging.INFO)
    flat = {
        "event_name": event.event_name,
        "event_id": event.event_id,
        "component": event.component,
        "category": event.category,
        "severity": event.severity,
        "request_id": event.request_id,
        "conversation_id": event.conversation_id,
        "turn_id": event.turn_id,
        "dataset_id": event.dataset_id,
        "job_id": event.job_id,
        "decision_id": event.decision_id,
        "scope_hash": event.scope_hash,
        "duration_ms": event.duration_ms,
        **(event.attributes or {}),
        "_observability_json": json.dumps(payload, default=str, separators=(",", ":")),
    }
    flat = {k: v for k, v in flat.items() if v is not None}
    if level >= logging.ERROR:
        logger.error(event.event_name, extra=flat)
    elif level >= logging.WARNING:
        logger.warning(event.event_name, extra=flat)
    else:
        log_event(logger, event.event_name, **flat)

    file_logger = _file_logger()
    if file_logger is not None:
        file_logger.info(json.dumps(payload, default=str, separators=(",", ":")))
    return event
