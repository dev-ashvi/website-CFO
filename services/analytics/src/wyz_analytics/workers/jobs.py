"""Durable analysis job model and claimable job store."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol

from wyz_analytics.config import ENGINE_VERSION
from wyz_analytics.workers.storage import DirLock, atomic_write_json

QUEUED = "QUEUED"
CLAIMED = "CLAIMED"
PROFILING = "PROFILING"
MAPPING = "MAPPING"
NEEDS_REVIEW = "NEEDS_REVIEW"
VALIDATING = "VALIDATING"
ANALYSING = "ANALYSING"
WRITING_RESULT = "WRITING_RESULT"
COMPLETED = "COMPLETED"
FAILED = "FAILED"

UI_RUNNING_STAGES = {
    CLAIMED,
    PROFILING,
    MAPPING,
    VALIDATING,
    ANALYSING,
    WRITING_RESULT,
}

KIND_INGEST = "ingest"
KIND_ANALYSE = "analyse"

IN_FLIGHT_STAGES = {
    CLAIMED,
    PROFILING,
    MAPPING,
    VALIDATING,
    ANALYSING,
    WRITING_RESULT,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ui_status(stage: str) -> str:
    if stage == QUEUED:
        return QUEUED
    if stage in UI_RUNNING_STAGES:
        return "RUNNING"
    if stage == NEEDS_REVIEW:
        return NEEDS_REVIEW
    if stage == COMPLETED:
        return COMPLETED
    if stage == FAILED:
        return FAILED
    return stage


@dataclass
class AnalysisJob:
    job_id: str
    workspace_id: str
    dataset_id: str
    dataset_version: int
    mapping_version: str
    engine_version: str = ENGINE_VERSION
    kind: str = KIND_ANALYSE
    status: str = QUEUED
    stage: str = QUEUED
    created_at: str = field(default_factory=utc_now)
    started_at: str | None = None
    completed_at: str | None = None
    claimed_by: str | None = None
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    result_ref: str | None = None
    error: dict[str, str] | None = None
    progress: float = 0.0
    message: str = ""

    @property
    def analysis_job_id(self) -> str:
        return self.job_id

    def to_record(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["analysis_job_id"] = self.job_id
        return payload

    def to_dict(self) -> dict[str, Any]:
        """SPA-facing job document. `status` is simplified; `stage` is detailed."""
        payload = self.to_record()
        payload["status"] = ui_status(self.stage)
        payload["error"] = dict(self.error) if self.error else None
        return payload

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> AnalysisJob:
        known = {item.name for item in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        data = {key: value for key, value in payload.items() if key in known}
        data.setdefault("job_id", payload.get("analysis_job_id") or payload.get("job_id"))
        return cls(**data)


class JobStore(Protocol):
    def put(self, job: AnalysisJob) -> AnalysisJob: ...
    def get(self, job_id: str) -> AnalysisJob: ...
    def claim_next(self, worker_id: str) -> AnalysisJob | None: ...
    def save(self, job: AnalysisJob) -> AnalysisJob: ...
    def complete(self, job: AnalysisJob, *, result_ref: str | None = None) -> AnalysisJob: ...
    def fail(self, job: AnalysisJob, error: dict[str, str]) -> AnalysisJob: ...
    def recover(self, result_written: Callable[[AnalysisJob], str | None]) -> int: ...
    def requeue_abandoned(
        self,
        worker_id: str,
        result_written: Callable[[AnalysisJob], str | None] | None = None,
    ) -> int: ...


class FilesystemJobStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.jobs_dir = self.root / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._lock_path = self.root / "locks" / "jobs.lockdir"

    def _path(self, job_id: str) -> Path:
        return self.jobs_dir / f"{job_id}.json"

    def put(self, job: AnalysisJob) -> AnalysisJob:
        path = self._path(job.job_id)
        with DirLock(self._lock_path):
            if path.exists():
                return self.get(job.job_id)
            atomic_write_json(path, job.to_record())
        return job

    def get(self, job_id: str) -> AnalysisJob:
        path = self._path(job_id)
        if not path.is_file():
            raise KeyError(job_id)
        payload = json.loads(path.read_text(encoding="utf-8"))
        return AnalysisJob.from_dict(payload)

    def save(self, job: AnalysisJob) -> AnalysisJob:
        atomic_write_json(self._path(job.job_id), job.to_record())
        return job

    def list_jobs(self) -> list[AnalysisJob]:
        jobs = []
        for path in self.jobs_dir.glob("job_*.json"):
            jobs.append(AnalysisJob.from_dict(json.loads(path.read_text(encoding="utf-8"))))
        return jobs

    def claim_next(self, worker_id: str) -> AnalysisJob | None:
        with DirLock(self._lock_path):
            for path in sorted(self.jobs_dir.glob("job_*.json")):
                payload = json.loads(path.read_text(encoding="utf-8"))
                job = AnalysisJob.from_dict(payload)
                if job.stage != QUEUED:
                    continue
                job.stage = CLAIMED
                job.status = CLAIMED
                job.claimed_by = worker_id
                job.started_at = job.started_at or utc_now()
                job.message = "Job claimed"
                self.save(job)
                return job
            return None

    def complete(self, job: AnalysisJob, *, result_ref: str | None = None) -> AnalysisJob:
        current = self.get(job.job_id)
        resolved_ref = result_ref or job.result_ref or current.result_ref
        if current.stage == COMPLETED and (not resolved_ref or current.result_ref == resolved_ref):
            return current
        current.stage = COMPLETED
        current.status = COMPLETED
        current.completed_at = current.completed_at or utc_now()
        current.progress = 1.0
        current.message = current.message or job.message or "Analysis complete"
        if resolved_ref:
            current.result_ref = resolved_ref
        return self.save(current)

    def fail(self, job: AnalysisJob, error: dict[str, str]) -> AnalysisJob:
        current = self.get(job.job_id)
        if current.stage == COMPLETED:
            return current
        current.stage = FAILED
        current.status = FAILED
        current.completed_at = utc_now()
        current.error = error
        current.message = error.get("message") or "Job failed"
        return self.save(current)

    def recover(self, result_written: Callable[[AnalysisJob], str | None]) -> int:
        """Mark analyse jobs complete when a result blob already exists."""
        recovered = 0
        with DirLock(self._lock_path):
            for path in self.jobs_dir.glob("job_*.json"):
                job = AnalysisJob.from_dict(json.loads(path.read_text(encoding="utf-8")))
                if job.kind != KIND_ANALYSE or job.stage in {COMPLETED, FAILED}:
                    continue
                uri = result_written(job)
                if uri:
                    self.complete(job, result_ref=uri)
                    recovered += 1
        return recovered

    def requeue_abandoned(
        self,
        worker_id: str,
        result_written: Callable[[AnalysisJob], str | None] | None = None,
    ) -> int:
        """Requeue this worker's in-flight jobs after a process restart."""
        count = 0
        with DirLock(self._lock_path):
            for path in self.jobs_dir.glob("job_*.json"):
                job = AnalysisJob.from_dict(json.loads(path.read_text(encoding="utf-8")))
                if job.claimed_by != worker_id or job.stage not in IN_FLIGHT_STAGES:
                    continue
                if result_written and result_written(job):
                    continue
                job.stage = QUEUED
                job.status = QUEUED
                job.claimed_by = None
                job.message = "Requeued after worker restart"
                self.save(job)
                count += 1
        return count
