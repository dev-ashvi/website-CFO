from __future__ import annotations

import polars as pl

from wyz_analytics.ingest.models import RoleClassification
from wyz_analytics.ingest.profiler import profile_frame
from wyz_analytics.mapping.context import build_schema_mapping_request
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel
from wyz_analytics.mapping.models import ColumnMapping, MappingOrigin, MappingStatus
from wyz_analytics.mapping.propose import propose_file_mapping
from wyz_analytics.schemas.catalogs import ORDER_LINES_SCHEMA
from wyz_analytics.schemas.roles import FileRole
from wyz_analytics.transform.apply import apply_mapping


def test_fake_model_returns_structured_proposals_only():
    frame = pl.DataFrame({"txn_ref": ["O1"], "item_code": ["S1"], "nsv": [10.0]})
    profile = profile_frame(frame, path="x.csv")
    claimed = [
        ColumnMapping(
            source_column="nsv",
            canonical_field="net_revenue",
            origin=MappingOrigin.DETERMINISTIC,
            status=MappingStatus.AUTO_ACCEPTED,
            model_confidence=0.99,
            validation_confidence=0.98,
            final_confidence=0.98,
        )
    ]
    request = build_schema_mapping_request(
        profile,
        ORDER_LINES_SCHEMA,
        file_role=FileRole.ORDER_LINES.value,
        claimed=claimed,
    )
    names = {col.name for col in request.unresolved_source_columns}
    assert "nsv" not in names
    assert "txn_ref" in names
    payload = request.to_dict()
    assert "unresolved_source_columns" in payload
    response = FakeSchemaMappingModel().propose(request).to_dict()
    assert set(response) == {"mappings", "unmapped_source_columns", "unresolved_required_fields"}
    for item in response["mappings"]:
        assert {"source_column", "canonical_field", "model_confidence", "reason_code"} <= set(item)


def test_ai_fills_only_unresolved_medium_names():
    frame = pl.DataFrame(
        {
            "txn_ref": ["O1"],
            "order_line_id": ["L1"],
            "order_date": ["01-04-2025"],
            "customer_id": ["C1"],
            "channel": ["Amazon"],
            "item_code": ["SKU1"],
            "quantity": [1.0],
            "order_status": ["Delivered"],
            "return_qty": [0.0],
            "rto_qty": [0.0],
            "gross_revenue": [100.0],
            "discount_amount": [0.0],
            "net_sales_pre_return": [100.0],
            "refund_amount": [0.0],
            "nsv": [100.0],
        }
    )
    profile = profile_frame(frame, path="orders.csv")
    classification = RoleClassification(role=FileRole.ORDER_LINES.value, confidence=0.9, evidence=[])
    result = propose_file_mapping(profile, classification, mapping_model=FakeSchemaMappingModel())
    by_field = {item.canonical_field: item for item in result.mappings}
    assert by_field["order_id"].source_column == "txn_ref"
    assert by_field["order_id"].origin == MappingOrigin.AI_PROPOSED
    assert by_field["order_id"].status != MappingStatus.AUTO_ACCEPTED
    assert by_field["sku_id"].source_column == "item_code"
    assert by_field["net_revenue"].source_column == "nsv"
    assert by_field["net_revenue"].origin == MappingOrigin.DETERMINISTIC
    assert "sample_values" not in result.diagnostics[0]


def test_user_confirmed_mapping_is_not_overwritten_by_ai_or_deterministic():
    frame = pl.DataFrame(
        {
            "weird_order": ["O1"],
            "order_id": ["OTHER"],
            "order_line_id": ["L1"],
            "quantity": [1.0],
            "net_revenue": [10.0],
        }
    )
    profile = profile_frame(frame, path="x.csv")
    classification = RoleClassification(role=FileRole.ORDER_LINES.value, confidence=0.9, evidence=[])
    prior = [
        ColumnMapping(
            source_column="weird_order",
            canonical_field="order_id",
            origin=MappingOrigin.USER_CONFIRMED,
            status=MappingStatus.CONFIRMED,
            model_confidence=1.0,
            validation_confidence=1.0,
            final_confidence=1.0,
            reason_code="user_confirmed",
        )
    ]
    result = propose_file_mapping(
        profile,
        classification,
        mapping_model=FakeSchemaMappingModel(),
        prior_mappings=prior,
    )
    order = next(item for item in result.mappings if item.canonical_field == "order_id")
    assert order.source_column == "weird_order"
    assert order.origin == MappingOrigin.USER_CONFIRMED
    assert any("not_overwritten" in (d.get("detail") or "") or "locked" in (d.get("detail") or "") for d in result.diagnostics) or any(
        d.get("detail") == "deterministic_skipped_locked_canonical_field" for d in result.diagnostics
    )


def test_currency_and_accounting_values_coerce_without_engine_change():
    frame = pl.DataFrame(
        {
            "ord_no": ["O1"],
            "qty": ["2"],
            "NSV": ["₹1,010.50"],
            "refund": ["(10.5)"],
        }
    )
    mapped = apply_mapping(
        frame,
        {"ord_no": "order_id", "qty": "quantity", "NSV": "net_revenue", "refund": "refund_amount"},
        ORDER_LINES_SCHEMA,
    )
    assert mapped["net_revenue"][0] == 1010.5
    assert mapped["refund_amount"][0] == -10.5
