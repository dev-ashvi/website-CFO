from __future__ import annotations

import polars as pl

from wyz_analytics.ingest.models import ColumnProfile, FileProfile, RoleClassification
from wyz_analytics.mapping.confidence import ConfidencePolicy, combine_confidence, status_for_confidence
from wyz_analytics.mapping.deterministic import propose_deterministic_mappings
from wyz_analytics.mapping.models import MappingOrigin, MappingStatus
from wyz_analytics.mapping.propose import propose_file_mapping
from wyz_analytics.schemas.catalogs import ORDER_LINES_SCHEMA
from wyz_analytics.schemas.roles import FileRole
from wyz_analytics.transform.apply import apply_mapping
from wyz_analytics.validation.grain import detect_grain
from wyz_analytics.validation.joins import join_coverage
from wyz_analytics.validation.relationships import financial_relationships


def _profile(frame: pl.DataFrame, name: str = "f.csv") -> FileProfile:
    cols = []
    n = max(frame.height, 1)
    for col in frame.columns:
        series = frame.get_column(col)
        cols.append(
            ColumnProfile(
                name=col,
                inferred_type="utf8" if series.dtype == pl.Utf8 else "float",
                null_pct=series.null_count() / n,
                unique_pct=series.n_unique() / n,
                n_unique=series.n_unique(),
                sample_values=series.head(3).to_list(),
            )
        )
    return FileProfile(filename=name, path=name, row_count=frame.height, column_count=frame.width, columns=cols)


def test_deterministic_alias_maps_ord_no_and_nsv():
    frame = pl.DataFrame({"ord_no": ["O1"], "NSV": [100.0], "qty": [2.0]})
    profile = _profile(frame)
    mappings = {item.canonical_field: item for item in propose_deterministic_mappings(profile, ORDER_LINES_SCHEMA)}
    assert mappings["order_id"].source_column == "ord_no"
    assert mappings["net_revenue"].source_column == "NSV"
    assert mappings["quantity"].source_column == "qty"


def test_ambiguous_mapping_requires_user_confirmation():
    frame = pl.DataFrame({"net_revenue": [10.0], "nsv": [10.0], "order_id": ["1"]})
    profile = _profile(frame)
    classification = RoleClassification(role=FileRole.ORDER_LINES.value, confidence=0.9, evidence=[])
    result = propose_file_mapping(profile, classification)
    net = next(item for item in result.mappings if item.canonical_field == "net_revenue")
    assert net.status == MappingStatus.USER_CONFIRMATION_REQUIRED
    assert "net_revenue" in result.missing_required_fields or net.alternatives


def test_required_field_detection():
    frame = pl.DataFrame({"order_id": ["1"], "sku_id": ["S"]})
    profile = _profile(frame)
    classification = RoleClassification(role=FileRole.ORDER_LINES.value, confidence=0.8, evidence=[])
    result = propose_file_mapping(profile, classification)
    assert "net_revenue" in result.missing_required_fields
    assert "quantity" in result.missing_required_fields


def test_canonical_transformation_renames_and_coerces():
    frame = pl.DataFrame({"ord_no": ["O1"], "qty": ["2"], "NSV": ["10.5"]})
    mapped = apply_mapping(
        frame,
        {"ord_no": "order_id", "qty": "quantity", "NSV": "net_revenue"},
        ORDER_LINES_SCHEMA,
    )
    assert mapped.columns == ["order_id", "quantity", "net_revenue"]
    assert mapped.schema["quantity"] == pl.Float64
    assert mapped.row(0)[0] == "O1"


def test_join_many_to_one_does_not_flag_left_side_duplicates():
    left = pl.DataFrame({"sku": ["A", "B", "B", "A"]})
    right = pl.DataFrame({"id": ["A", "B", "C"]})
    report = join_coverage(
        left,
        right,
        left_key="sku",
        right_key="id",
        name="order_lines.sku_id→sku_master.sku_id",
        left_cardinality="many",
        right_cardinality="one",
    )
    assert report["left_duplicate_keys"] == 2
    assert report["right_duplicate_keys"] == 0
    assert report["unexpected_duplicate_keys"] == 0
    assert report["cardinality_ok"] is True


def test_join_flags_duplicate_keys_on_one_side():
    left = pl.DataFrame({"sku": ["A", "B"]})
    right = pl.DataFrame({"id": ["A", "A"]})
    report = join_coverage(
        left,
        right,
        left_key="sku",
        right_key="id",
        name="order_lines.sku_id→sku_master.sku_id",
        left_cardinality="many",
        right_cardinality="one",
    )
    assert report["right_duplicate_keys"] == 1
    assert report["unexpected_duplicate_keys"] == 1
    assert report["cardinality_ok"] is False
    assert report["ok"] is False


def test_join_validation_reports_unmatched_and_duplicates():
    left = pl.DataFrame({"sku": ["A", "B", "B", None]})
    right = pl.DataFrame({"id": ["A"]})
    report = join_coverage(left, right, left_key="sku", right_key="id", name="sku")
    assert report["unmatched_count"] == 1
    assert report["left_duplicate_keys"] == 1
    assert report["left_null_keys"] == 1
    assert report["ok"] is False


def test_grain_order_line_vs_sku():
    lines = pl.DataFrame(
        {
            "line": ["L1", "L2", "L3"],
            "order": ["O1", "O1", "O2"],
            "sku": ["A", "B", "A"],
        }
    )
    grain = detect_grain(lines, {"line": "order_line_id", "order": "order_id", "sku": "sku_id"})
    assert grain["estimated_grain"] == "order_line"

    sku = pl.DataFrame({"sku": ["A", "B", "C"]})
    assert detect_grain(sku, {"sku": "sku_id"})["estimated_grain"] == "sku"


def test_financial_relationship_flags_mismatch_without_forcing():
    frame = pl.DataFrame(
        {
            "qty": [1.0],
            "mrp": [100.0],
            "gross": [80.0],
        }
    )
    checks = financial_relationships(
        frame,
        {"qty": "quantity", "mrp": "mrp_per_unit", "gross": "gross_revenue"},
    )
    mismatch = next(item for item in checks if item["name"] == "gross_revenue_vs_qty_mrp")
    assert mismatch["ok"] is False
    assert mismatch["severity"] == "flag"


def test_confidence_model_caps_unvalidated_and_ignores_llm_alone():
    policy = ConfidencePolicy(auto_accept_min=0.95, unvalidated_cap=0.9)
    final = combine_confidence(0.99, None, policy)
    assert final <= 0.9
    assert status_for_confidence(final, origin=MappingOrigin.AI_PROPOSED, policy=policy) != MappingStatus.AUTO_ACCEPTED
    assert (
        status_for_confidence(0.99, origin=MappingOrigin.AI_PROPOSED, policy=policy)
        == MappingStatus.REVIEW_RECOMMENDED
    )
    assert (
        status_for_confidence(0.99, origin=MappingOrigin.DETERMINISTIC, policy=policy)
        == MappingStatus.AUTO_ACCEPTED
    )
    # 0.99 with validation 0.99 auto-accepts only for deterministic origins; AI stays review.
    assert combine_confidence(0.99, 0.99, policy) >= 0.95
