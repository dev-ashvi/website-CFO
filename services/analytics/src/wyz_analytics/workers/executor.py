"""Claimed-job executor. Fetches blobs, runs ingest/engine, persists results."""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path

from wyz_analytics.config import ENGINE_VERSION
from wyz_analytics.engine.pipeline import build_line_facts, run_revenue_margin_engine
from wyz_analytics.ingest.pipeline import ingest_tabular_files
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel
from wyz_analytics.facts.persist import persist_financial_facts
from wyz_analytics.workers.datasets import DatasetRecord, DatasetStore
from wyz_analytics.workers.errors import (
    ENGINE_FAILURE,
    INVALID_MAPPING,
    MISSING_SOURCE,
    RESULT_WRITE_FAILURE,
    VALIDATION_REJECTED,
    AnalyticsError,
)
from wyz_analytics.workers.jobs import (
    ANALYSING,
    COMPLETED,
    FAILED,
    KIND_ANALYSE,
    KIND_INGEST,
    MAPPING,
    NEEDS_REVIEW,
    PROFILING,
    VALIDATING,
    WRITING_RESULT,
    AnalysisJob,
    FilesystemJobStore,
    JobStore,
    utc_now,
)
from wyz_analytics.workers.mapping_serde import mapping_config_from_dict
from wyz_analytics.workers.results import build_analysis_result
from wyz_analytics.workers.storage import BlobStore, FilesystemBlobStore
from wyz_analytics.workers.views import file_views, mapping_rows, needs_mapping_review, readiness

logger = logging.getLogger("wyz_analytics.workers")


