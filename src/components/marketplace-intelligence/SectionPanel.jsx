import { useState } from "react";
import {
  ConcentrationChart,
  ConcentrationNote,
  FeeBreakdownChart,
  MonthlyOrdersChart,
  MonthlySalesChart,
  ProductMixChart,
  WeeklySalesChart,
} from "./Charts.jsx";
import DataTable from "./DataTable.jsx";
import { MetricGrid } from "./MetricCards.jsx";
import { formatInr, formatPct, getSection } from "../../lib/marketplace-intelligence/index.js";

const STATUS_LABELS = {
  matched: "Matched",
  difference: "Difference",
  not_comparable: "Not comparable",
  missing_information: "Missing information",
  unavailable: "Unavailable",
};

function Drilldown({ title, rows, onClose }) {
  if (!rows) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[rgba(26,54,115,0.12)] bg-[#f8fafc] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#1a3673]">{title}</h4>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-500">
          Close
        </button>
      </div>
      <DataTable
        rowKey="sourceRow"
        columns={[
          { key: "postedAt", label: "Date" },
          { key: "transactionType", label: "Type" },
          { key: "orderId", label: "Order" },
          { key: "productName", label: "Product" },
          { key: "amount", label: "Amount", kind: "currency", defaultSort: "desc" },
          { key: "sourceRow", label: "Source row", align: "right" },
        ]}
        rows={rows}
      />
    </div>
  );
}

