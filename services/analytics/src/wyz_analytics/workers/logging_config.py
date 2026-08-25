"""Structured logging for analytics workers."""

from __future__ import annotations

import logging
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
            if key in {"worker_token", "token", "authorization"}:
                continue
            parts.append(f"{key}={value}")
        if record.exc_info:
            parts.append(f"error={self.formatException(record.exc_info).replace(chr(10), ' | ')}")
        return " ".join(parts)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(StructuredFormatter())
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    logging.getLogger("wyz_analytics").setLevel(getattr(logging, level.upper(), logging.INFO))


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    logger.info(event, extra=fields)