class JobExecutor:
    def __init__(
        self,
        blobs: BlobStore,
        jobs: JobStore,
        datasets: DatasetStore,
        *,
        engine=run_revenue_margin_engine,
    ):
        self.blobs = blobs
        self.jobs = jobs
        self.datasets = datasets
        self.engine = engine

    def execute(self, job: AnalysisJob) -> AnalysisJob:
        if job.kind == KIND_ANALYSE:
            uri = self.blobs.result_uri(job.job_id)
            if self.blobs.exists(uri):
                return self.jobs.complete(job, result_ref=uri)
        if job.stage == COMPLETED or (job.stage == NEEDS_REVIEW and job.status == COMPLETED):
            return job
        try:
            if job.kind == KIND_INGEST:
                return self._execute_ingest(job)
            return self._execute_analyse(job)
        except AnalyticsError as exc:
            logger.warning("analytics job %s failed: %s", job.job_id, exc.error_type)
            self._mark_dataset_failed(job, exc)
            return self.jobs.fail(job, exc.to_dict())
        except Exception:
            logger.exception("analytics job %s crashed", job.job_id)
            err = AnalyticsError(ENGINE_FAILURE if job.kind == KIND_ANALYSE else INVALID_MAPPING)
            self._mark_dataset_failed(job, err)
            return self.jobs.fail(job, err.to_dict())

    def _mark_dataset_failed(self, job: AnalysisJob, exc: AnalyticsError) -> None:
        try:
            dataset = self.datasets.get(job.dataset_id)
        except KeyError:
            return
        dataset.status = FAILED
        if job.kind == KIND_ANALYSE:
            dataset.analysis_status = FAILED
        else:
            dataset.mapping_status = FAILED
        dataset.error = exc.to_dict()
        self.datasets.put(dataset)

    def _materialize_sources(self, dataset: DatasetRecord) -> tuple[Path, list[Path]]:
        if not dataset.source_files:
            raise AnalyticsError(MISSING_SOURCE)
        scratch = Path(tempfile.mkdtemp(prefix="wyz-analytics-"))
        paths: list[Path] = []
        try:
            for item in dataset.source_files:
                uri = item.get("uri")
                name = item.get("name") or "file.csv"
                if not uri:
                    raise AnalyticsError(MISSING_SOURCE)
                data = self.blobs.get_bytes(uri)
                dest = scratch / Path(name).name
                dest.write_bytes(data)
                paths.append(dest)
        except Exception:
            shutil.rmtree(scratch, ignore_errors=True)
            raise
        return scratch, paths

    def _load_mapping_config(self, dataset: DatasetRecord):
        if not dataset.mapping_uri:
            return None
        try:
            payload = self.blobs.get_json(dataset.mapping_uri)
        except AnalyticsError:
            return None
        return mapping_config_from_dict(payload)

    def _set_stage(self, job: AnalysisJob, dataset: DatasetRecord, stage: str, message: str, progress: float) -> None:
        job.stage = stage
        job.status = stage
        job.message = message
        job.progress = progress
        self.jobs.save(job)
        if job.kind == KIND_INGEST:
            dataset.status = stage
            dataset.mapping_status = stage
        else:
            dataset.status = ANALYSING
            dataset.analysis_status = ANALYSING
        self.datasets.put(dataset)

    def _execute_ingest(self, job: AnalysisJob) -> AnalysisJob:
        dataset = self.datasets.get(job.dataset_id)
        self._set_stage(job, dataset, PROFILING, "Profiling uploaded files", 0.2)
        scratch, paths = self._materialize_sources(dataset)
        try:
            mapping_config = self._load_mapping_config(dataset)
            self._set_stage(job, dataset, MAPPING, "Mapping columns", 0.45)
            ingest = ingest_tabular_files(
                paths,
                mapping_config=mapping_config,
                mapping_model=FakeSchemaMappingModel(),
                workspace_id=dataset.workspace_id,
            )
            self._set_stage(job, dataset, VALIDATING, "Validating joins and grain", 0.7)
            ready = readiness(ingest)
            dataset.files = file_views(ingest)
            dataset.mappings = mapping_rows(ingest)
            dataset.readiness = ready
            dataset.error = None
            if ingest.mapping_config:
                dataset.mapping_uri = self.blobs.mapping_uri(dataset.dataset_id, dataset.mapping_version)
                self.blobs.put_json(dataset.mapping_uri, ingest.mapping_config.to_dict())
            if ready["ready_for_engine"]:
                dataset.status = "READY"
                dataset.mapping_status = "READY"
                job.stage = COMPLETED
                job.status = COMPLETED
                job.message = "Ingest complete"
            elif needs_mapping_review(ingest):
                dataset.status = NEEDS_REVIEW
                dataset.mapping_status = NEEDS_REVIEW
                job.stage = NEEDS_REVIEW
                job.message = "Mapping review required"
            else:
                raise AnalyticsError(VALIDATION_REJECTED)
            dataset.latest_job_id = job.job_id
            self.datasets.put(dataset)
            job.progress = 1.0
            self.jobs.save(job)
            if job.stage == NEEDS_REVIEW:
                return self._complete_ingest_review(job)
            return self.jobs.complete(job)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

    def _complete_ingest_review(self, job: AnalysisJob) -> AnalysisJob:
        current = self.jobs.get(job.job_id)
        current.stage = NEEDS_REVIEW
        current.status = COMPLETED
        current.progress = 1.0
        current.completed_at = current.completed_at or utc_now()
        current.message = "Mapping review required"
        return self.jobs.save(current)

    def _execute_analyse(self, job: AnalysisJob) -> AnalysisJob:
        dataset = self.datasets.get(job.dataset_id)
        if dataset.status not in {"READY", ANALYSING, COMPLETED} or not dataset.readiness or not dataset.readiness.get(
            "ready_for_engine"
        ):
            raise AnalyticsError(INVALID_MAPPING)
        self._set_stage(job, dataset, ANALYSING, "Running deterministic financial engine", 0.4)
        scratch, paths = self._materialize_sources(dataset)
        try:
            mapping_config = self._load_mapping_config(dataset)
            ingest = ingest_tabular_files(
                paths,
                mapping_config=mapping_config,
                mapping_model=FakeSchemaMappingModel(),
                workspace_id=dataset.workspace_id,
            )
            if ingest.sources is None:
                raise AnalyticsError(VALIDATION_REJECTED)
            methodology = ingest.mapping_config.methodology if ingest.mapping_config else None
            platform_map = dict(methodology.platform_to_channel) if methodology else None
            line_facts, _marketing_recon = build_line_facts(ingest.sources, platform_to_channel=platform_map or None)
            try:
                engine_result = self.engine(ingest.sources, platform_to_channel=platform_map or None)
            except AnalyticsError:
                raise
            except Exception as exc:
                logger.exception("engine failed for job %s", job.job_id)
                raise AnalyticsError(ENGINE_FAILURE) from exc

            self._set_stage(job, dataset, WRITING_RESULT, "Writing versioned result", 0.85)
            facts_uri, _facts_meta = persist_financial_facts(
                self.blobs,
                job_id=job.job_id,
                lines=line_facts,
                lineage={
                    "workspace_id": job.workspace_id,
                    "dataset_id": job.dataset_id,
                    "dataset_version": job.dataset_version,
                    "mapping_version": job.mapping_version,
                    "engine_version": engine_result.engine_version or ENGINE_VERSION,
                    "analysis_job_id": job.job_id,
                },
            )
            payload = build_analysis_result(
                job=job,
                dataset=dataset.public_dict(),
                engine_result=engine_result,
                sources=ingest.sources,
                readiness=readiness(ingest),
                methodology=methodology.to_dict() if methodology else {},
                lines=line_facts,
                facts_uri=facts_uri,
            )
            result_uri = self.blobs.result_uri(job.job_id)
            try:
                self.blobs.put_json(result_uri, payload)
            except AnalyticsError:
                raise
            except Exception as exc:
                raise AnalyticsError(RESULT_WRITE_FAILURE) from exc
            job.result_ref = result_uri
            job.engine_version = engine_result.engine_version or ENGINE_VERSION
            job.message = "Analysis complete"
            self.jobs.save(job)
            dataset.latest_result_uri = result_uri
            dataset.latest_job_id = job.job_id
            dataset.summary = payload
            dataset.status = COMPLETED
            dataset.analysis_status = COMPLETED
            dataset.error = None
            self.datasets.put(dataset)
            return self.jobs.complete(job, result_ref=result_uri)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
