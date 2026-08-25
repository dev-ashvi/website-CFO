from __future__ import annotations

import threading

from wyz_analytics.config import ENGINE_VERSION
from wyz_analytics.workers.errors import ENGINE_FAILURE, MISSING_SOURCE, RESULT_WRITE_FAILURE, AnalyticsError
from wyz_analytics.workers.jobs import (
    CLAIMED,
    COMPLETED,
    FAILED,
    KIND_ANALYSE,
    MAPPING,
    PROFILING,
    VALIDATING,
    WRITING_RESULT,
    AnalysisJob,
    FilesystemJobStore,
)
from wyz_analytics.workers.service import JOB_COMPLETED, READY, AnalyticsWorkspace
from wyz_analytics.workers.storage import FilesystemBlobStore


def _job(job_id: str, *, kind: str = KIND_ANALYSE) -> AnalysisJob:
    return AnalysisJob(
        job_id=job_id,
        workspace_id="local",
        dataset_id="ds_test",
        dataset_version=1,
        mapping_version="m1",
        engine_version=ENGINE_VERSION,
        kind=kind,
        message="queued",
    )


def test_claim_next_is_atomic_and_does_not_double_claim(tmp_path):
    store = FilesystemJobStore(tmp_path)
    store.put(_job("job_only"))
    claimed = []

    def worker(worker_id: str) -> None:
        claimed.append(store.claim_next(worker_id))

    threads = [threading.Thread(target=worker, args=(f"w{i}",)) for i in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    winners = [item for item in claimed if item is not None]
    assert len(winners) == 1
    assert winners[0].job_id == "job_only"
    assert winners[0].stage == CLAIMED
    assert store.claim_next("w3") is None


def test_two_queued_jobs_are_claimed_by_separate_workers(tmp_path):
    store = FilesystemJobStore(tmp_path)
    store.put(_job("job_one"))
    store.put(_job("job_two"))
    first = store.claim_next("w1")
    second = store.claim_next("w2")
    assert {first.job_id, second.job_id} == {"job_one", "job_two"}
    assert first.claimed_by != second.claimed_by


def test_complete_is_idempotent(tmp_path):
    store = FilesystemJobStore(tmp_path)
    job = store.put(_job("job_done"))
    store.claim_next("w1")
    first = store.complete(job, result_ref="wyz-blob://results/job_done.json")
    second = store.complete(job, result_ref="wyz-blob://results/job_done.json")
    assert first.stage == COMPLETED
    assert second.stage == COMPLETED
    assert first.result_ref == second.result_ref


def test_worker_restart_requeues_abandoned_claim(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="local-worker")
    workspace.jobs.put(_job("job_retry"))
    claimed = workspace.jobs.claim_next("local-worker")
    assert claimed.stage == CLAIMED
    restarted = AnalyticsWorkspace(root=tmp_path, worker_id="local-worker")
    restarted.recover()
    again = restarted.jobs.claim_next("local-worker")
    assert again is not None
    assert again.job_id == "job_retry"
    assert again.stage == CLAIMED


def test_recover_completes_job_when_result_already_written(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="local-worker")
    job = workspace.jobs.put(_job("job_written"))
    uri = workspace.blobs.result_uri(job.job_id)
    workspace.blobs.put_json(uri, {"result_id": "res_job_written", "job_id": job.job_id})
    job.stage = WRITING_RESULT
    job.status = WRITING_RESULT
    job.claimed_by = "local-worker"
    workspace.jobs.save(job)
    recovered = workspace.recover()
    assert recovered == 1
    finished = workspace.get_job(job.job_id)
    assert finished.stage == COMPLETED
    assert finished.result_ref == uri


def test_missing_source_fails_with_typed_error(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="w1")
    dataset = workspace.create_dataset(name="Missing source")
    dataset.status = READY
    dataset.readiness = {"ready_for_engine": True}
    dataset.source_files = [
        {
            "name": "orders.csv",
            "uri": workspace.blobs.source_uri(dataset.workspace_id, dataset.dataset_id, 1, "orders.csv"),
        }
    ]
    workspace.datasets.put(dataset)
    job = workspace.start_analysis(dataset.dataset_id, wait=True)
    assert job.stage == FAILED
    assert job.error["type"] == MISSING_SOURCE
    assert "traceback" not in job.error["message"].lower()
    public = workspace.get_dataset(dataset.dataset_id).public_dict()
    assert public["error"] == job.error["message"]
    assert "wyz-blob://" not in (public["error"] or "")


def test_ingest_stage_progression(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="w1")
    stages: list[str] = []
    original = workspace.jobs.save

    def spy(job: AnalysisJob) -> AnalysisJob:
        stages.append(job.stage)
        return original(job)

    workspace.jobs.save = spy
    dataset = workspace.create_dataset(name="Incomplete")
    workspace.save_uploads(dataset.dataset_id, [("orders.csv", b"order_id,sku_id,quantity\nO1,SKU1,1\n")])
    workspace.run_ingest(dataset.dataset_id)
    assert CLAIMED in stages
    assert PROFILING in stages
    assert MAPPING in stages
    assert VALIDATING in stages


def test_engine_failure_is_typed(beautyco_paths, tmp_path):
    def boom(*_args, **_kwargs):
        raise RuntimeError("engine exploded")

    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="w1", engine=boom)
    dataset = workspace.create_dataset(name="BeautyCo")
    files = [(path.name, path.read_bytes()) for path in beautyco_paths]
    workspace.save_uploads(dataset.dataset_id, files)
    workspace.run_ingest(dataset.dataset_id)
    record = workspace.get_dataset(dataset.dataset_id)
    assert record.status == READY, record.error
    job = workspace.start_analysis(record.dataset_id, wait=True)
    assert job.stage == FAILED
    assert job.error["type"] == ENGINE_FAILURE
    assert "engine exploded" not in job.error["message"]
    assert job.to_dict()["error"]["message"] == job.error["message"]


