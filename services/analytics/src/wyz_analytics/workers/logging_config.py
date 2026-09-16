"""Structured logging for analytics workers."""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any


class StructuredFormatter(logging.Formatter):
    """Key=value log lines safe for operations review."""

    RESERVED = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "_observability_json",
    }

    def format(self, record: logging.LogRecord) -> str:
        parts = [
            f"level={record.levelname}",
            f"logger={record.name}",
            f"event={record.getMessage()}",
        ]
        for key, value in sorted(record.__dict__.items()):
            if key in self.RESERVED or value is None:
                continue
            if key in {"worker_token", "token", "authorization", "api_key", "password"}:
                continue
            parts.append(f"{key}={value}")
        if record.exc_info:
            parts.append(f"error={self.formatException(record.exc_info).replace(chr(10), ' | ')}")
        return " ".join(parts)


class JsonFormatter(logging.Formatter):
    """Machine-readable JSON log lines for production pilot observability."""

    RESERVED = StructuredFormatter.RESERVED

    def format(self, record: logging.LogRecord) -> str:
        # Prefer pre-built observability envelope when present.
        raw = getattr(record, "_observability_json", None)
        if isinstance(raw, str) and raw.startswith("{"):
            return raw
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "event_name": record.getMessage(),
            "timestamp": self.formatTime(record, self.datefmt) if self.datefmt else None,
        }
        for key, value in record.__dict__.items():
            if key in self.RESERVED or value is None:
                continue
            if key in {"worker_token", "token", "authorization", "api_key", "password", "prompt", "messages"}:
                continue
            payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: str | None = None, log_format: str | None = None) -> None:
    resolved_level = (level or os.environ.get("WYZ_LOG_LEVEL") or os.environ.get("WYZ_ANALYTICS_LOG_LEVEL") or "INFO").upper()
    resolved_format = (log_format or os.environ.get("WYZ_LOG_FORMAT") or "json").strip().lower()
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stderr)
    if resolved_format == "kv":
        handler.setFormatter(StructuredFormatter())
    else:
        handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(getattr(logging, resolved_level, logging.INFO))
    logging.getLogger("wyz_analytics").setLevel(getattr(logging, resolved_level, logging.INFO))


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    logger.info(event, extra=fields)
