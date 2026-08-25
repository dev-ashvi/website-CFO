"""Machine-authenticated worker API handlers.

These endpoints are for analytics workers only. Browser/SPA clients must not use them.
"""

from __future__ import annotations

import base64
import json
from typing import Any

from wyz_analytics.workers.auth import authorize_worker_request
from wyz_analytics.workers.jobs import AnalysisJob, KIND_ANALYSE
from wyz_analytics.workers.service import AnalyticsWorkspace


def _unauthorized() -> tuple[int, dict[str, Any]]:
    return 401, {"message": "Worker authentication required."}


def _worker_disabled() -> tuple[int, dict[str, Any]]:
    return 503, {"message": "Worker API is disabled. Set WYZ_ANALYTICS_WORKER_TOKEN on the API process."}


def require_worker(headers: dict[str, str]) -> tuple[int, dict[str, Any]] | None:
    from wyz_analytics.workers.auth import expected_worker_token

    if not expected_worker_token():
        return _worker_disabled()
    if not authorize_worker_request(headers):
        return _unauthorized()
    return None


def claim_job(workspace: AnalyticsWorkspace, body: dict[str, Any]) -> tuple[int, dict[str, Any] | None]:
    worker_id = str(body.get("worker_id") or workspace.worker_id)
    job = workspace.jobs.claim_next(worker_id)
    if job is None:
        return 204, None
    return 200, job.to_record()


def get_job(workspace: AnalyticsWorkspace, job_id: str) -> tuple[int, dict[str, Any]]:
    job = workspace.get_job(job_id)
    return 200, job.to_record()


def save_job(workspace: AnalyticsWorkspace, job_id: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    current = workspace.get_job(job_id)
    payload = {**current.to_record(), **body, "job_id": job_id, "analysis_job_id": job_id}
    job = AnalysisJob.from_dict(payload)
    saved = workspace.jobs.save(job)
    return 200, saved.to_record()


def complete_job(workspace: AnalyticsWorkspace, job_id: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    job = workspace.get_job(job_id)
    result_ref = body.get("result_ref")
    finished = workspace.jobs.complete(job, result_ref=str(result_ref) if result_ref else None)
    return 200, finished.to_record()


def fail_job(workspace: AnalyticsWorkspace, job_id: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    job = workspace.get_job(job_id)
    error = body.get("error") or {}
    if not isinstance(error, dict):
        error = {"type": "JOB_FAILED", "message": str(error)}
    finished = workspace.jobs.fail(job, error)
    return 200, finished.to_record()


def recover_jobs(workspace: AnalyticsWorkspace, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    worker_id = str(body.get("worker_id") or workspace.worker_id)
    workspace.worker_id = worker_id
    recovered = workspace.recover(requeue=False)
    return 200, {"recovered": recovered}


def requeue_abandoned_jobs(workspace: AnalyticsWorkspace, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    worker_id = str(body.get("worker_id") or workspace.worker_id)
    requeued = workspace.jobs.requeue_abandoned(worker_id, workspace._result_written)
    return 200, {"requeued": requeued}


def heartbeat_job(workspace: AnalyticsWorkspace, job_id: str, body: dict[str, Any]) -> tuple[int, dict[str, Any] | None]:
    job = workspace.get_job(job_id)
    worker_id = str(body.get("worker_id") or workspace.worker_id)
    if job.claimed_by and job.claimed_by != worker_id:
        return 409, {"message": "Job is claimed by another worker."}
    job.message = job.message or "Heartbeat received"
    workspace.jobs.save(job)
    return 204, None


def get_dataset_record(workspace: AnalyticsWorkspace, dataset_id: str) -> tuple[int, dict[str, Any]]:
    record = workspace.get_dataset(dataset_id)
    return 200, record.to_record()


def put_dataset_record(workspace: AnalyticsWorkspace, dataset_id: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    from wyz_analytics.workers.datasets import DatasetRecord

    body = {**body, "dataset_id": dataset_id}
    saved = workspace.datasets.put(DatasetRecord.from_dict(body))
    return 200, saved.to_record()


def get_blob(workspace: AnalyticsWorkspace, uri: str) -> tuple[int, dict[str, str], bytes]:
    data = workspace.blobs.get_bytes(uri)
    return 200, {"Content-Type": "application/octet-stream"}, data


def head_blob(workspace: AnalyticsWorkspace, uri: str) -> tuple[int, dict[str, str], bytes]:
    if not workspace.blobs.exists(uri):
        return 404, {"Content-Type": "application/json"}, b'{"message":"Not found"}'
    return 200, {}, b""


def put_blob(workspace: AnalyticsWorkspace, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    uri = str(body.get("uri") or "")
    if not uri:
        return 400, {"message": "uri is required"}
    raw = body.get("content_base64")
    if not raw:
        return 400, {"message": "content_base64 is required"}
    workspace.blobs.put_bytes(uri, base64.b64decode(raw))
    return 200, {"uri": uri}


def result_written_for(workspace: AnalyticsWorkspace, job: AnalysisJob) -> str | None:
    if job.kind != KIND_ANALYSE:
        return None
    uri = workspace.blobs.result_uri(job.job_id)
    return uri if workspace.blobs.exists(uri) else None
