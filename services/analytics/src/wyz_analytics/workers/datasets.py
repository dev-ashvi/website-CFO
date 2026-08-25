"""Persisted dataset metadata. Source files are blob URIs, not local paths."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol

from wyz_analytics.workers.storage import DirLock, atomic_write_json
from wyz_analytics.workers.views import canonical_fields_catalog

logger = logging.getLogger(__name__)


class DatasetStore(Protocol):
    def put(self, record: "DatasetRecord") -> "DatasetRecord": ...
    def get(self, dataset_id: str) -> "DatasetRecord": ...
    def list(
        self, *, workspace_id: str | None = None, skip_malformed: bool = True
    ) -> list["DatasetRecord"]: ...


@dataclass
class DatasetRecord:
    workspace_id: str
    dataset_id: str
    dataset_version: int
    name: str
    status: str
    created_at: str
    mapping_version: str = "m1"
    source_files: list[dict[str, Any]] = field(default_factory=list)
    mapping_status: str = "not_started"
    analysis_status: str = "not_started"
    error: dict[str, str] | None = None
    mapping_uri: str | None = None
    latest_job_id: str | None = None
    latest_result_uri: str | None = None
    files: list[dict[str, Any]] = field(default_factory=list)
    mappings: list[dict[str, Any]] = field(default_factory=list)
    readiness: dict[str, Any] | None = None
    confirmations: list[dict[str, str]] = field(default_factory=list)
    summary: dict[str, Any] | None = None

    def library_dict(self) -> dict[str, Any]:
        """Lightweight discovery metadata only — never include results/facts/mappings."""
        file_count = len(self.source_files) if self.source_files else len(self.files or [])
        return {
            "workspace_id": self.workspace_id,
            "dataset_id": self.dataset_id,
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.created_at,
            "file_count": file_count,
            "analysis_status": self.analysis_status,
            "latest_job_id": self.latest_job_id,
            # period_label omitted: would require N result-blob reads.
        }

    def public_dict(self) -> dict[str, Any]:
        error = self.error
        return {
            "workspace_id": self.workspace_id,
            "dataset_id": self.dataset_id,
            "dataset_version": self.dataset_version,
            "mapping_version": self.mapping_version,
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at,
            "source_files": [
                {"name": item.get("name"), "uri": item.get("uri"), "bytes": item.get("bytes")}
                for item in self.source_files
            ],
            "mapping_status": self.mapping_status,
            "analysis_status": self.analysis_status,
            "error": error.get("message") if isinstance(error, dict) else error,
            "error_detail": error,
            "files": list(self.files),
            "mappings": list(self.mappings),
            "readiness": self.readiness,
            "canonical_fields": canonical_fields_catalog(),
            "latest_job_id": self.latest_job_id,
            "latest_result_uri": self.latest_result_uri,
            "lineage": {
                "workspace_id": self.workspace_id,
                "dataset_id": self.dataset_id,
                "dataset_version": self.dataset_version,
                "mapping_version": self.mapping_version,
                "job_id": self.latest_job_id,
            },
        }

    def to_record(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("summary", None)
        return payload

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> DatasetRecord:
        known = {item.name for item in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        data = {key: value for key, value in payload.items() if key in known}
        return cls(**data)


class FilesystemDatasetStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.dir = self.root / "datasets"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._lock_path = self.root / "locks" / "datasets.lockdir"

    def _path(self, dataset_id: str) -> Path:
        return self.dir / f"{dataset_id}.json"

    def put(self, record: DatasetRecord) -> DatasetRecord:
        with DirLock(self._lock_path):
            atomic_write_json(self._path(record.dataset_id), record.to_record())
        return record

    def get(self, dataset_id: str) -> DatasetRecord:
        path = self._path(dataset_id)
        if not path.is_file():
            raise KeyError(dataset_id)
        return self._load_record(path)

    def list(self, *, workspace_id: str | None = None, skip_malformed: bool = True) -> list[DatasetRecord]:
        """List dataset metadata records.

        When skip_malformed=True (default for library discovery), a bad JSON file
        is skipped so one corrupt record cannot break the whole selector.
        """
        records: list[DatasetRecord] = []
        for path in sorted(self.dir.glob("*.json")):
            try:
                record = self._load_record(path)
            except RuntimeError:
                if not skip_malformed:
                    raise
                logger.warning("Skipping malformed dataset record %s", path.name, exc_info=True)
                continue
            if workspace_id is None or record.workspace_id == workspace_id:
                records.append(record)
        records.sort(key=lambda item: item.created_at or "", reverse=True)
        return records

    def _load_record(self, path: Path) -> DatasetRecord:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Malformed dataset record {path.name}: {exc}") from exc
        if not isinstance(payload, dict):
            raise RuntimeError(f"Malformed dataset record {path.name}: expected JSON object")
        try:
            return DatasetRecord.from_dict(payload)
        except TypeError as exc:
            raise RuntimeError(f"Incompatible dataset record {path.name}: {exc}") from exc
