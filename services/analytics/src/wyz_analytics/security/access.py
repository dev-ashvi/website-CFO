"""Workspace / dataset / decision access helpers."""

from __future__ import annotations

from typing import Any

from wyz_analytics.security.config import SecurityConfig
from wyz_analytics.workers.errors import AnalyticsError, WORKSPACE_MISMATCH
from wyz_analytics.workers.service import AnalyticsWorkspace


class AccessDenied(AnalyticsError):
    def __init__(self, message: str = "Access denied for this workspace."):
        super().__init__(WORKSPACE_MISMATCH, message)


def trusted_workspace_id(config: SecurityConfig) -> str:
    """Active workspace is deployment-configured — never trust client-supplied ids."""
    return config.workspace_id


def require_dataset(workspace: AnalyticsWorkspace, dataset_id: str, config: SecurityConfig):
    """Load dataset and enforce it belongs to the trusted workspace."""
    record = workspace.get_dataset(dataset_id)
    if record.workspace_id != trusted_workspace_id(config):
        raise AccessDenied("Dataset is not available in this workspace.")
    return record


def require_decision(workspace: AnalyticsWorkspace, dataset_id: str, decision_id: str, config: SecurityConfig) -> dict[str, Any]:
    require_dataset(workspace, dataset_id, config)
    # Repository get is already dataset-scoped; re-check after load.
    payload = workspace.get_strategic_decision(dataset_id, decision_id)
    decision = payload.get("decision") or {}
    if str(decision.get("dataset_id") or dataset_id) != dataset_id:
        raise AccessDenied("Decision does not belong to this dataset.")
    return payload


def require_job_in_workspace(workspace: AnalyticsWorkspace, job_id: str, config: SecurityConfig):
    job = workspace.get_job(job_id)
    require_dataset(workspace, job.dataset_id, config)
    return job


def strip_client_workspace(body: dict[str, Any] | None) -> dict[str, Any]:
    """Remove client attempts to set trusted workspace identity."""
    if not isinstance(body, dict):
        return {}
    cleaned = dict(body)
    cleaned.pop("workspace_id", None)
    return cleaned