class _FailingResultStore(FilesystemBlobStore):
    def put_json(self, uri: str, payload):
        if "/results/" in uri:
            raise AnalyticsError(RESULT_WRITE_FAILURE)
        return super().put_json(uri, payload)


def test_result_write_failure_is_typed(beautyco_paths, tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="w1", blobs=_FailingResultStore(tmp_path))
    dataset = workspace.create_dataset(name="BeautyCo")
    files = [(path.name, path.read_bytes()) for path in beautyco_paths]
    workspace.save_uploads(dataset.dataset_id, files)
    workspace.run_ingest(dataset.dataset_id)
    record = workspace.get_dataset(dataset.dataset_id)
    assert record.status == READY, record.error
    job = workspace.start_analysis(record.dataset_id, wait=True)
    assert job.stage == FAILED
    assert job.error["type"] == RESULT_WRITE_FAILURE
    assert workspace.get_result(record.dataset_id) is None


def test_execute_is_idempotent_after_result_exists(beautyco_paths, tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, worker_id="w1")
    dataset = workspace.create_dataset(name="BeautyCo")
    files = [(path.name, path.read_bytes()) for path in beautyco_paths]
    workspace.save_uploads(dataset.dataset_id, files)
    workspace.run_ingest(dataset.dataset_id)
    record = workspace.get_dataset(dataset.dataset_id)
    job = workspace.start_analysis(record.dataset_id, wait=True)
    assert job.status == JOB_COMPLETED
    first = workspace.get_result(record.dataset_id)
    workspace.executor.execute(job)
    second = workspace.get_result(record.dataset_id)
    results = list((tmp_path / "blobs" / "results").glob("*.json"))
    assert len(results) == 1
    assert first["result_id"] == second["result_id"]
    assert first["lineage"]["engine_version"] == ENGINE_VERSION
    assert first["lineage"]["mapping_version"] == record.mapping_version
    assert first["lineage"]["dataset_version"] == record.dataset_version
    assert first["lineage"]["job_id"] == job.job_id
    assert "by_sku" in first
    assert "by_month" in first
    assert "methodology" in first
