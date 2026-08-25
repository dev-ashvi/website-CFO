from __future__ import annotations

import threading

from wyz_analytics.workers.config import WorkerConfig
from wyz_analytics.workers.jobs import CLAIMED, AnalysisJob
from wyz_analytics.workers.runner import WorkerRunner


def test_runner_releases_claims_on_shutdown(tmp_path):
    config = WorkerConfig(
        mode="local",
        api_base_url=None,
        worker_id="shutdown-worker",
        worker_token=None,
        work_dir=tmp_path,
        poll_interval_sec=0.01,
        claim_lease_sec=60.0,
        blob_backend="filesystem",
        log_level="WARNING",
        embedded_worker=False,
    )
    runner = WorkerRunner(config)
    job = AnalysisJob(
        job_id="job_shutdown",
        workspace_id="local",
        dataset_id="ds_shutdown",
        dataset_version=1,
        mapping_version="m1",
        kind="ingest",
    )
    runner.workspace.jobs.put(job)
    claimed = runner.workspace.jobs.claim_next("shutdown-worker")
    assert claimed.stage == CLAIMED
    runner._shutdown.set()
    runner.release_claims()
    again = runner.workspace.jobs.get("job_shutdown")
    assert again.stage == "QUEUED"
    assert again.claimed_by is None


def test_runner_polls_until_shutdown(tmp_path):
    config = WorkerConfig(
        mode="local",
        api_base_url=None,
        worker_id="poll-worker",
        worker_token=None,
        work_dir=tmp_path,
        poll_interval_sec=0.01,
        claim_lease_sec=60.0,
        blob_backend="filesystem",
        log_level="WARNING",
        embedded_worker=False,
    )
    runner = WorkerRunner(config)
    runner._shutdown.set()

    def run():
        runner.run_forever()

    thread = threading.Thread(target=run)
    thread.start()
    thread.join(timeout=2)
    assert not thread.is_alive()
