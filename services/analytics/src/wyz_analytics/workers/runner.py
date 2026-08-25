"""Polling analytics worker entrypoint for local process and Kubernetes."""

from __future__ import annotations

import logging
import signal
import threading
import time

from wyz_analytics.workers.config import WorkerConfig
from wyz_analytics.workers.jobs import AnalysisJob
from wyz_analytics.workers.logging_config import configure_logging, log_event
from wyz_analytics.workers.remote import RemoteBlobStore, RemoteDatasetStore, RemoteHttpClient, RemoteJobStore
from wyz_analytics.workers.service import AnalyticsWorkspace

logger = logging.getLogger("wyz_analytics.workers.runner")


class WorkerRunner:
    """Claims and executes analytics jobs until shutdown."""

    def __init__(self, config: WorkerConfig):
        self.config = config
        self._shutdown = threading.Event()
        self._active_job: AnalysisJob | None = None
        self.workspace = self._build_workspace()
        self.executor = self.workspace.executor

    def _build_workspace(self) -> AnalyticsWorkspace:
        if self.config.mode == "remote":
            client = RemoteHttpClient(self.config.api_base_url or "", worker_token=self.config.worker_token)
            return AnalyticsWorkspace(
                root=self.config.work_dir,
                run_loop=False,
                worker_id=self.config.worker_id,
                blobs=RemoteBlobStore(client),
                jobs=RemoteJobStore(client, worker_id=self.config.worker_id),
                datasets=RemoteDatasetStore(client),
            )
        return AnalyticsWorkspace(
            root=self.config.work_dir,
            run_loop=False,
            worker_id=self.config.worker_id,
        )

    def install_signal_handlers(self) -> None:
        def _handle(signum, _frame) -> None:
            log_event(logger, "worker_shutdown_signal", worker_id=self.config.worker_id, signal=signum)
            self._shutdown.set()

        signal.signal(signal.SIGTERM, _handle)
        signal.signal(signal.SIGINT, _handle)

    def release_claims(self) -> int:
        requeued = self.workspace.jobs.requeue_abandoned(
            self.config.worker_id,
            self.workspace._result_written,
        )
        if requeued:
            log_event(
                logger,
                "worker_claims_released",
                worker_id=self.config.worker_id,
                requeued=requeued,
            )
        return requeued

    def run_once(self) -> bool:
        self.workspace.recover(requeue=False)
        job = self.workspace.jobs.claim_next(self.config.worker_id)
        if not job:
            return False
        self._active_job = job
        started = time.perf_counter()
        log_event(
            logger,
            "job_claimed",
            worker_id=self.config.worker_id,
            job_id=job.job_id,
            dataset_id=job.dataset_id,
            dataset_version=job.dataset_version,
            stage=job.stage,
            kind=job.kind,
        )
        try:
            finished = self.executor.execute(job)
            duration_ms = int((time.perf_counter() - started) * 1000)
            if finished.stage == "FAILED":
                log_event(
                    logger,
                    "job_failed",
                    worker_id=self.config.worker_id,
                    job_id=finished.job_id,
                    dataset_id=finished.dataset_id,
                    dataset_version=finished.dataset_version,
                    stage=finished.stage,
                    error_type=(finished.error or {}).get("type"),
                    duration_ms=duration_ms,
                )
            else:
                log_event(
                    logger,
                    "job_completed",
                    worker_id=self.config.worker_id,
                    job_id=finished.job_id,
                    dataset_id=finished.dataset_id,
                    dataset_version=finished.dataset_version,
                    stage=finished.stage,
                    duration_ms=duration_ms,
                )
            return True
        finally:
            self._active_job = None

    def run_forever(self) -> None:
        log_event(
            logger,
            "worker_started",
            worker_id=self.config.worker_id,
            mode=self.config.mode,
            poll_interval_sec=self.config.poll_interval_sec,
        )
        while not self._shutdown.is_set():
            try:
                if self.run_once():
                    continue
            except Exception:
                logger.exception("worker_loop_error")
            self._shutdown.wait(self.config.poll_interval_sec)
        self.release_claims()
        log_event(logger, "worker_stopped", worker_id=self.config.worker_id)


def main() -> None:
    config = WorkerConfig.from_env()
    config.validate()
    configure_logging(config.log_level)
    runner = WorkerRunner(config)
    runner.install_signal_handlers()
    runner.run_forever()


if __name__ == "__main__":
    main()
