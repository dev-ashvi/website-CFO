from __future__ import annotations

import pytest

from wyz_analytics.workers.service import (
    FAILED,
    JOB_COMPLETED,
    NEEDS_REVIEW,
    READY,
    AnalyticsWorkspace,
)


def test_incomplete_files_cannot_start_analysis(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path)
    dataset = workspace.create_dataset(name="Incomplete")
    workspace.save_uploads(
        dataset.dataset_id,
        [("orders.csv", b"order_id,sku_id,quantity\nO1,SKU1,1\n")],
    )
    workspace.run_ingest(dataset.dataset_id)
    record = workspace.get_dataset(dataset.dataset_id)
    assert record.status in {NEEDS_REVIEW, FAILED}
    with pytest.raises(ValueError):
        workspace.start_analysis(record.dataset_id)


def test_beautyco_worker_path_matches_golden(beautyco_paths, expected, tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path)
    dataset = workspace.create_dataset(name="BeautyCo FY26")
    files = [(path.name, path.read_bytes()) for path in beautyco_paths]
    workspace.save_uploads(dataset.dataset_id, files)
    workspace.run_ingest(dataset.dataset_id)
    record = workspace.get_dataset(dataset.dataset_id)
    assert record.status == READY, record.error
    public = record.public_dict()
    assert public["readiness"]["ready_for_engine"] is True
    roles = {item["file_role"] for item in public["files"]}
    assert "ORDER_LINES" in roles
    job = workspace.start_analysis(record.dataset_id, wait=True)
    assert job.status == JOB_COMPLETED
    summary = workspace.get_dataset(record.dataset_id).summary
    gold = expected["company_waterfall_inr"]
    assert abs(summary["waterfall"]["net_revenue"] - gold["net_revenue"]) <= 0.05
    assert abs(summary["waterfall"]["cm2"] - gold["cm2"]) <= 0.05
    assert summary["reconciled"] is True
    assert summary["orders"] > 0
    assert "gross_margin_pct" in summary["waterfall"]
    assert summary["dataset_id"] == record.dataset_id
    assert summary["lineage"]["workspace_id"] == record.workspace_id
    assert summary["lineage"]["dataset_version"] == record.dataset_version
    assert summary["lineage"]["mapping_version"] == record.mapping_version
    assert summary["lineage"]["job_id"] == job.job_id
    assert summary["by_channel"]
    persisted = workspace.get_result(record.dataset_id)
    assert persisted["result_id"] == summary["result_id"]
    assert summary.get("explorers") is not None
    assert summary["explorers"]["company"]["net_aov"] is not None