function ToplineSection({ section, chartInsights, onInvestigate }) {
  const kpis = section.kpis || {};
  const canNetOrders = kpis.netOrderCount != null && Boolean(kpis.canSubtractFullRefunds);
  const netHint =
    kpis.netOrdersBasis === "no_refunds"
      ? "Equals gross orders — no refund rows in scope"
      : canNetOrders
        ? "Gross minus verified full-order refunds"
        : "Unavailable — refunds are not all verified full-order reversals";
  const orderMetrics = [
    { label: "Gross orders", value: kpis.grossOrderCount ?? kpis.orderCount, kind: "count", hint: "Distinct Order IDs on Order Payment" },
    canNetOrders && kpis.netOrdersBasis !== "no_refunds"
      ? {
          label: "Refunded orders",
          value: kpis.fullRefundOrderCount,
          kind: "count",
          hint: "Full refunds matched to gross orders",
        }
      : {
          label: "Orders affected by refunds",
          value: kpis.ordersAffectedByRefunds ?? kpis.refundedOrderCount,
          kind: "count",
          hint:
            kpis.netOrdersBasis === "no_refunds"
              ? "No refund rows in current scope"
              : "Partial/ambiguous or incomplete — not auto-subtracted",
        },
    {
      label: "Net orders",
      value: canNetOrders ? kpis.netOrderCount : null,
      kind: "count",
      hint: netHint,
    },
  ];
  const skew = section.orderValues || {};
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Gross product sales", value: kpis.grossProductSales, kind: "currency", hint: "Order Payment product charges" },
          { label: "Refund amount", value: kpis.refundAmountAbs, kind: "currency", hint: "Abs. product charges on Refund rows" },
          { label: "Net product sales", value: kpis.netProductSales, kind: "currency", hint: "Gross − refund amount" },
          kpis.momGrowthComparable === false
            ? {
                label: "Latest MoM growth",
                value: kpis.momGrowthDisplay || "Incomplete period — MoM not comparable",
                kind: "text",
                display: kpis.momGrowthDisplay || "Incomplete period — MoM not comparable",
                hint: kpis.momGrowthHint || "Reporting periods are not equivalent for a definitive MoM %.",
              }
            : {
                label: "Latest MoM growth",
                value: kpis.momGrowthLatest,
                kind: "pct",
                hint: kpis.momGrowthHint || "MoM vs prior-month Gross Product Sales",
              },
        ]}
      />
      <MetricGrid items={orderMetrics} />
      <MetricGrid
        items={[
          {
            label: "Gross AOV",
            value: kpis.aov,
            kind: "currency",
            hint: "Gross product sales ÷ gross distinct orders",
          },
          {
            label: "Median order value",
            value: kpis.medianOrderValue,
            kind: "currency",
            hint: "Same gross order population as Gross AOV",
          },
          { label: "Orders above 2× median", value: kpis.ordersAbove2xMedian, kind: "count" },
          {
            label: "Sales share above 2× median",
            value: kpis.salesShareAbove2xMedian,
            kind: "pct",
            hint: skew.skewMaterial ? "Large orders materially skew gross AOV" : "Share of gross product sales",
          },
        ]}
      />
      {skew.skewMaterial ? (
        <p className="rounded-xl bg-[#fff8f3] px-3 py-2 text-sm text-slate-600">
          Large orders are materially skewing the average: {kpis.ordersAbove2xMedian} order(s) above 2× median
          contribute {formatInr(kpis.salesAbove2xMedian)} ({formatPct(kpis.salesShareAbove2xMedian)} of gross
          product sales). Median {formatInr(kpis.medianOrderValue)} is the better typical-order signal than gross AOV{" "}
          {formatInr(kpis.aov)}.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlySalesChart
          rows={section.monthly}
          insights={chartInsights?.["monthly-sales"]}
          onInvestigate={() => onInvestigate("monthly-sales", "How did monthly sales and growth move in this period?")}
        />
        <MonthlyOrdersChart
          rows={section.monthly}
          insights={chartInsights?.["monthly-orders"]}
          onInvestigate={() => onInvestigate("monthly-orders", "What are order volume and average order value?")}
        />
        <WeeklySalesChart
          rows={section.weekly}
          insights={chartInsights?.weekly}
          onInvestigate={() => onInvestigate("weekly", "Which weeks look like bulk orders rather than a run-rate change?")}
        />
        <ProductMixChart
          rows={section.productMix}
          insights={chartInsights?.["product-mix"]}
          onInvestigate={() => onInvestigate("product-mix", "Which products contribute the most revenue?")}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[#1a3673]">Bulk-order candidates</h3>
        <DataTable
          rowKey="sourceRow"
          columns={[
            { key: "postedAt", label: "Date" },
            { key: "orderId", label: "Order" },
            { key: "productName", label: "Product" },
            { key: "amount", label: "Product charges", kind: "currency", defaultSort: "desc" },
          ]}
          rows={section.bulkOrders}
          empty="No bulk-order candidates under the current threshold."
        />
      </div>
    </div>
  );
}

function EconomicsSection({ section, chartInsights, onInvestigate }) {
  const [drillId, setDrillId] = useState(null);
  const drillRows = drillId ? section.drilldownByCategory?.[drillId] : null;
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Amazon selling fees", value: section.sellingFees, kind: "currency", hint: "CSV aggregate — not referral-only" },
          { label: "Advertising", value: section.advertising, kind: "currency" },
          { label: "Inbound transportation", value: section.inboundTransportation, kind: "currency" },
          {
            label: "Effective deduction rate",
            value: section.effectiveMarketplaceDeductionRate,
            kind: "pct",
            hint: "Marketplace fees ÷ gross product sales (excludes refunds & promo rebates)",
          },
        ]}
      />
      {section.refundsShownInTopline ? (
        <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-slate-600">
          Customer product refunds ({formatInr(Math.abs(section.refundProductCharges || 0))}) are shown in Topline
          as sales reductions — not as Amazon fee drains. Refund-related Amazon fees remain in selling fees when
          classified on refund rows.
        </p>
      ) : null}
      {section.promotionalRebates ? (
        <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-slate-600">
          Promotional rebates ({formatInr(section.promotionalRebates)}) come from the CSV promotional rebates
          column. They are settlement adjustments — not classified as Amazon marketplace fees, and excluded from
          the marketplace deduction rate.
        </p>
      ) : null}
      <FeeBreakdownChart
        rows={section.marketplaceFeeDrains || section.whereMoneyGoes?.filter((row) => row.isMarketplaceFee)}
        insights={chartInsights?.["fee-breakdown"]}
        onInvestigate={() => onInvestigate("fee-breakdown", "Where is Amazon taking the money?")}
      />
      {section.unexplainedOtherCredits > 0 ? (
        <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-slate-600">
          Unexplained CSV Other credits: {formatInr(section.unexplainedOtherCredits)}. Shown on the settlement
          waterfall — not treated as tax, fees, or product revenue.
        </p>
      ) : null}
      <DataTable
        rowKey="id"
        columns={[
          { key: "label", label: "Category" },
          { key: "amount", label: "Amount", kind: "currency", defaultSort: "asc" },
          {
            key: "category",
            label: "Class",
            render: (value, row) =>
              row.isMarketplaceFee ? "Marketplace fee" : value === "settlement_adjustment" ? "Adjustment" : value || "—",
          },
          { key: "note", label: "Note" },
        ]}
        rows={section.whereMoneyGoes}
        onRowClick={(row) => setDrillId(row.id)}
      />
      <Drilldown title={drillId ? `Transactions: ${drillId}` : ""} rows={drillRows} onClose={() => setDrillId(null)} />
    </div>
  );
}

