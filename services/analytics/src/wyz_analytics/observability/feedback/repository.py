"""Filesystem persistence for AI answer feedback (no financial payloads)."""

from __future__ import annotations

import json
from pathlib import Path

from wyz_analytics.observability.feedback import AiAnswerFeedback
from wyz_analytics.workers.storage import DirLock, atomic_write_json


class FilesystemAiFeedbackRepository:
    """Lean JSON files under work_dir/ai_feedback/{dataset_id}/{feedback_id}.json"""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.dir = self.root / "ai_feedback"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._lock_path = self.root / "locks" / "ai_feedback.lockdir"

    def _dataset_dir(self, dataset_id: str) -> Path:
        path = self.dir / dataset_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def put(self, record: AiAnswerFeedback) -> AiAnswerFeedback:
        with DirLock(self._lock_path):
            path = self._dataset_dir(record.dataset_id) / f"{record.feedback_id}.json"
            atomic_write_json(path, record.to_record())
        return record

    def list(self, dataset_id: str) -> list[AiAnswerFeedback]:
        folder = self.dir / dataset_id
        if not folder.is_dir():
            return []
        records: list[AiAnswerFeedback] = []
        for path in sorted(folder.glob("fb_*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    records.append(AiAnswerFeedback.from_dict(payload))
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
        records.sort(key=lambda item: item.created_at or "", reverse=True)
        return records

    def find_by_turn(self, dataset_id: str, turn_id: str) -> AiAnswerFeedback | None:
        for item in self.list(dataset_id):
            if item.turn_id == turn_id:
                return item
        return None
