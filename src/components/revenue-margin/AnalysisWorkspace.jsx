import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisInr, formatInrCompact } from "../../planning/scenarioDisplayFormat.js";
import { formatExplorerValue, formatGrowthPct } from "../../lib/revenue-margin/format.js";
import { analysisDataQualityItems } from "../../lib/revenue-margin/dataQuality.js";
import AnalysisFilters, { QuerySummaryFromResponse } from "./AnalysisFilters.jsx";
import CfoSignalsPanel from "./CfoSignalsPanel.jsx";
import AiCfoDrawer from "./AiCfoDrawer.jsx";
import TrackedDecisionsPanel from "./TrackedDecisionsPanel.jsx";
import PrimaryKpiRow from "./PrimaryKpiRow.jsx";
import FinancialWaterfall from "./FinancialWaterfall.jsx";
import { normalizeTrackedDecisionCard } from "../../lib/revenue-margin/trackedDecisions.js";
import {
  ANALYSIS_VIEWS,
  DIMENSIONS,
  MARGIN_METRICS,
  PROFITABILITY_LABELS,
  REVENUE_METRICS,
  TREND_METRICS,
  canDrillRow,
  compareGrowthDisplay,
  dataQualityItems,
  dimensionRows,
  drillGapForDimension,
  explorerPayload,
  filterRowsForExplorer,
  growthMaterialityWeight,
  monthlyTrendSeries,
  overviewSections,
  resolveInvestigation,
  rowEntityLabel,
  sortRows,
} from "../../lib/revenue-margin/explorers.js";
import {
  createDefaultFilters,
  formatPeriodLabel,
  formatScopeViewLabel,
} from "../../lib/revenue-margin/filters.js";
import {
  ASK_WYZ_STARTER_QUESTION,
  buildSignalContext,
} from "../../lib/revenue-margin/signalContext.js";
import {
  buildCostBreakdownRequest,
  loadScopedCostBreakdown,
  mayUseLegacyCostBreakdown,
  presentCostBreakdown,
} from "../../lib/revenue-margin/costBreakdown.js";
import {
  MARGIN_QUERY_METRIC_IDS,
  OVERVIEW_QUERY_METRIC_IDS,
  REVENUE_QUERY_METRIC_IDS,
  TREND_QUERY_METRIC_IDS,
  buildFactQueryPayload,
  fetchFilterFacets,
  fetchPeriodRange,
  hasFactsUri,
  mapQueryRows,
  mixFromQueryRows,
  trendSeriesFromQueryRows,
} from "../../lib/revenue-margin/query.js";
import {
  overviewSectionsFromQuerySummary,
  reconciliationLabel,
  secondaryOverviewSections,
  selectPrimaryKpis,
  selectWaterfall,
  waterfallFromQuerySummary,
} from "../../lib/revenue-margin/summary.js";
import { useFactQuery } from "../../lib/revenue-margin/useFactQuery.js";
import { marginTableColumns, revenueTableColumns } from "../../lib/revenue-margin/analyticalContext.js";

const TABS = [
  { id: ANALYSIS_VIEWS.OVERVIEW, label: "Overview" },
  { id: ANALYSIS_VIEWS.REVENUE, label: "Revenue" },
  { id: ANALYSIS_VIEWS.MARGIN, label: "Margin" },
  { id: ANALYSIS_VIEWS.DATA_QUALITY, label: "Data Quality" },
];

