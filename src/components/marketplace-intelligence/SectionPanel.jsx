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

function ToplineSection({ section, onInvestigate }) {
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Gross product sales", value: section.kpis.grossProductSales, kind: "currency" },
          { label: "Orders", value: section.kpis.orderCount, kind: "count", hint: "Distinct order IDs" },
          { label: "Average order value", value: section.kpis.aov, kind: "currency" },
          { label: "Latest MoM growth", value: section.kpis.momGrowthLatest, kind: "pct" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlySalesChart rows={section.monthly} onInvestigate={() => onInvestigate("monthly-sales", "How did monthly sales and growth move in this period?")} />
        <MonthlyOrdersChart rows={section.monthly} onInvestigate={() => onInvestigate("monthly-orders", "What are order volume and average order value?")} />
        <WeeklySalesChart rows={section.weekly} onInvestigate={() => onInvestigate("weekly", "Which weeks look like bulk orders rather than a run-rate change?")} />
        <ProductMixChart rows={section.productMix} onInvestigate={() => onInvestigate("product-mix", "Which products contribute the most revenue?")} />
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

function EconomicsSection({ section, onInvestigate }) {
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
            hint: "Fee outflows ÷ gross product sales",
          },
        ]}
      />
      <FeeBreakdownChart
        rows={section.whereMoneyGoes}
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
          { key: "note", label: "Note" },
        ]}
        rows={section.whereMoneyGoes}
        onRowClick={(row) => setDrillId(row.id)}
      />
      <Drilldown title={drillId ? `Transactions: ${drillId}` : ""} rows={drillRows} onClose={() => setDrillId(null)} />
    </div>
  );
}

function ProductSection({ section, onInvestigate }) {
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
        <ConcentrationChart products={section.top8 || section.products} concentration={section.top8Concentration} />
        <ProductMixChart
          rows={section.products}
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

function ProfitabilitySection({ section, reconciliation }) {
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
          <ToplineSection section={section} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "amazon_economics" ? (
        <div className="mt-5">
          <EconomicsSection section={section} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "product_performance" ? (
        <div className="mt-5">
          <ProductSection section={section} onInvestigate={onInvestigate} />
        </div>
      ) : null}
      {ready && sectionId === "profitability" ? (
        <div className="mt-5">
          <ProfitabilitySection section={section} reconciliation={engine.reconciliation} />
        </div>
      ) : null}

      {ready && limitations ? (
        <p className="mt-5 border-t border-[rgba(26,54,115,0.08)] pt-4 text-xs leading-5 text-slate-500">{limitations}</p>
      ) : null}
    </section>
  );
}
