"""Storage-agnostic repository for StrategicDecisionRecord."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionBaselineSnapshot,
    DecisionEvaluation,
    DecisionRevision,
    DecisionStatus,
    StrategicDecisionRecord,
    _utc_now,
)
from wyz_analytics.workers.storage import DirLock, atomic_write_json


class StrategicDecisionRepository(Protocol):
    def create(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord: ...

    def get(self, dataset_id: str, decision_id: str) -> StrategicDecisionRecord: ...

    def list(self, dataset_id: str, *, status: DecisionStatus | None = None) -> list[StrategicDecisionRecord]: ...

    def update_status(
        self, dataset_id: str, decision_id: str, status: DecisionStatus
    ) -> StrategicDecisionRecord: ...

    def save(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord: ...

    def save_baseline(
        self, dataset_id: str, decision_id: str, baseline: DecisionBaselineSnapshot
    ) -> StrategicDecisionRecord: ...

    def save_evaluation(
        self, dataset_id: str, decision_id: str, evaluation: DecisionEvaluation
    ) -> StrategicDecisionRecord: ...

    def save_revision(
        self, dataset_id: str, decision_id: str, revision: DecisionRevision
    ) -> StrategicDecisionRecord: ...


class InMemoryStrategicDecisionRepository:
    """Test-friendly store — no filesystem coupling."""

    def __init__(self) -> None:
        self._by_dataset: dict[str, dict[str, StrategicDecisionRecord]] = {}

    def create(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord:
        bucket = self._by_dataset.setdefault(record.dataset_id, {})
        if record.decision_id in bucket:
            raise ValueError(f"decision_exists:{record.decision_id}")
        bucket[record.decision_id] = record
        return record

    def get(self, dataset_id: str, decision_id: str) -> StrategicDecisionRecord:
        bucket = self._by_dataset.get(dataset_id) or {}
        if decision_id not in bucket:
            raise KeyError(decision_id)
        return bucket[decision_id]

    def list(self, dataset_id: str, *, status: DecisionStatus | None = None) -> list[StrategicDecisionRecord]:
        items = list((self._by_dataset.get(dataset_id) or {}).values())
        if status is not None:
            items = [r for r in items if r.status == status]
        items.sort(key=lambda r: r.updated_at or r.created_at or "", reverse=True)
        return items

    def update_status(
        self, dataset_id: str, decision_id: str, status: DecisionStatus
    ) -> StrategicDecisionRecord:
        record = self.get(dataset_id, decision_id)
        record.status = status
        record.updated_at = _utc_now()
        return record

    def save(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord:
        bucket = self._by_dataset.setdefault(record.dataset_id, {})
        record.updated_at = _utc_now()
        bucket[record.decision_id] = record
        return record

    def save_baseline(
        self, dataset_id: str, decision_id: str, baseline: DecisionBaselineSnapshot
    ) -> StrategicDecisionRecord:
        record = self.get(dataset_id, decision_id)
        record.baseline_snapshot = baseline
        record.updated_at = _utc_now()
        return record

    def save_evaluation(
        self, dataset_id: str, decision_id: str, evaluation: DecisionEvaluation
    ) -> StrategicDecisionRecord:
        record = self.get(dataset_id, decision_id)
        record.latest_evaluation = evaluation
        record.last_evaluated_at = evaluation.evaluated_at
        record.updated_at = _utc_now()
        return record

    def save_revision(
        self, dataset_id: str, decision_id: str, revision: DecisionRevision
    ) -> StrategicDecisionRecord:
        record = self.get(dataset_id, decision_id)
        record.revisions = list(record.revisions or []) + [revision]
        record.updated_at = _utc_now()
        return record


class FilesystemStrategicDecisionRepository:
    """Lean JSON files under work_dir/strategic_decisions/{dataset_id}/."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.dir = self.root / "strategic_decisions"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._lock_path = self.root / "locks" / "strategic_decisions.lockdir"

    def _dataset_dir(self, dataset_id: str) -> Path:
        path = self.dir / dataset_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _path(self, dataset_id: str, decision_id: str) -> Path:
        return self._dataset_dir(dataset_id) / f"{decision_id}.json"

    def create(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord:
        path = self._path(record.dataset_id, record.decision_id)
        with DirLock(self._lock_path):
            if path.is_file():
                raise ValueError(f"decision_exists:{record.decision_id}")
            atomic_write_json(path, record.to_dict())
        return record

    def get(self, dataset_id: str, decision_id: str) -> StrategicDecisionRecord:
        path = self._path(dataset_id, decision_id)
        if not path.is_file():
            raise KeyError(decision_id)
        payload = json.loads(path.read_text(encoding="utf-8"))
        record = StrategicDecisionRecord.from_dict(payload)
        if record is None:
            raise RuntimeError(f"Malformed decision record {path.name}")
        return record

    def list(self, dataset_id: str, *, status: DecisionStatus | None = None) -> list[StrategicDecisionRecord]:
        items: list[StrategicDecisionRecord] = []
        dataset_dir = self.dir / dataset_id
        if not dataset_dir.is_dir():
            return []
        for path in sorted(dataset_dir.glob("sdr_*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            record = StrategicDecisionRecord.from_dict(payload)
            if record is None:
                continue
            if status is not None and record.status != status:
                continue
            items.append(record)
        items.sort(key=lambda r: r.updated_at or r.created_at or "", reverse=True)
        return items

    def update_status(
        self, dataset_id: str, decision_id: str, status: DecisionStatus
    ) -> StrategicDecisionRecord:
        with DirLock(self._lock_path):
            record = self.get(dataset_id, decision_id)
            record.status = status
            record.updated_at = _utc_now()
            atomic_write_json(self._path(dataset_id, decision_id), record.to_dict())
        return record

    def save(self, record: StrategicDecisionRecord) -> StrategicDecisionRecord:
        with DirLock(self._lock_path):
            record.updated_at = _utc_now()
            atomic_write_json(self._path(record.dataset_id, record.decision_id), record.to_dict())
        return record

    def save_baseline(
        self, dataset_id: str, decision_id: str, baseline: DecisionBaselineSnapshot
    ) -> StrategicDecisionRecord:
        with DirLock(self._lock_path):
            record = self.get(dataset_id, decision_id)
            record.baseline_snapshot = baseline
            record.updated_at = _utc_now()
            atomic_write_json(self._path(dataset_id, decision_id), record.to_dict())
        return record

    def save_evaluation(
        self, dataset_id: str, decision_id: str, evaluation: DecisionEvaluation
    ) -> StrategicDecisionRecord:
        with DirLock(self._lock_path):
            record = self.get(dataset_id, decision_id)
            record.latest_evaluation = evaluation
            record.last_evaluated_at = evaluation.evaluated_at
            record.updated_at = _utc_now()
            atomic_write_json(self._path(dataset_id, decision_id), record.to_dict())
        return record

    def save_revision(
        self, dataset_id: str, decision_id: str, revision: DecisionRevision
    ) -> StrategicDecisionRecord:
        with DirLock(self._lock_path):
            record = self.get(dataset_id, decision_id)
            record.revisions = list(record.revisions or []) + [revision]
            record.updated_at = _utc_now()
            atomic_write_json(self._path(dataset_id, decision_id), record.to_dict())
        return record