function MetricGrid({ title, items }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => {
          const formatted = formatExplorerValue(item.value, item.kind);
          return (
            <div key={item.key} className="rounded-xl bg-[#f8fafc] px-3 py-3">
              <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${formatted.supported ? "text-[#1a3673]" : "text-slate-400"}`}>
                {formatted.supported ? formatted.text : "Unavailable"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendPanel({ dynamicEnabled, filters, datasetId, result, legacyResult }) {
  const [metricId, setMetricId] = useState("net_revenue");
  const spec = TREND_METRICS.find((item) => item.id === metricId) || TREND_METRICS[0];
  const trendPayload = useMemo(
    () => (dynamicEnabled
      ? buildFactQueryPayload({
        result,
        filters,
        groupBy: ["month"],
        metrics: TREND_QUERY_METRIC_IDS,
        sort: { metric: "net_revenue", direction: "asc" },
      })
      : null),
    [dynamicEnabled, result, filters],
  );
  const trendQuery = useFactQuery({
    enabled: dynamicEnabled && Boolean(datasetId),
    datasetId,
    payload: trendPayload,
  });
  const series = dynamicEnabled
    ? trendSeriesFromQueryRows(trendQuery.data?.rows || [], metricId)
    : monthlyTrendSeries(legacyResult, metricId);
  const chartData = series.filter((row) => row.value != null);
  return (
    <div className="rounded-xl border border-gray-100 bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Executive trend
        </h3>
        <select
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
          className="rounded-lg border border-[rgba(26,54,115,0.16)] px-2 py-1 text-[12px]"
        >
          {TREND_METRICS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>
      {trendQuery.loading && dynamicEnabled && (
        <p className="mt-3 text-[12px] text-slate-500">Loading trend…</p>
      )}
      {trendQuery.error && dynamicEnabled && (
        <p className="mt-3 text-[12px] text-amber-800">{trendQuery.error}</p>
      )}
      {!trendQuery.loading && chartData.length < 2 ? (
        <p className="mt-3 text-[12px] text-slate-500">Insufficient monthly history for trend comparison.</p>
      ) : (
        <div className="mt-3 h-44 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => (spec.kind === "pct" ? `${(v * 100).toFixed(0)}%` : formatAxisInr(v))} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => formatExplorerValue(value, spec.kind).text}
                labelFormatter={(label) => `Month ${label}`}
              />
              <Line type="monotone" dataKey="value" stroke="#1a3673" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ExplorerControls({ dimension, setDimension, metric, setMetric, metrics }) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="text-[12px] text-slate-600">
        View by{" "}
        <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="ml-1 rounded-lg border px-2 py-1">
          {DIMENSIONS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="text-[12px] text-slate-600">
        Metric{" "}
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className="ml-1 rounded-lg border px-2 py-1">
          {metrics.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ComparisonTable({ rows, metricSpec, mode, dimensionId, onDrillRow, loading, emptyMessage }) {
  const [sortKey, setSortKey] = useState(mode === "revenue" ? "net_revenue" : metricSpec.id);
  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);
  const revenueCols = useMemo(() => revenueTableColumns(sorted, metricSpec), [sorted, metricSpec]);
  const marginCols = useMemo(() => marginTableColumns(sorted), [sorted]);
  const maxMateriality = useMemo(
    () => sorted.reduce((max, row) => Math.max(max, compareGrowthDisplay(row).materiality || 0), 0),
    [sorted],
  );
  const drillable = canDrillRow(dimensionId);
  const marketingSpec = MARGIN_METRICS.find((item) => item.id === "marketing_pct");

  if (loading) {
    return <p className="mt-4 text-[12px] text-slate-500">Loading rows…</p>;
  }
  if (!sorted.length) {
    return <p className="mt-4 text-[12px] text-slate-500">{emptyMessage || "No rows match the active filters."}</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      {mode === "revenue" && !revenueCols.showGrowth && (
        <p className="mb-2 text-[11px] text-slate-500">Growth comparison unavailable for this selection.</p>
      )}
      <table className="min-w-full text-left text-[12px]">
        <thead className="text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-2 pr-3">Entity</th>
            <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("net_revenue")}>Net Revenue</th>
            <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("revenue_share")}>Share</th>
            {(mode === "revenue" || marginCols.showOrders) && (
              <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("orders")}>Orders</th>
            )}
            {(mode === "revenue" || marginCols.showAov) && (
              <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("net_aov")}>AOV</th>
            )}
            {mode === "revenue" && revenueCols.showPrimaryMetric && (
              <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey(metricSpec.id)}>{metricSpec.label}</th>
            )}
            {mode === "revenue" && revenueCols.showGrowth && (
              <>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("growth_materiality")}>Growth</th>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("contribution_delta")}>Contribution</th>
              </>
            )}
            {mode === "margin" && (
              <>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("gross_margin_pct")}>GM %</th>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("cm1_pct")}>CM1 %</th>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("marketing_pct")} title={marketingSpec?.tooltip}>
                  Attributed Marketing %
                </th>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("cm2_pct")}>CM2 %</th>
                <th className="cursor-pointer py-2 pr-3" onClick={() => setSortKey("cm2")}>CM2 ₹</th>
                <th className="py-2">Classification</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const growth = compareGrowthDisplay(row);
            const showPrimaryMetric = mode === "revenue" && revenueCols.showPrimaryMetric;
            const metricVal = showPrimaryMetric
              ? formatExplorerValue(row[metricSpec.id] ?? row[metricSpec.fallback], metricSpec.kind)
              : null;
            const entityLabel = rowEntityLabel(row, dimensionId);
            const materialityWeight = growthMaterialityWeight(row, maxMateriality);
            return (
              <tr
                key={String(row._entity || row.channel || row.category || row.sku_id || row.month)}
                className={`border-t border-gray-100 ${drillable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                onClick={drillable ? () => onDrillRow?.(row) : undefined}
              >
                <td className="py-2 pr-3 font-medium text-slate-700">
                  {entityLabel}
                  {drillable && <ChevronRight className="ml-1 inline h-3 w-3 text-slate-400" />}
                </td>
                <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.net_revenue, "currency").text}</td>
                <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.revenue_share, "pct").text}</td>
                {(mode === "revenue" || marginCols.showOrders) && (
                  <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.orders, "count").text}</td>
                )}
                {(mode === "revenue" || marginCols.showAov) && (
                  <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.net_aov, "currency").text}</td>
                )}
                {mode === "revenue" && showPrimaryMetric && (
                  <td className="py-2 pr-3 tabular-nums">{metricVal.text}</td>
                )}
                {mode === "revenue" && revenueCols.showGrowth && (
                  <>
                    <td className="py-2 pr-3">
                      {growth.supported ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-[#1a3673]"
                              style={{ width: `${Math.round(materialityWeight * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums">{formatGrowthPct(growth.pct)}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="py-2 tabular-nums font-semibold text-[#1a3673]">
                      {growth.supported ? formatInrCompact(growth.delta) : "—"}
                    </td>
                  </>
                )}
                {mode === "margin" && (
                  <>
                    <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.gross_margin_pct, "pct").text}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.cm1_pct, "pct").text}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.marketing_pct, "pct").text}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.cm2_pct, "pct").text}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatExplorerValue(row.cm2, "currency").text}</td>
                    <td className="py-2 text-[11px] text-slate-600">{PROFITABILITY_LABELS[row.profitability_class] || "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MixPanel({ mix, loading, periodLabel }) {
  if (loading) return <p className="mt-4 text-[12px] text-slate-500">Loading mix…</p>;
  if (!mix?.revenue?.length) return null;
  const sections = [
    { key: "revenue", label: "Revenue share" },
    { key: "orders", label: "Order share" },
    { key: "units", label: "Unit share" },
    { key: "customers", label: "Customer share" },
  ].filter((section) => mix[section.key]?.length);

  return (
    <div className="mt-4 rounded-xl border border-gray-100 p-4">
      <h4 className="text-[12px] font-semibold text-[#1a3673]">Mix ({periodLabel})</h4>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <div key={section.key}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.label}</p>
            <ul className="mt-2 space-y-1 text-[12px]">
              {mix[section.key].slice(0, 6).map((item) => (
                <li key={item.entity} className="flex justify-between gap-3">
                  <span className="truncate">{item.entity}</span>
                  <span className="shrink-0 tabular-nums">{formatExplorerValue(item.share, "pct").text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConcentrationPanel({ rows, loading }) {
  if (loading) return null;
  const ranked = [...(rows || [])].sort((a, b) => Number(b.cm2 || 0) - Number(a.cm2 || 0)).slice(0, 5);
  if (!ranked.length) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {["gross_margin", "cm1", "cm2"].map((key) => (
        <div key={key} className="rounded-xl border border-gray-100 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top {key.replace("_", " ")}</h4>
          <ul className="mt-2 space-y-1 text-[12px]">
            {[...ranked].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0)).slice(0, 5).map((item) => (
              <li key={`${key}-${item._entity}`} className="flex justify-between gap-2">
                <span className="truncate">{item._entity}</span>
                <span className="shrink-0 tabular-nums">{formatInrCompact(item[key])}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CostBreakdownPanel({
  result,
  datasetId,
  filters,
  periodRange,
  dynamicEnabled,
  dimension,
}) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const request = useMemo(
    () => (dynamicEnabled && datasetId
      ? buildCostBreakdownRequest({ result, filters, surface: "margin", dimension })
      : null),
    [dynamicEnabled, datasetId, result, filters, dimension],
  );
  const requestKey = request ? JSON.stringify(request) : "";

  useEffect(() => {
    if (!request || !datasetId) {
      setState({ loading: false, data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    loadScopedCostBreakdown(datasetId, request)
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: err?.message || "Unable to load cost breakdown.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, requestKey]);

  const filtersActive = hasActiveFilters(filters, periodRange);
  const allowLegacy = mayUseLegacyCostBreakdown(filters, periodRange);
  const legacy = presentCostBreakdown(explorerPayload(result)?.cost_breakdown, { scoped: false });

  let presented = null;
  let mode = "none";
  if (dynamicEnabled) {
    if (state.loading) {
      return <p className="mt-3 text-[12px] text-slate-500">Loading cost breakdown for current view…</p>;
    }
    if (state.error) {
      return (
        <p className="mt-3 text-[12px] text-amber-800">
          {filtersActive
            ? "Cost breakdown isn't available for this filtered view."
            : state.error}
        </p>
      );
    }
    if (state.data) {
      presented = presentCostBreakdown(state.data, { scoped: true });
      mode = "scoped";
      if (presented.empty || !presented.available) {
        return (
          <p className="mt-3 text-[12px] text-slate-500">
            Cost breakdown isn't available for this filtered view.
            {presented.limitations?.[0] ? ` ${presented.limitations[0]}` : ""}
          </p>
        );
      }
    }
  } else if (allowLegacy && legacy.available) {
    presented = legacy;
    mode = "legacy";
  } else if (filtersActive) {
    return (
      <p className="mt-3 text-[12px] text-slate-500">
        Cost breakdown isn't available for this filtered view. Re-run analysis to enable dynamic facts.
      </p>
    );
  } else if (!legacy.available) {
    return (
      <p className="mt-3 text-[12px] text-slate-500">
        Component-level cost detail is unavailable for this dataset. Product COGS breakdown requires mapped unit COGS
        components in the product master and engine line facts.
      </p>
    );
  }

  if (!presented?.available) {
    return (
      <p className="mt-3 text-[12px] text-slate-500">
        Component-level cost detail is unavailable for this dataset.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {mode === "scoped" && (
        <p className="text-[11px] text-slate-500">Based on the current filtered view.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {["product_cogs", "cm1_costs"].map((section) => {
          const rows = presented[section] || [];
          if (!rows.length) return null;
          return (
            <div key={section} className="rounded-xl border border-gray-100 p-4">
              <h4 className="text-[12px] font-semibold text-[#1a3673]">
                {section === "product_cogs" ? "Product COGS" : "CM1 Costs"}
              </h4>
              <ul className="mt-2 space-y-1 text-[12px]">
                {rows.map((item) => (
                  <li key={item.key} className="flex justify-between gap-3">
                    <span>{item.label}</span>
                    <span className="tabular-nums">
                      {formatInrCompact(item.value)} · {formatExplorerValue(item.pct_of_net_revenue, "pct").text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DataQualityPanel({ result }) {
  const dq = dataQualityItems(result);
  const items = analysisDataQualityItems(result);
  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${dq.reconciled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {dq.reconciled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {dq.reconciled ? "Financial model reconciled" : "Reconciliation warnings present"}
      </div>
      {dq.gaps.length > 0 && (
        <p className="text-[12px] text-slate-500">Analytics gaps: {dq.gaps.join(", ")}</p>
      )}
      {items.length === 0 ? (
        <p className="text-[13px] text-emerald-700">No data-quality issues reported for this analysis.</p>
      ) : (
        <ul className="space-y-2 text-[13px] text-slate-600">
          {items.map((item) => (
            <li key={`${item.label}-${item.detail}`} className="flex items-start gap-2">
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div>
                <p>{item.label}</p>
                {item.detail && (
                  <details className="mt-1 text-[11px] text-slate-400">
                    <summary className="cursor-pointer">Technical detail</summary>
                    <p className="mt-1">{item.detail}</p>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisWorkspace({ result, datasetId }) {
  const dynamicEnabled = hasFactsUri(result) && Boolean(datasetId);
  const [view, setView] = useState(ANALYSIS_VIEWS.OVERVIEW);
  const [revenueDimension, setRevenueDimension] = useState("channel");
  const [revenueMetric, setRevenueMetric] = useState("net_revenue");
  const [marginDimension, setMarginDimension] = useState("channel");
  const [marginMetric, setMarginMetric] = useState("cm2_pct");
  const [periodRange, setPeriodRange] = useState(null);
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState(createDefaultFilters(null));
  const [bootstrapError, setBootstrapError] = useState(null);
  const [cfoSignals, setCfoSignals] = useState([]);
  const [trackedRefreshKey, setTrackedRefreshKey] = useState(0);
  const [trackedSeed, setTrackedSeed] = useState(null);
  const [signalsScopeHash, setSignalsScopeHash] = useState(null);
  const [askWyzRequest, setAskWyzRequest] = useState(null);

  useEffect(() => {
    if (!dynamicEnabled) return undefined;
    let cancelled = false;
    Promise.all([
      fetchPeriodRange(datasetId, result),
      fetchFilterFacets(datasetId, result),
    ])
      .then(([range, facetValues]) => {
        if (cancelled) return;
        setPeriodRange(range);
        setFacets(facetValues);
        setFilters(createDefaultFilters(range));
      })
      .catch((err) => {
        if (!cancelled) setBootstrapError(err?.message || "Failed to load filter metadata.");
      });
    return () => {
      cancelled = true;
    };
  }, [dynamicEnabled, datasetId, result?.job_id]);

  useEffect(() => {
    setTrackedSeed(null);
  }, [datasetId]);

  const queryReady = !dynamicEnabled || Boolean(periodRange);

  const overviewPayload = useMemo(
    () => (dynamicEnabled
      ? buildFactQueryPayload({
        result,
        filters,
        metrics: OVERVIEW_QUERY_METRIC_IDS,
      })
      : null),
    [dynamicEnabled, result, filters],
  );
  const overviewQuery = useFactQuery({
    enabled: queryReady,
    datasetId,
    payload: overviewPayload,
  });

  const revenuePayload = useMemo(
    () => (dynamicEnabled
      ? buildFactQueryPayload({
        result,
        filters,
        groupBy: [revenueDimension],
        metrics: REVENUE_QUERY_METRIC_IDS,
        sort: { metric: revenueMetric, direction: "desc" },
      })
      : null),
    [dynamicEnabled, result, filters, revenueDimension, revenueMetric],
  );
  const revenueQuery = useFactQuery({
    enabled: queryReady && view === ANALYSIS_VIEWS.REVENUE,
    datasetId,
    payload: revenuePayload,
  });

  const marginPayload = useMemo(
    () => (dynamicEnabled
      ? buildFactQueryPayload({
        result,
        filters,
        groupBy: [marginDimension],
        metrics: MARGIN_QUERY_METRIC_IDS,
        sort: { metric: marginMetric, direction: "desc" },
      })
      : null),
    [dynamicEnabled, result, filters, marginDimension, marginMetric],
  );
  const marginQuery = useFactQuery({
    enabled: queryReady && view === ANALYSIS_VIEWS.MARGIN,
    datasetId,
    payload: marginPayload,
  });

  const legacySections = useMemo(() => overviewSections(result), [result]);
  const legacyWaterfall = useMemo(() => selectWaterfall(result), [result]);
  const overviewSectionsData = dynamicEnabled
    ? (overviewSectionsFromQuerySummary(overviewQuery.data?.summary) || legacySections)
    : legacySections;
  const waterfall = dynamicEnabled
    ? waterfallFromQuerySummary(overviewQuery.data?.summary)
    : legacyWaterfall;

  const revenueRows = dynamicEnabled
    ? mapQueryRows(revenueQuery.data?.rows || [], revenueDimension)
    : filterRowsForExplorer(dimensionRows(result, revenueDimension), { dimensionId: revenueDimension, trail: [] }).rows;
  const marginRows = dynamicEnabled
    ? mapQueryRows(marginQuery.data?.rows || [], marginDimension)
    : filterRowsForExplorer(dimensionRows(result, marginDimension), { dimensionId: marginDimension, trail: [] }).rows;

  const revenueGap = !dynamicEnabled
    ? drillGapForDimension([], revenueDimension)
    : null;
  const marginGap = !dynamicEnabled
    ? drillGapForDimension([], marginDimension)
    : null;

  const recon = reconciliationLabel(result);
  const revenueMetricSpec = REVENUE_METRICS.find((item) => item.id === revenueMetric) || REVENUE_METRICS[0];
  const marginMetricSpec = MARGIN_METRICS.find((item) => item.id === marginMetric) || MARGIN_METRICS[0];
  const periodLabel = formatPeriodLabel(filters, periodRange);
  const surface = view === ANALYSIS_VIEWS.REVENUE
    ? "revenue"
    : view === ANALYSIS_VIEWS.MARGIN
      ? "margin"
      : "overview";
  const activeDimension = view === ANALYSIS_VIEWS.REVENUE
    ? revenueDimension
    : view === ANALYSIS_VIEWS.MARGIN
      ? marginDimension
      : "channel";
  const activeMetric = view === ANALYSIS_VIEWS.REVENUE
    ? revenueMetric
    : view === ANALYSIS_VIEWS.MARGIN
      ? marginMetric
      : null;

  function applyInvestigationResult(result) {
    setFilters(result.filters);
    const targetView =
      result.surface === "revenue" ? ANALYSIS_VIEWS.REVENUE : ANALYSIS_VIEWS.MARGIN;
    setView(targetView);
    const explorerDim = result.dimension || (result.filters?.sku?.length === 1 ? "sku" : null);
    if (!explorerDim) return;
    if (targetView === ANALYSIS_VIEWS.REVENUE) setRevenueDimension(explorerDim);
    else setMarginDimension(explorerDim);
  }

  function handleDrill(row, dimensionId, setDimension) {
    const label = rowEntityLabel(row, dimensionId);
    const result = resolveInvestigation({
      filters,
      dimension: dimensionId,
      value: label,
    });
    setFilters(result.filters);
    const explorerDim = result.dimension || (dimensionId === "sku" ? "sku" : null);
    if (explorerDim) setDimension(explorerDim);
  }

  function handleInvestigate(signal) {
    const dimension = String(signal?.entity_type || "");
    const value = signal?.entity;
    if (!value || !["channel", "category", "sku"].includes(dimension)) return;
    applyInvestigationResult(
      resolveInvestigation({
        filters,
        dimension,
        value,
        signal,
      }),
    );
  }

  function handleAskWyz(signal) {
    const ctx = buildSignalContext(signal, {
      datasetId,
      scopeHash: signalsScopeHash,
    });
    if (!ctx) return;
    // Ask WYZ must NOT narrow filters — only open drawer with topic context.
    setAskWyzRequest({
      id: `${Date.now()}-${ctx.signal_id}`,
      signalContext: ctx,
      question: ASK_WYZ_STARTER_QUESTION,
    });
  }

  const primaryKpis = useMemo(
    () => selectPrimaryKpis(overviewSectionsData),
    [overviewSectionsData],
  );
  const secondarySections = useMemo(
    () => secondaryOverviewSections(overviewSectionsData),
    [overviewSectionsData],
  );

  const companyLabel =
    (typeof result?.company?.name === "string" && result.company.name) ||
    (typeof result?.company_name === "string" && result.company_name) ||
    null;

  if (!result) return null;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <section className="min-w-0 flex-1 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#1a3673]">Financial workspace</h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">
            Understand revenue, profitability and the decisions driving performance.
          </p>
          {(companyLabel || periodLabel) && (
            <p className="mt-1 text-[12px] text-slate-600">
              {companyLabel ? <span className="font-medium text-[#1a3673]">{companyLabel}</span> : null}
              {companyLabel && periodLabel ? " · " : null}
              {periodLabel && periodLabel !== "Period unavailable" ? (
                <span className="tabular-nums">{periodLabel}</span>
              ) : null}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${recon.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {recon.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {recon.ok ? "Model reconciled" : "Review reconciliation"}
        </span>
      </div>

      {!dynamicEnabled && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          Re-run analysis to enable dynamic filtering.
        </p>
      )}
      {bootstrapError && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{bootstrapError}</p>
      )}

      <AnalysisFilters
        filters={filters}
        setFilters={setFilters}
        periodRange={periodRange}
        facets={facets}
        dynamicEnabled={dynamicEnabled}
      />

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-gray-100 pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${view === tab.id ? "bg-[#1a3673] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === ANALYSIS_VIEWS.OVERVIEW && (
        <div className="mt-4 space-y-5">
          {overviewQuery.loading && dynamicEnabled && (
            <p className="text-[12px] text-slate-500">Loading overview…</p>
          )}
          {overviewQuery.error && dynamicEnabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{overviewQuery.error}</p>
          )}

          <PrimaryKpiRow items={primaryKpis} loading={dynamicEnabled && overviewQuery.loading} />

          <CfoSignalsPanel
            datasetId={datasetId}
            result={result}
            filters={filters}
            surface={surface}
            dimension={activeDimension}
            dynamicEnabled={queryReady}
            renderPanel
            title="What Needs Your Attention"
            onSignalsChange={setCfoSignals}
            onSignalsScopeChange={setSignalsScopeHash}
            onInvestigate={handleInvestigate}
            onAskWyz={handleAskWyz}
          />

          <TrendPanel
            dynamicEnabled={queryReady}
            filters={filters}
            datasetId={datasetId}
            result={result}
            legacyResult={result}
          />

          <FinancialWaterfall steps={waterfall} />

          <div className="space-y-5 border-t border-gray-100 pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Business metrics
            </h3>
            <MetricGrid title="Revenue & operating" items={secondarySections.revenue} />
            <MetricGrid title="Profitability detail" items={secondarySections.profitability} />
            <MetricGrid title="Revenue quality" items={secondarySections.quality} />
          </div>
        </div>
      )}

      {view !== ANALYSIS_VIEWS.OVERVIEW && (
        <CfoSignalsPanel
          datasetId={datasetId}
          result={result}
          filters={filters}
          surface={surface}
          dimension={activeDimension}
          dynamicEnabled={queryReady}
          renderPanel={false}
          onSignalsChange={setCfoSignals}
          onSignalsScopeChange={setSignalsScopeHash}
          onInvestigate={handleInvestigate}
          onAskWyz={handleAskWyz}
        />
      )}

      {view === ANALYSIS_VIEWS.REVENUE && (
        <div className="mt-4">
          <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
            <TrendingUp className="h-4 w-4" />
            View by dimension · {periodLabel}
          </div>
          {revenueGap && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{revenueGap}</p>
          )}
          {revenueQuery.error && dynamicEnabled && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{revenueQuery.error}</p>
          )}
          <div className="mt-3">
            <ExplorerControls
              dimension={revenueDimension}
              setDimension={setRevenueDimension}
              metric={revenueMetric}
              setMetric={setRevenueMetric}
              metrics={REVENUE_METRICS.filter((item) => item.id !== "revenue_share")}
            />
          </div>
          <QuerySummaryFromResponse
            title="Filtered revenue summary"
            summary={revenueQuery.data?.summary}
            mode="revenue"
            loading={dynamicEnabled && revenueQuery.loading}
            error={null}
          />
          <ComparisonTable
            rows={revenueRows}
            metricSpec={revenueMetricSpec}
            mode="revenue"
            dimensionId={revenueDimension}
            onDrillRow={(row) => handleDrill(row, revenueDimension, setRevenueDimension)}
            loading={dynamicEnabled && revenueQuery.loading}
          />
          <MixPanel
            mix={dynamicEnabled ? mixFromQueryRows(revenueRows) : explorerPayload(result)?.dimensions?.[revenueDimension]?.mix}
            loading={dynamicEnabled && revenueQuery.loading}
            periodLabel={periodLabel}
          />
        </div>
      )}

      {view === ANALYSIS_VIEWS.MARGIN && (
        <div className="mt-4">
          {marginGap && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{marginGap}</p>
          )}
          {marginQuery.error && dynamicEnabled && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{marginQuery.error}</p>
          )}
          <ExplorerControls
            dimension={marginDimension}
            setDimension={setMarginDimension}
            metric={marginMetric}
            setMetric={setMarginMetric}
            metrics={MARGIN_METRICS}
          />
          <QuerySummaryFromResponse
            title="Filtered margin summary"
            summary={marginQuery.data?.summary}
            mode="margin"
            loading={dynamicEnabled && marginQuery.loading}
            error={null}
          />
          <ComparisonTable
            rows={marginRows}
            metricSpec={marginMetricSpec}
            mode="margin"
            dimensionId={marginDimension}
            onDrillRow={(row) => handleDrill(row, marginDimension, setMarginDimension)}
            loading={dynamicEnabled && marginQuery.loading}
          />
          <ConcentrationPanel rows={marginRows} loading={dynamicEnabled && marginQuery.loading} />
          <CostBreakdownPanel
            result={result}
            datasetId={datasetId}
            filters={filters}
            periodRange={periodRange}
            dynamicEnabled={queryReady}
            dimension={marginDimension}
          />
        </div>
      )}

      {view === ANALYSIS_VIEWS.DATA_QUALITY && (
        <div className="mt-4 space-y-3">
          <DataQualityPanel result={result} />
          {(result.engine_version || result.mapping_version || result.dataset_version != null) && (
            <details className="rounded-lg border border-gray-100 bg-[#f8fafc] px-3 py-2 text-[11px] text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600">Technical details</summary>
              <p className="mt-2">
                {result.engine_version ? `Engine ${result.engine_version}` : null}
                {result.mapping_version ? ` · mapping ${result.mapping_version}` : ""}
                {result.dataset_version != null ? ` · dataset v${result.dataset_version}` : ""}
              </p>
            </details>
          )}
        </div>
      )}

      <TrackedDecisionsPanel
        datasetId={datasetId}
        result={result}
        filters={filters}
        surface={surface}
        dimension={activeDimension}
        dynamicEnabled={queryReady}
        refreshKey={trackedRefreshKey}
        seedDecision={
          trackedSeed && (!trackedSeed.dataset_id || trackedSeed.dataset_id === datasetId)
            ? trackedSeed
            : null
        }
        activeScopeHash={signalsScopeHash}
        activeViewLabel={formatScopeViewLabel(filters, periodRange)}
        onReviewComplete={(response) => {
          const card = normalizeTrackedDecisionCard(response?.decision);
          if (card && (!card.dataset_id || card.dataset_id === datasetId)) {
            setTrackedSeed(card);
          }
          setTrackedRefreshKey((k) => k + 1);
        }}
      />
      </section>
      <AiCfoDrawer
        key={datasetId || "ai-cfo"}
        datasetId={datasetId}
        result={result}
        filters={filters}
        periodRange={periodRange}
        surface={surface}
        dimension={activeDimension}
        metric={activeMetric}
        dynamicEnabled={queryReady}
        signals={cfoSignals}
        signalsScopeHash={signalsScopeHash}
        askWyzRequest={askWyzRequest}
        onAskWyzConsumed={() => setAskWyzRequest(null)}
        onDecisionTracked={(response) => {
          const card = normalizeTrackedDecisionCard(response?.decision);
          if (card && (!card.dataset_id || card.dataset_id === datasetId)) {
            setTrackedSeed(card);
          }
          setTrackedRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
