"""Phase 2E.1 — lightweight dataset library listing."""

from __future__ import annotations

from wyz_analytics.workers.datasets import DatasetRecord, FilesystemDatasetStore
from wyz_analytics.workers.service import AnalyticsWorkspace


def test_l1_l2_repository_lists_multiple_newest_first(tmp_path):
    store = FilesystemDatasetStore(tmp_path)
    a = DatasetRecord(
        workspace_id="local",
        dataset_id="ds_aaaaaa111111",
        dataset_version=1,
        name="Analysis A",
        status="COMPLETED",
        created_at="2026-08-20T10:00:00+00:00",
    )
    b = DatasetRecord(
        workspace_id="local",
        dataset_id="ds_bbbbbb222222",
        dataset_version=1,
        name="Analysis B",
        status="COMPLETED",
        created_at="2026-08-25T10:00:00+00:00",
    )
    store.put(a)
    store.put(b)
    listed = store.list(workspace_id="local")
    assert [item.dataset_id for item in listed] == ["ds_bbbbbb222222", "ds_aaaaaa111111"]


def test_l3_l22_library_payload_is_lightweight_no_result_reads(tmp_path, monkeypatch):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    created = ws.create_dataset(name="Lean list")
    created.status = "COMPLETED"
    created.latest_result_uri = "wyz-blob://results/job_x/result.json"
    created.source_files = [{"name": "orders.csv", "uri": "wyz-blob://x", "bytes": 10}]
    ws.datasets.put(created)

    calls = {"n": 0}

    def boom(_uri):
        calls["n"] += 1
        raise AssertionError("must not read result blobs for library list")

    monkeypatch.setattr(ws.blobs, "get_json", boom)
    payload = ws.list_dataset_library(workspace_id="local")
    assert calls["n"] == 0
    assert payload["count"] == 1
    item = payload["datasets"][0]
    assert item["dataset_id"] == created.dataset_id
    assert item["name"] == "Lean list"
    assert item["file_count"] == 1
    assert "mappings" not in item
    assert "canonical_fields" not in item
    assert "waterfall" not in item
    assert "company" not in item
    assert "facts_uri" not in item


def test_l5_creating_b_does_not_remove_a(tmp_path):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    a = ws.create_dataset(name="A")
    b = ws.create_dataset(name="B")
    ids = {item.dataset_id for item in ws.list_datasets(workspace_id="local")}
    assert a.dataset_id in ids
    assert b.dataset_id in ids


def test_l17_l25_malformed_metadata_skipped(tmp_path):
    store = FilesystemDatasetStore(tmp_path)
    good = DatasetRecord(
        workspace_id="local",
        dataset_id="ds_gooddd123456",
        dataset_version=1,
        name="Good",
        status="COMPLETED",
        created_at="2026-08-25T10:00:00+00:00",
    )
    store.put(good)
    (tmp_path / "datasets" / "ds_bad.json").write_text("{not-json", encoding="utf-8")
    listed = store.list(workspace_id="local", skip_malformed=True)
    assert [item.dataset_id for item in listed] == ["ds_gooddd123456"]


def test_workspace_isolation_excludes_other_workspace(tmp_path):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    local = ws.create_dataset(name="Local", workspace_id="local")
    other = ws.create_dataset(name="Other", workspace_id="tenant_other")
    payload = ws.list_dataset_library(workspace_id="local")
    ids = {item["dataset_id"] for item in payload["datasets"]}
    assert local.dataset_id in ids
    assert other.dataset_id not in ids


def test_l19_list_survives_workspace_reopen(tmp_path):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    a = ws.create_dataset(name="Persist A")
    b = ws.create_dataset(name="Persist B")
    reopened = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    payload = reopened.list_dataset_library(workspace_id="local")
    ids = {item["dataset_id"] for item in payload["datasets"]}
    assert a.dataset_id in ids and b.dataset_id in ids
