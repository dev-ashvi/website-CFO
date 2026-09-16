"""Durable analytics workspace: enqueue jobs, claim/execute, persist results.

Local HTTP and future Kubernetes workers share the same job/storage contracts.
The financial engine is unchanged and is never called from the SPA.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from wyz_analytics.config import ENGINE_VERSION
from wyz_analytics.engine.pipeline import run_revenue_margin_engine
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.ai_cfo.context import build_financial_intelligence_context
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model
from wyz_analytics.ai_cfo.strategy.decisions.evaluate import (
    apply_evaluation_to_status,
    evaluate_strategic_decision,
)
from wyz_analytics.ai_cfo.strategy.decisions.models import DecisionStatus
from wyz_analytics.ai_cfo.strategy.decisions.repository import FilesystemStrategicDecisionRepository
from wyz_analytics.ai_cfo.strategy.decisions.review import review_strategic_decision
from wyz_analytics.ai_cfo.strategy.decisions.signals import evaluate_active_decisions_for_scope
from wyz_analytics.ai_cfo.strategy.decisions.track import track_strategic_decision
from wyz_analytics.ai_cfo.strategy.decisions.telemetry import decision_evaluation_telemetry, decision_status_telemetry
from wyz_analytics.analytics.scoped_cost_breakdown import build_scoped_cost_breakdown
from wyz_analytics.cfo_signals.generate import generate_cfo_signals
from wyz_analytics.facts.models import validate_query
from wyz_analytics.facts.query import execute_query
from wyz_analytics.workers.datasets import DatasetRecord, DatasetStore, FilesystemDatasetStore
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY, MISSING_SOURCE, WORKSPACE_MISMATCH
from wyz_analytics.workers.executor import JobExecutor
from wyz_analytics.workers.jobs import (
    ANALYSING,
    CLAIMED,
    COMPLETED,
    FAILED,
    KIND_ANALYSE,
    KIND_INGEST,
    MAPPING,
    NEEDS_REVIEW,
    PROFILING,
    QUEUED,
    VALIDATING,
    AnalysisJob,
    FilesystemJobStore,
    JobStore,
    utc_now,
)
from wyz_analytics.workers.mapping_serde import apply_confirmations, mapping_config_from_dict, merge_confirmations
from wyz_analytics.workers.storage import BlobStore, FilesystemBlobStore
from wyz_analytics.workers.views import canonical_fields_catalog

CREATED = "CREATED"
UPLOADING = "UPLOADING"
READY = "READY"
JOB_QUEUED = QUEUED
JOB_RUNNING = "RUNNING"
JOB_COMPLETED = COMPLETED
JOB_FAILED = FAILED

logger = logging.getLogger("wyz_analytics.workers")

ACTIVE_INGEST_STAGES = {QUEUED, CLAIMED, PROFILING, MAPPING, VALIDATING}


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def next_mapping_version(current: str) -> str:
    if current and current[0] == "m" and current[1:].isdigit():
        return f"m{int(current[1:]) + 1}"
    return f"{current or 'm'}.1"


class AnalyticsWorkspace:
    """Filesystem-backed workspace used by the local worker and tests.

    Jobs are claimed atomically. Source files and results are blob URIs, not
    developer Downloads paths. `run_loop=True` is the same claim path Kubernetes
    workers will use later.
    """

    def __init__(
        self,
        root: str | Path | None = None,
        *,
        run_loop: bool = False,
        worker_id: str | None = None,
        engine=None,
        blobs: BlobStore | None = None,
        jobs: JobStore | None = None,
        datasets: DatasetStore | None = None,
    ):
        from wyz_analytics.workers.config import resolve_work_dir

        self.root = resolve_work_dir(root) if root is not None else resolve_work_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        self.worker_id = worker_id or os.environ.get("WYZ_ANALYTICS_WORKER_ID") or "local-worker"
        self.blobs = blobs or FilesystemBlobStore(self.root)
        self.jobs = jobs or FilesystemJobStore(self.root)
        self.datasets = datasets or FilesystemDatasetStore(self.root)
        self.strategic_decisions = FilesystemStrategicDecisionRepository(self.root)
        from wyz_analytics.observability.feedback.repository import FilesystemAiFeedbackRepository

        self.ai_feedback = FilesystemAiFeedbackRepository(self.root)
        self.executor = JobExecutor(
            self.blobs,
            self.jobs,
            self.datasets,
            engine=engine or run_revenue_margin_engine,
        )
        self._run_loop = run_loop
        if run_loop:
            thread = threading.Thread(target=self._loop, name="wyz-analytics-claim", daemon=True)
            thread.start()

    def _result_written(self, job: AnalysisJob) -> str | None:
        if job.kind != KIND_ANALYSE:
            return None
        uri = self.blobs.result_uri(job.job_id)
        return uri if self.blobs.exists(uri) else None

    def recover(self, *, requeue: bool = True) -> int:
        recovered = self.jobs.recover(self._result_written)
        if requeue:
            self.jobs.requeue_abandoned(self.worker_id, self._result_written)
        return recovered

    def run_until_idle(self) -> None:
        self.recover(requeue=True)
        while True:
            job = self.jobs.claim_next(self.worker_id)
            if not job:
                break
            self.executor.execute(job)

    def _loop(self) -> None:
        self.recover(requeue=True)
        while True:
            try:
                self.recover(requeue=False)
                job = self.jobs.claim_next(self.worker_id)
                if job:
                    self.executor.execute(job)
                else:
                    time.sleep(0.2)
            except Exception:
                logger.exception("analytics claim loop error")
                time.sleep(0.5)

    def create_dataset(self, *, name: str, workspace_id: str = "local") -> DatasetRecord:
        record = DatasetRecord(
            workspace_id=workspace_id,
            dataset_id=new_id("ds"),
            dataset_version=1,
            name=name.strip() or "Revenue & Margin dataset",
            status=CREATED,
            created_at=utc_now(),
        )
        created = self.datasets.put(record)
        try:
            from wyz_analytics.observability.emit import emit_event

            emit_event(
                "dataset_created",
                component="analytics",
                category="dataset",
                dataset_id=created.dataset_id,
                attributes={"workspace_id": created.workspace_id},
            )
        except Exception:
            logger.exception("observability emit failed for dataset_created")
        return created

    def get_dataset(self, dataset_id: str) -> DatasetRecord:
        record = self.datasets.get(dataset_id)
        if record.latest_result_uri and self.blobs.exists(record.latest_result_uri):
            record.summary = self.blobs.get_json(record.latest_result_uri)
        return record

    def list_datasets(self, *, workspace_id: str | None = None) -> list[DatasetRecord]:
        return self.datasets.list(workspace_id=workspace_id, skip_malformed=True)

    def list_dataset_library(self, *, workspace_id: str = "local") -> dict[str, Any]:
        """Workspace-scoped discovery list — metadata only, no result/fact blobs."""
        records = self.list_datasets(workspace_id=workspace_id)
        return {
            "workspace_id": workspace_id,
            "datasets": [record.library_dict() for record in records],
            "count": len(records),
            "isolation": "workspace_id",
            "mode_note": (
                "Local/demo analytics isolates by DatasetRecord.workspace_id. "
                "Default workspace_id=local. Multi-tenant auth is not redesigned here."
            ),
        }

    def get_job(self, job_id: str) -> AnalysisJob:
        return self.jobs.get(job_id)

    def get_result(self, dataset_id: str) -> dict[str, Any] | None:
        record = self.get_dataset(dataset_id)
        if record.summary is not None:
            return record.summary
        if record.latest_result_uri and self.blobs.exists(record.latest_result_uri):
            return self.blobs.get_json(record.latest_result_uri)
        return None

    def save_uploads(self, dataset_id: str, files: list[tuple[str, bytes]]) -> DatasetRecord:
        record = self.get_dataset(dataset_id)
        if not files:
            raise ValueError("Upload at least one file.")
        saved = []
        for filename, payload in files:
            safe = Path(filename).name or f"file_{len(saved)}.csv"
            uri = self.blobs.source_uri(record.workspace_id, record.dataset_id, record.dataset_version, safe)
            self.blobs.put_bytes(uri, payload)
            saved.append({"name": safe, "uri": uri, "bytes": len(payload)})
        record.source_files = saved
        record.status = UPLOADING
        record.mapping_status = "pending"
        record.analysis_status = "not_started"
        record.summary = None
        record.error = None
        record.latest_result_uri = None
        self.datasets.put(record)
        self._enqueue_ingest(record)
        return self.get_dataset(dataset_id)

    def _active_ingest_job(self, dataset_id: str) -> AnalysisJob | None:
        for job in self.jobs.list_jobs():
            if job.dataset_id == dataset_id and job.kind == KIND_INGEST and job.stage in ACTIVE_INGEST_STAGES:
                return job
        return None

    def _enqueue_ingest(self, dataset: DatasetRecord) -> AnalysisJob:
        existing = self._active_ingest_job(dataset.dataset_id)
        if existing:
            existing.source_refs = [{"name": item.get("name"), "uri": item.get("uri")} for item in dataset.source_files]
            existing.dataset_version = dataset.dataset_version
            existing.mapping_version = dataset.mapping_version
            return self.jobs.save(existing)
        job = AnalysisJob(
            job_id=new_id("job"),
            workspace_id=dataset.workspace_id,
            dataset_id=dataset.dataset_id,
            dataset_version=dataset.dataset_version,
            mapping_version=dataset.mapping_version,
            engine_version=ENGINE_VERSION,
            kind=KIND_INGEST,
            source_refs=[{"name": item.get("name"), "uri": item.get("uri")} for item in dataset.source_files],
            message="Ingest queued",
        )
        self.jobs.put(job)
        dataset.latest_job_id = job.job_id
        if dataset.status == CREATED:
            dataset.status = UPLOADING
        self.datasets.put(dataset)
        return job

    def run_ingest(self, dataset_id: str) -> DatasetRecord:
        record = self.get_dataset(dataset_id)
        if not record.source_files:
            raise ValueError("No uploaded files to ingest.")
        self._enqueue_ingest(record)
        self.run_until_idle()
        return self.get_dataset(dataset_id)

    def begin_ingest(self, dataset_id: str) -> DatasetRecord:
        record = self.get_dataset(dataset_id)
        if not record.source_files:
            raise ValueError("No uploaded files to ingest.")
        self._enqueue_ingest(record)
        return self.get_dataset(dataset_id)

    def confirm_mappings(self, dataset_id: str, items: list[dict[str, str]]) -> DatasetRecord:
        record = self.get_dataset(dataset_id)
        if not record.mapping_uri:
            raise ValueError("Ingest the dataset before confirming mappings.")
        cleaned = []
        for item in items:
            source_file = str(item.get("source_file") or "")
            source_column = str(item.get("source_column") or "")
            canonical_field = str(item.get("canonical_field") or "")
            if source_file and source_column and canonical_field:
                cleaned.append(
                    {
                        "source_file": source_file,
                        "source_column": source_column,
                        "canonical_field": canonical_field,
                    }
                )
        record.confirmations = merge_confirmations(record.confirmations, cleaned)
        config = mapping_config_from_dict(self.blobs.get_json(record.mapping_uri))
        if config is None:
            raise ValueError("Ingest the dataset before confirming mappings.")
        apply_confirmations(config.file_mappings, record.confirmations)
        record.mapping_version = next_mapping_version(record.mapping_version)
        config.mapping_version = record.mapping_version
        record.dataset_version += 1
        record.mapping_uri = self.blobs.mapping_uri(record.dataset_id, record.mapping_version)
        self.blobs.put_json(record.mapping_uri, config.to_dict())
        record.status = UPLOADING
        record.mapping_status = "pending"
        self.datasets.put(record)
        self._enqueue_ingest(record)
        if not self._run_loop:
            self.run_until_idle()
        return self.get_dataset(dataset_id)

    def start_analysis(self, dataset_id: str, *, wait: bool = False) -> AnalysisJob:
        record = self.get_dataset(dataset_id)
        if record.status != READY or not record.readiness or not record.readiness.get("ready_for_engine"):
            raise ValueError("Dataset is not ready for analysis. Resolve mapping review first.")
        job = AnalysisJob(
            job_id=new_id("job"),
            workspace_id=record.workspace_id,
            dataset_id=record.dataset_id,
            dataset_version=record.dataset_version,
            mapping_version=record.mapping_version,
            engine_version=ENGINE_VERSION,
            kind=KIND_ANALYSE,
            source_refs=[{"name": item.get("name"), "uri": item.get("uri")} for item in record.source_files],
            message="Analysis queued",
        )
        self.jobs.put(job)
        record.status = ANALYSING
        record.analysis_status = ANALYSING
        record.latest_job_id = job.job_id
        self.datasets.put(record)
        if wait:
            self.run_until_idle()
            return self.jobs.get(job.job_id)
        return job

    def query_facts(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        record = self.get_dataset(dataset_id)
        workspace_id = body.get("workspace_id")
        if workspace_id and str(workspace_id) != record.workspace_id:
            raise AnalyticsError(WORKSPACE_MISMATCH)
        result = self.get_result(dataset_id)
        if result is None:
            raise ValueError("Analysis result is not available yet.")
        facts_uri = result.get("facts_uri") or (result.get("lineage") or {}).get("facts_uri")
        if not facts_uri or not self.blobs.exists(facts_uri):
            raise AnalyticsError(MISSING_SOURCE, "Financial facts are not available for this dataset.")
        job_id = body.get("analysis_job_id")
        if job_id and str(job_id) != str(result.get("job_id")):
            raise AnalyticsError(INVALID_QUERY, "analysis_job_id does not match the latest analysis result.")
        facts = self.blobs.get_parquet(facts_uri)
        normalized = dict(body)
        normalized["dataset_id"] = dataset_id
        if not normalized.get("workspace_id"):
            normalized["workspace_id"] = record.workspace_id
        out = execute_query(facts, normalized)
        out["metadata"].update(
            {
                "dataset_id": dataset_id,
                "dataset_version": result.get("dataset_version"),
                "mapping_version": result.get("mapping_version"),
                "engine_version": result.get("engine_version"),
                "analysis_job_id": result.get("job_id"),
            }
        )
        return out

    def cost_breakdown(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """Scoped cost components from filtered financial facts (Phase 1C)."""
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        analytical = body.get("analytical") or body
        raw_filters = analytical.get("filters") or body.get("filters") or {}
        pack = build_scoped_cost_breakdown(
            facts,
            dataset_id=dataset_id,
            filters=raw_filters,
        )
        pack["metadata"] = {
            "dataset_id": dataset_id,
            "dataset_version": result.get("dataset_version"),
            "mapping_version": result.get("mapping_version"),
            "engine_version": result.get("engine_version"),
            "analysis_job_id": result.get("job_id"),
            "scope_hash": pack.get("scope_hash"),
        }
        return pack

    def _load_facts_for_dataset(self, dataset_id: str, body: dict[str, Any]) -> tuple[Any, dict[str, Any], Any]:
        record = self.get_dataset(dataset_id)
        workspace_id = body.get("workspace_id")
        if workspace_id and str(workspace_id) != record.workspace_id:
            raise AnalyticsError(WORKSPACE_MISMATCH)
        result = self.get_result(dataset_id)
        if result is None:
            raise ValueError("Analysis result is not available yet.")
        facts_uri = result.get("facts_uri") or (result.get("lineage") or {}).get("facts_uri")
        if not facts_uri or not self.blobs.exists(facts_uri):
            raise AnalyticsError(MISSING_SOURCE, "Financial facts are not available for this dataset.")
        job_id = body.get("analysis_job_id")
        if job_id and str(job_id) != str(result.get("job_id")):
            raise AnalyticsError(INVALID_QUERY, "analysis_job_id does not match the latest analysis result.")
        facts = self.blobs.get_parquet(facts_uri)
        return facts, result, record

    def cfo_signals(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        analytical = body.get("analytical") or body
        raw_filters = analytical.get("filters") or body.get("filters") or {}
        validated = validate_query({"filters": raw_filters, "metrics": ["net_revenue"]})
        pack = generate_cfo_signals(
            facts,
            filters=validated["filters"],
            dimension=str(analytical.get("dimension") or "channel"),
            surface=str(analytical.get("surface") or "overview"),
            methodology_caveats=(result.get("methodology") or {}).get("caveats") if isinstance(result.get("methodology"), dict) else None,
        )
        financial_scope = build_financial_scope(dataset_id=dataset_id, filters=validated["filters"])
        pack["scope"] = {
            **(pack.get("scope") or {}),
            "filters": financial_scope["filters"],
            "scope_hash": financial_scope["scope_hash"],
            "dataset_id": dataset_id,
        }
        pack["metadata"] = {
            "dataset_id": dataset_id,
            "dataset_version": result.get("dataset_version"),
            "mapping_version": result.get("mapping_version"),
            "engine_version": result.get("engine_version"),
            "analysis_job_id": result.get("job_id"),
            "scope_hash": financial_scope["scope_hash"],
        }
        # Phase 2E: evaluate tracked decisions against current verified summary (no schedule).
        try:
            decision_signals = evaluate_active_decisions_for_scope(
                repository=self.strategic_decisions,
                dataset_id=dataset_id,
                scope_hash=financial_scope["scope_hash"],
                summary=pack.get("summary") if isinstance(pack.get("summary"), dict) else None,
                observation_period=str(result.get("job_id") or result.get("dataset_version") or ""),
                persist=True,
            )
        except Exception:
            logger.exception("strategic_decision_proactive_eval_failed")
            decision_signals = []
        if decision_signals:
            pack["decision_review_signals"] = decision_signals
            # Surface revisit cards without injecting recommendations into core signal ranking.
            highlighted = list(pack.get("highlighted") or [])
            for sig in decision_signals:
                if sig.get("signal_type") == "STRATEGIC_DECISION_REVIEW":
                    highlighted.insert(0, sig)
            pack["highlighted"] = highlighted[:12]
        return pack

    def list_strategic_decisions(self, dataset_id: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        body = body or {}
        status_raw = body.get("status")
        status = None
        if status_raw:
            try:
                status = DecisionStatus(str(status_raw))
            except ValueError:
                status = None
        records = self.strategic_decisions.list(dataset_id, status=status)
        return {
            "dataset_id": dataset_id,
            "decisions": [r.public_summary() for r in records],
            "count": len(records),
        }

    def get_strategic_decision(self, dataset_id: str, decision_id: str) -> dict[str, Any]:
        record = self.strategic_decisions.get(dataset_id, decision_id)
        return {"decision": record.to_dict()}

    def track_strategic_decision(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """Explicit TRACK only — never auto-created from ask_ai_cfo."""
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        analytical = body.get("analytical") or {}
        raw_filters = analytical.get("filters") or body.get("filters") or {}
        validated = validate_query({"filters": raw_filters, "metrics": ["net_revenue"]})
        financial_scope = build_financial_scope(dataset_id=dataset_id, filters=validated["filters"])
        tools = AiCfoTools(
            facts,
            active_filters=financial_scope["filters"],
            surface=str(analytical.get("surface") or "overview"),
            dimension=str(analytical.get("dimension") or "channel"),
            dataset_id=dataset_id,
            financial_scope=financial_scope,
        )
        view = tools.get_current_financial_view()
        summary = view.get("summary") or {}
        # Reject client-injected baseline values (accepted then ignored).
        client_baseline = body.get("baseline_values") or body.get("metric_observations")
        record, telem = track_strategic_decision(
            repository=self.strategic_decisions,
            dataset_id=dataset_id,
            scope_hash=str(financial_scope.get("scope_hash") or ""),
            summary=summary,
            observation_period=str(result.get("job_id") or ""),
            analysis_job_id=str(result.get("job_id") or "") or None,
            strategic_thread=body.get("strategic_thread"),
            seed=body.get("seed") if isinstance(body.get("seed"), dict) else body,
            client_baseline_values=client_baseline if isinstance(client_baseline, dict) else None,
            activate=True,
        )
        try:
            from wyz_analytics.observability.emit import emit_event

            emit_event(
                "strategic_decision_tracked",
                component="strategy_decisions",
                category="decision",
                dataset_id=dataset_id,
                decision_id=record.decision_id,
                scope_hash=record.scope_hash,
                attributes={
                    "decision_theme": record.decision_theme,
                    "selected_action": record.selected_action,
                    "decision_status": record.status.value if hasattr(record.status, "value") else str(record.status),
                },
            )
        except Exception:
            logger.exception("observability emit failed for strategic_decision_tracked")
        return {"decision": record.to_dict(), "telemetry": telem}

    def evaluate_strategic_decision(self, dataset_id: str, decision_id: str, body: dict[str, Any]) -> dict[str, Any]:
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        record = self.strategic_decisions.get(dataset_id, decision_id)
        if record.status == DecisionStatus.ARCHIVED:
            return {
                "decision": record.to_dict(),
                "evaluation": None,
                "skipped": True,
                "reason": "archived",
                "telemetry": decision_status_telemetry(record),
            }
        analytical = body.get("analytical") or {}
        raw_filters = analytical.get("filters") or body.get("filters") or {}
        validated = validate_query({"filters": raw_filters, "metrics": ["net_revenue"]})
        financial_scope = build_financial_scope(dataset_id=dataset_id, filters=validated["filters"])
        tools = AiCfoTools(
            facts,
            active_filters=financial_scope["filters"],
            surface=str(analytical.get("surface") or "overview"),
            dimension=str(analytical.get("dimension") or "channel"),
            dataset_id=dataset_id,
            financial_scope=financial_scope,
        )
        view = tools.get_current_financial_view()
        period = str(body.get("observation_period") or result.get("job_id") or "")
        # Snapshot recommendation — Evaluate must never mutate it.
        prev_action = record.selected_action
        prev_strength = record.recommendation_strength
        prev_confidence = record.decision_confidence
        prev_original = record.original_selected_action
        evaluation = evaluate_strategic_decision(
            record,
            record.baseline_snapshot,
            current_evidence={"summary": view.get("summary") or {}},
            current_period=period,
            current_dataset_id=dataset_id,
            current_scope_hash=str(financial_scope.get("scope_hash") or ""),
        )
        # Never accept client-supplied evaluation status / recommendation.
        record.latest_evaluation = evaluation
        record.last_evaluated_at = evaluation.evaluated_at
        record.status = apply_evaluation_to_status(record, evaluation)
        # Hard lock: restore recommendation fields if anything touched them.
        record.selected_action = prev_action
        record.recommendation_strength = prev_strength
        record.decision_confidence = prev_confidence
        record.original_selected_action = prev_original
        self.strategic_decisions.save(record)
        telem = decision_evaluation_telemetry(evaluation)
        telem.update(decision_status_telemetry(record))
        telem["decision_evaluation_mutated_recommendation"] = False
        telem["provider_calls"] = 0
        return {
            "decision": record.to_dict(),
            "evaluation": evaluation.to_dict(),
            "telemetry": telem,
            "has_recommendation": False,
            "recommendation_unchanged": True,
        }

    def review_strategic_decision(self, dataset_id: str, decision_id: str, body: dict[str, Any]) -> dict[str, Any]:
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        record = self.strategic_decisions.get(dataset_id, decision_id)
        analytical = body.get("analytical") or {}
        raw_filters = analytical.get("filters") or body.get("filters") or {}
        validated = validate_query({"filters": raw_filters, "metrics": ["net_revenue"]})
        financial_scope = build_financial_scope(dataset_id=dataset_id, filters=validated["filters"])
        tools = AiCfoTools(
            facts,
            active_filters=financial_scope["filters"],
            surface=str(analytical.get("surface") or "overview"),
            dimension=str(analytical.get("dimension") or "channel"),
            dataset_id=dataset_id,
            financial_scope=financial_scope,
        )
        view = tools.get_current_financial_view()
        signal_pack = tools.get_cfo_signals()
        verified_signals = signal_pack.get("highlighted") or signal_pack.get("signals") or []
        lineage = {
            "workspace_id": result.get("workspace_id"),
            "dataset_id": dataset_id,
            "dataset_version": result.get("dataset_version"),
            "mapping_version": result.get("mapping_version"),
            "engine_version": result.get("engine_version"),
            "job_id": result.get("job_id"),
        }
        context = build_financial_intelligence_context(
            lineage=lineage,
            analytical={**analytical, "filters": financial_scope["filters"]},
            summary=view.get("summary") or {},
            signals=verified_signals,
            reconciliation=result.get("reconciliation"),
            methodology=result.get("methodology") if isinstance(result.get("methodology"), dict) else None,
        )
        context["financial_scope"] = financial_scope
        context["scope_hash"] = financial_scope["scope_hash"]
        context["dataset_id"] = dataset_id
        context["analysis_job_id"] = result.get("job_id")
        context["evidence_envelope"] = build_evidence_envelope(
            record.original_question or "Review tracked strategic decision", context
        )
        agent = body.get("_model") or resolve_ai_cfo_model(
            provider=body.get("provider"), model=body.get("model")
        )
        period = str(body.get("observation_period") or result.get("job_id") or "")
        try:
            from wyz_analytics.observability.emit import emit_event

            emit_event(
                "strategic_decision_review_started",
                component="strategy_decisions",
                category="decision",
                dataset_id=dataset_id,
                decision_id=decision_id,
                scope_hash=str(financial_scope.get("scope_hash") or record.scope_hash),
                attributes={"decision_theme": record.decision_theme},
            )
        except Exception:
            logger.exception("observability emit failed for review_started")
        result_payload = review_strategic_decision(
            repository=self.strategic_decisions,
            record=record,
            working_context=context,
            agent=agent,
            tools=tools,
            current_summary=view.get("summary") or {},
            current_period=period,
            message=str(body.get("message") or "Review this tracked strategic decision given current verified evidence."),
        )
        try:
            from wyz_analytics.observability.emit import emit_event

            telem = result_payload.get("telemetry") or {}
            emit_event(
                "strategic_decision_review_completed",
                component="strategy_decisions",
                category="decision",
                dataset_id=dataset_id,
                decision_id=decision_id,
                scope_hash=str(financial_scope.get("scope_hash") or record.scope_hash),
                attributes={
                    "decision_theme": record.decision_theme,
                    "revision_disposition": telem.get("decision_revision_disposition")
                    or telem.get("revision_disposition"),
                    "evaluation_status": telem.get("decision_evaluation_status"),
                    "final_selected_action": telem.get("decision_review_new_action"),
                },
            )
        except Exception:
            logger.exception("observability emit failed for review_completed")
        return result_payload

    def update_strategic_decision_status(
        self, dataset_id: str, decision_id: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        status_raw = body.get("status")
        try:
            status = DecisionStatus(str(status_raw))
        except ValueError as exc:
            raise AnalyticsError(INVALID_QUERY, f"Invalid decision status: {status_raw}") from exc
        # Do not auto-resolve; only explicit founder status changes.
        record = self.strategic_decisions.update_status(dataset_id, decision_id, status)
        if status == DecisionStatus.ARCHIVED:
            try:
                from wyz_analytics.observability.emit import emit_event

                emit_event(
                    "strategic_decision_archived",
                    component="strategy_decisions",
                    category="decision",
                    dataset_id=dataset_id,
                    decision_id=decision_id,
                    scope_hash=record.scope_hash,
                    attributes={
                        "decision_theme": record.decision_theme,
                        "decision_status": status.value,
                    },
                )
            except Exception:
                logger.exception("observability emit failed for archived")
        return {"decision": record.to_dict(), "telemetry": decision_status_telemetry(record)}

    def ask_ai_cfo(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        facts, result, _record = self._load_facts_for_dataset(dataset_id, body)
        analytical = body.get("analytical") or {}
        lineage = {
            "workspace_id": result.get("workspace_id"),
            "dataset_id": dataset_id,
            "dataset_version": result.get("dataset_version"),
            "mapping_version": result.get("mapping_version"),
            "engine_version": result.get("engine_version"),
            "job_id": result.get("job_id"),
        }
        from wyz_analytics.observability.context import get_request_id
        from wyz_analytics.ai_cfo.conversation import previous_turns_from_client_payload

        return run_ai_cfo_turn(
            facts,
            lineage=lineage,
            analytical=analytical,
            message=str(body.get("message") or ""),
            expected_context_version=body.get("context_version"),
            provider=body.get("provider"),
            model_name=body.get("model"),
            history=body.get("history") if isinstance(body.get("history"), list) else None,
            conversation_id=body.get("conversation_id")
            or ((body.get("conversation") or {}).get("conversation_id") if isinstance(body.get("conversation"), dict) else None),
            previous_turns=previous_turns_from_client_payload(body),
            signal_context=body.get("signal_context") if isinstance(body.get("signal_context"), dict) else None,
            reconciliation=result.get("reconciliation"),
            methodology=result.get("methodology") if isinstance(result.get("methodology"), dict) else None,
            request_id=body.get("request_id") or get_request_id(),
        )

    def submit_ai_feedback(self, dataset_id: str, body: dict[str, Any]) -> dict[str, Any]:
        """Persist lean AI answer feedback. Client cannot inject trusted financial metadata."""
        from wyz_analytics.observability.context import get_request_id
        from wyz_analytics.observability.emit import emit_event
        from wyz_analytics.observability.feedback import build_feedback_record

        # Ensure dataset exists (authorization/lineage boundary).
        self.get_dataset(dataset_id)
        turn_id = str(body.get("turn_id") or "").strip()
        if not turn_id:
            raise AnalyticsError(INVALID_QUERY, "turn_id is required")
        existing = self.ai_feedback.find_by_turn(dataset_id, turn_id)
        if existing is not None:
            return {"feedback": existing.to_record(), "duplicate": True}
        # Trusted metadata: identifiers only. Ignore client provider/model/action claims.
        try:
            record = build_feedback_record(
                dataset_id=dataset_id,
                turn_id=turn_id,
                rating=str(body.get("rating") or ""),
                reason=body.get("reason"),
                conversation_id=str(body.get("conversation_id")).strip()[:128]
                if body.get("conversation_id")
                else None,
                scope_hash=str(body.get("scope_hash")).strip()[:128] if body.get("scope_hash") else None,
                request_id=str(body.get("request_id") or get_request_id() or "").strip()[:128] or None,
                answer_source=None,
                decision_theme=None,
                selected_action=None,
                provider=None,
                model=None,
            )
        except ValueError as exc:
            raise AnalyticsError(INVALID_QUERY, str(exc)) from exc
        # Strip any attempt to smuggle free-text / answer bodies / trusted metadata.
        # body.get("answer_text"|"prompt"|"messages"|"provider"|"model") ignored intentionally
        saved = self.ai_feedback.put(record)
        emit_event(
            "ai_answer_feedback_submitted",
            component="ai_cfo",
            category="feedback",
            dataset_id=dataset_id,
            conversation_id=saved.conversation_id,
            turn_id=saved.turn_id,
            request_id=saved.request_id,
            scope_hash=saved.scope_hash,
            attributes={
                "feedback_id": saved.feedback_id,
                "rating": saved.rating,
                "reason": saved.reason,
                "answer_source": saved.answer_source,
                "decision_theme": saved.decision_theme,
                "final_selected_action": saved.selected_action,
            },
        )
        return {"feedback": saved.to_record(), "duplicate": False}

    def list_ai_feedback(self, dataset_id: str) -> dict[str, Any]:
        self.get_dataset(dataset_id)
        items = self.ai_feedback.list(dataset_id)
        return {
            "dataset_id": dataset_id,
            "feedback": [item.to_record() for item in items],
            "count": len(items),
        }

    def readiness(self) -> dict[str, Any]:
        """Process dependencies ready — does not call the GPT provider."""
        work_dir = self.root
        writable = False
        try:
            work_dir.mkdir(parents=True, exist_ok=True)
            probe = work_dir / ".ready_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            writable = True
        except OSError:
            writable = False
        ready = work_dir.exists() and writable
        return {
            "ready": ready,
            "work_dir_exists": work_dir.exists(),
            "work_dir_writable": writable,
            "service": "wyz-analytics",
        }
