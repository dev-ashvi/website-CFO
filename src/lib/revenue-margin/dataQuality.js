/**
 * CFO-facing data quality labels. Technical identifiers stay in `detail`.
 */

const JOIN_LABELS = {
  "order_lines.sku_id→sku_master.sku_id": {
    label: "Order lines linked to product master",
    detail: "order_lines.sku_id → sku_master.sku_id (many order lines per SKU expected)",
  },
  "order_lines.order_id→settlements.order_id": {
    label: "Order lines linked to channel settlements",
    detail: "order_lines.order_id → settlements.order_id (many order lines per order expected)",
  },
};

const DUPLICATE_LABELS = {
  "order_lines.sku_id→sku_master.sku_id": {
    label: "Product master has duplicate SKU identifiers",
    detail: "sku_master.sku_id should be unique (one row per SKU)",
  },
  "order_lines.order_id→settlements.order_id": {
    label: "Channel settlements have duplicate order identifiers",
    detail: "settlements.order_id should be unique (one settlement row per order)",
  },
};

const GRAIN_LABELS = {
  ORDER_LINES: "Order line grain",
  SKU_MASTER: "Product master grain",
  CHANNEL_SETTLEMENTS: "Channel settlement grain",
  MARKETING_SPEND: "Marketing spend grain",
};

const RELATIONSHIP_LABELS = {
  gross_revenue_vs_qty_mrp: "Gross revenue vs quantity × list price",
  pre_return_vs_gross_minus_discount: "Pre-return sales vs gross minus discounts",
  net_revenue_vs_gross_minus_leakage: "Net revenue vs gross minus discounts and refunds",
  net_revenue_not_above_gross: "Net revenue not above gross revenue",
  sku_unit_cogs_components: "Unit COGS components vs total unit COGS",
};

export function joinQualityLabel(join) {
  const spec = JOIN_LABELS[join?.name] || {};
  const pct = Number(join?.match_pct || 0) * 100;
  const label = spec.label || "Dataset linkage check";
  return {
    ok: Boolean(join?.ok),
    label: `${label}: ${pct.toFixed(1)}% of order-side keys matched`,
    detail: spec.detail || join?.name,
  };
}

export function duplicateKeyLabel(issue) {
  const spec = DUPLICATE_LABELS[issue?.name] || {};
  const count = issue?.unexpected_duplicate_keys ?? issue?.right_duplicate_keys ?? issue?.left_duplicate_keys;
  return {
    ok: false,
    label: spec.label || "Duplicate identifiers found in a master dataset",
    detail: `${spec.detail || issue?.name}${count != null ? ` · ${count} duplicate key(s)` : ""}`,
  };
}

export function missingFieldLabel(field) {
  const [role, name] = String(field).includes(":") ? field.split(":", 2) : ["", field];
  const roleLabel = GRAIN_LABELS[role] || role || "Dataset";
  return {
    ok: false,
    label: `Required field missing: ${name || field}`,
    detail: role ? `${roleLabel} · ${name}` : String(field),
  };
}

export function grainWarningLabel(item) {
  const roleLabel = GRAIN_LABELS[item?.role] || item?.role || "Dataset";
  return {
    ok: false,
    label: `${roleLabel} grain differs from expected structure`,
    detail: `Estimated ${item?.estimated_grain || "unknown"} · expected ${item?.expected_grain || "unknown"}`,
  };
}

export function relationshipWarningLabel(item) {
  return {
    ok: false,
    label: RELATIONSHIP_LABELS[item?.name] || "Financial relationship check flagged",
    detail: item?.name,
  };
}

export function readinessDisplayItems(readiness = {}) {
  if (!readiness) return [];
  return [
    ...(readiness.joins || []).map((join) => joinQualityLabel(join)),
    ...(readiness.missing_required_fields || []).map((field) => missingFieldLabel(field)),
    ...(readiness.duplicate_key_issues || []).map((item) => duplicateKeyLabel(item)),
    ...(readiness.grain_warnings || []).map((item) => grainWarningLabel(item)),
    ...(readiness.relationship_warnings || []).slice(0, 6).map((item) => relationshipWarningLabel(item)),
  ];
}

export function analysisDataQualityItems(result) {
  const validation = result?.validation || {};
  const recon = result?.reconciliation || {};
  const items = readinessDisplayItems(validation);
  if (recon.failed_checks?.length) {
    items.push({
      ok: false,
      label: "Financial reconciliation checks need review",
      detail: recon.failed_checks.join(", "),
    });
  }
  if (result?.limitations?.length) {
    items.push({
      ok: false,
      label: "Analysis completed with documented limitations",
      detail: result.limitations.join(", "),
    });
  }
  return items;
}