function ProductSection({ section, chartInsights, onInvestigate }) {
  return (
    <div className="space-y-4">
      <ConcentrationNote value={section.top8Concentration} />
      <MetricGrid
        items={[
          { label: "Top-8 revenue share", value: section.top8Concentration, kind: "pct" },
          { label: "Top-8 sales", value: section.top8Sales, kind: "currency" },
          { label: "Products ranked", value: section.products?.length, kind: "count" },
          { label: "Median order size", value: section.orderSizes?.median, kind: "currency" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ConcentrationChart
          products={section.top8 || section.products}
          concentration={section.top8Concentration}
          insights={chartInsights?.concentration}
        />
        <ProductMixChart
          rows={section.products}
          insights={chartInsights?.["product-rank"]}
          onInvestigate={() => onInvestigate("product-rank", "Which products contribute the most revenue?")}
        />
      </div>
      <DataTable
        rowKey="productName"
        columns={[
          { key: "productName", label: "Product" },
          { key: "sales", label: "Sales", kind: "currency", defaultSort: "desc" },
          { key: "orders", label: "Orders", align: "right" },
          { key: "aov", label: "AOV", kind: "currency" },
          {
            key: "feeBurden",
            label: "Fee burden",
            kind: "pct",
            render: (value, row) => (row.feesAvailable ? formatPct(value) : "—"),
          },
          { key: "revenueShare", label: "Revenue share (%)", kind: "pct" },
        ]}
        rows={section.products}
      />
      <h3 className="text-sm font-semibold text-[#1a3673]">Order-size distribution</h3>
      <DataTable
        rowKey="id"
        columns={[
          { key: "label", label: "Bucket" },
          { key: "orders", label: "Orders", defaultSort: "desc", align: "right" },
          { key: "sales", label: "Sales", kind: "currency" },
        ]}
        rows={section.orderSizes?.buckets || []}
      />
    </div>
  );
}

function WaterfallTable({ waterfall }) {
  const steps = waterfall?.steps || [];
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(26,54,115,0.1)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">Step</th>
            <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
            <th className="px-3 py-2.5 text-right font-semibold">Running balance</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr
              key={step.id}
              className={`border-t border-[rgba(26,54,115,0.06)] ${
                step.kind === "result" ? "bg-[#f4f7fb] font-semibold" : ""
              } ${step.kind === "info" ? "bg-[#fff8f3]" : ""}`}
            >
              <td className="px-3 py-2.5 text-[#1a3673]">
                <div>{step.label}</div>
                {step.note ? <div className="mt-0.5 text-xs font-normal text-slate-500">{step.note}</div> : null}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#1a3673]">{formatInr(step.amount)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#1a3673]">
                {step.runningBalance == null ? "—" : formatInr(step.runningBalance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {waterfall?.missingInformation?.length ? (
        <div className="border-t border-[rgba(26,54,115,0.08)] px-3 py-3 text-xs text-slate-500">
          Partial bridge. Missing: {waterfall.missingInformation.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function ProfitabilitySection({ section, reconciliation, chartInsights }) {
  const waterfallInsight = chartInsights?.waterfall;
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          {
            label: "Amazon settlement movement",
            value: section.amazonProceeds,
            kind: "currency",
            hint: "CSV Total (INR) — not profit",
          },
          { label: "Bank transfers (PDF)", value: section.bankTransfers, kind: "currency" },
          { label: "Net GST collected (PDF)", value: section.netGstCollected, kind: "currency" },
          { label: "Product profit", value: null, kind: "currency", hint: "Needs product costs" },
        ]}
      />
      <h3 className="text-sm font-semibold text-[#1a3673]">Sales-to-settlement waterfall</h3>
      {waterfallInsight ? (
        <div className="space-y-1.5 rounded-xl bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-slate-600">
          <p>
            <span className="font-semibold text-[#1a3673]">Key insight:</span> {waterfallInsight.keyInsight}
          </p>
          <p>
            <span className="font-semibold text-[#c55a12]">Worth investigating:</span>{" "}
            {waterfallInsight.worthInvestigating}
          </p>
        </div>
      ) : null}
      <WaterfallTable waterfall={section.waterfall} />

      <h3 className="text-sm font-semibold text-[#1a3673]">PDF reconciliation</h3>
      <p className="text-sm text-slate-500">
        {reconciliation?.statusLabel || "Not reviewed"}. Only comparable lines can be matched or flagged as differences.
      </p>
      <DataTable
        rowKey="id"
        columns={[
          { key: "label", label: "Check" },
          { key: "txValue", label: "Transactions", kind: "currency" },
          { key: "pdfValue", label: "PDF", kind: "currency" },
          { key: "difference", label: "Difference", kind: "currency" },
          {
            key: "status",
            label: "Status",
            render: (value) => STATUS_LABELS[value] || value,
          },
        ]}
        rows={reconciliation?.comparisons || []}
        empty="Upload the Unified Summary PDF to reconcile settlement totals."
      />
      {(reconciliation?.comparisons || []).some((row) => row.explanation) ? (
        <div className="space-y-2 rounded-2xl border border-[rgba(26,54,115,0.12)] bg-[#f8fafc] p-4 text-sm text-slate-600">
          {(reconciliation.comparisons || [])
            .filter((row) => row.status !== "matched" && row.explanation)
            .map((row) => (
              <p key={row.id}>
                <span className="font-semibold text-[#1a3673]">{row.label}:</span> {row.explanation}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export default function SectionPanel({ sectionId, engine, onInvestigate, limitations }) {
  const sectionMeta = getSection(sectionId);
  const metrics = engine?.metrics;
  const ready = metrics?.status === "calculated";
  const section = metrics?.sections?.[sectionId];
  const chartInsights = metrics?.chartInsights || {};

  return (
    <section className="rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-white p-5 shadow-[0_16px_40px_rgba(26,54,115,0.06)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#1a3673]">{sectionMeta.label}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{sectionMeta.summary}</p>
        </div>
        <span className="rounded-full bg-[#fff4ea] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#c55a12]">
          {ready ? "Calculated" : metrics?.status || "Waiting for file"}
        </span>
      </div>

      {!ready ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgba(26,54,115,0.16)] px-4 py-8 text-sm text-slate-500">
          Upload an Amazon transaction CSV, or load the anonymized sample, to populate this section.
          {engine?.normalized?.issues?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[#9a4b10]">
              {engine.normalized.issues.slice(0, 5).map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {ready && sectionId === "topline" ? (
        <div className="mt-5">
          <ToplineSection section={section} chartInsights={chartInsights} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "amazon_economics" ? (
        <div className="mt-5">
          <EconomicsSection section={section} chartInsights={chartInsights} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "product_performance" ? (
        <div className="mt-5">
          <ProductSection section={section} chartInsights={chartInsights} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "profitability" ? (
        <div className="mt-5">
          <ProfitabilitySection
            section={section}
            reconciliation={engine.reconciliation}
            chartInsights={chartInsights}
          />
        </div>
      ) : null}

      {ready && limitations ? (
        <p className="mt-5 border-t border-[rgba(26,54,115,0.08)] pt-4 text-xs leading-5 text-slate-500">{limitations}</p>
      ) : null}
    </section>
  );
}
