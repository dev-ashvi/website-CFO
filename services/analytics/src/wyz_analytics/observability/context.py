"""Request-scoped correlation context (contextvars)."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

_request_id: ContextVar[str | None] = ContextVar("wyz_request_id", default=None)
_dataset_id: ContextVar[str | None] = ContextVar("wyz_dataset_id", default=None)


def set_request_id(request_id: str | None) -> None:
    _request_id.set(request_id)


def get_request_id() -> str | None:
    return _request_id.get()


def set_dataset_id(dataset_id: str | None) -> None:
    _dataset_id.set(dataset_id)


def get_dataset_id() -> str | None:
    return _dataset_id.get()


def correlation_snapshot() -> dict[str, Any]:
    return {
        "request_id": get_request_id(),
        "dataset_id": get_dataset_id(),
    }
