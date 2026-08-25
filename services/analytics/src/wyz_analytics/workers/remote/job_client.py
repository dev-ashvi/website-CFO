"""Remote job store via outbound HTTPS."""

from __future__ import annotations

from typing import Callable

from wyz_analytics.workers.jobs import AnalysisJob
from wyz_analytics.workers.remote.http_client import RemoteHttpClient


class RemoteJobStore:
    WORKER_PREFIX = "/worker"

    def __init__(self, client: RemoteHttpClient, *, worker_id: str):
        self.client = client
        self.worker_id = worker_id

    def put(self, job: AnalysisJob) -> AnalysisJob:
        raise NotImplementedError("Remote workers cannot enqueue jobs.")

    def get(self, job_id: str) -> AnalysisJob:
        payload = self.client.json_request("GET", f"{self.WORKER_PREFIX}/jobs/{job_id}")
        return AnalysisJob.from_dict(payload)

    def claim_next(self, worker_id: str) -> AnalysisJob | None:
        payload = self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/claim",
            json_body={"worker_id": worker_id},
            expected_status=(200, 204),
        )
        if payload is None:
            return None
        return AnalysisJob.from_dict(payload)

    def save(self, job: AnalysisJob) -> AnalysisJob:
        payload = self.client.json_request(
            "PUT",
            f"{self.WORKER_PREFIX}/jobs/{job.job_id}",
            json_body=job.to_record(),
        )
        return AnalysisJob.from_dict(payload)

    def complete(self, job: AnalysisJob, *, result_ref: str | None = None) -> AnalysisJob:
        body: dict[str, str] = {}
        if result_ref:
            body["result_ref"] = result_ref
        elif job.result_ref:
            body["result_ref"] = job.result_ref
        payload = self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/{job.job_id}/complete",
            json_body=body,
        )
        return AnalysisJob.from_dict(payload)

    def fail(self, job: AnalysisJob, error: dict[str, str]) -> AnalysisJob:
        payload = self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/{job.job_id}/fail",
            json_body={"error": error},
        )
        return AnalysisJob.from_dict(payload)

    def recover(self, result_written: Callable[[AnalysisJob], str | None]) -> int:
        payload = self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/recover",
            json_body={"worker_id": self.worker_id},
        )
        return int((payload or {}).get("recovered") or 0)

    def requeue_abandoned(
        self,
        worker_id: str,
        result_written: Callable[[AnalysisJob], str | None] | None = None,
    ) -> int:
        payload = self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/requeue-abandoned",
            json_body={"worker_id": worker_id},
        )
        return int((payload or {}).get("requeued") or 0)

    def heartbeat(self, job_id: str) -> None:
        self.client.json_request(
            "POST",
            f"{self.WORKER_PREFIX}/jobs/{job_id}/heartbeat",
            json_body={"worker_id": self.worker_id},
            expected_status=(200, 204),
        )
