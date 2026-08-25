from __future__ import annotations

from pathlib import Path

import polars as pl
import pytest

from wyz_analytics.ingest.classify import HeuristicRoleClassifier
from wyz_analytics.ingest.loader import TabularLoadError, load_tabular
from wyz_analytics.ingest.models import FileProfile
from wyz_analytics.ingest.profiler import profile_file, profile_frame
from wyz_analytics.schemas.roles import FileRole


def _profile(columns: dict, name: str = "x.csv") -> FileProfile:
    return profile_frame(pl.DataFrame(columns), path=name)


def test_profiler_reports_null_unique_and_samples(tmp_path: Path):
    path = tmp_path / "orders.csv"
    path.write_text("order_id,amount,notes\nA,10,\nB,20,x\nA,30,y\n", encoding="utf-8")
    profile = profile_file(path)
    payload = profile.to_dict()
    assert payload["filename"] == "orders.csv"
    assert payload["row_count"] == 3
    names = {col["name"]: col for col in payload["columns"]}
    assert names["order_id"]["n_unique"] == 2
    assert names["notes"]["null_pct"] > 0
    assert names["amount"]["likely_amount"] is True
    assert names["order_id"]["likely_identifier"] is True
    assert "10" in {str(v) for v in names["amount"]["sample_values"]} or 10 in names["amount"]["sample_values"]


def test_profiler_detects_date_range():
    frame = pl.DataFrame({"order_date": ["01-04-2025", "15-04-2025", "20-04-2025"]})
    col = {c.name: c for c in profile_frame(frame, path="d.csv").columns}["order_date"]
    assert col.inferred_type == "date"
    assert col.date_min == "2025-04-01"
    assert col.date_max == "2025-04-20"


def test_classify_does_not_use_filename():
    classifier = HeuristicRoleClassifier()
    order_like = _profile(
        {
            "ORDER_ID": ["1"],
            "ORDER_LINE_ID": ["l1"],
            "GROSS_REVENUE": [10.0],
            "NET_REVENUE": [8.0],
            "QUANTITY": [1],
            "SKU_ID": ["s"],
            "RETURN_QTY": [0],
            "RTO_QTY": [0],
        },
        name="random_export.csv",
    )
    sku_like = _profile(
        {
            "SKU_ID": ["s"],
            "UNIT_TOTAL_COGS": [12.0],
            "UNIT_MANUFACTURING_COGS": [10.0],
            "PRODUCT_NAME": ["x"],
            "SUBCATEGORY": ["y"],
        },
        name="01_ORDER_LINES.csv",
    )
    assert classifier.classify(order_like).role == FileRole.ORDER_LINES.value
    assert classifier.classify(sku_like).role == FileRole.SKU_MASTER.value


def test_classify_unknown_for_unrelated_columns():
    result = HeuristicRoleClassifier().classify(_profile({"foo": [1], "bar": ["a"]}))
    assert result.role == FileRole.UNKNOWN.value
    assert result.alternatives


def test_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        load_tabular("definitely-not-here.csv")


def test_empty_csv_is_malformed(tmp_path: Path):
    path = tmp_path / "empty.csv"
    path.write_text("", encoding="utf-8")
    with pytest.raises(TabularLoadError):
        load_tabular(path)


def test_ingest_pipeline_reports_missing_roles(tmp_path: Path):
    from wyz_analytics.ingest.pipeline import ingest_tabular_files

    path = tmp_path / "only_sku.csv"
    path.write_text("SKU_ID,UNIT_TOTAL_COGS,CATEGORY\nS1,10,Face\n", encoding="utf-8")
    result = ingest_tabular_files([path])
    assert result.sources is None
    assert any("Missing file roles" in err for err in result.errors)
