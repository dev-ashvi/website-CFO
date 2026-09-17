import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  analysisDataQualityItems,
  dataQualityStatusSummary,
  mappingProvenanceSummary,
  readinessDisplayItems,
} from "../../lib/revenue-margin/dataQuality.js";
import { detectSourceCards } from "../../lib/revenue-margin/onboarding.js";
import { dataQualityItems } from "../../lib/revenue-margin/explorers.js";

function StatusPill({ tone, label }) {
  const healthy = tone === "healthy";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
        healthy ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
      }`}
    >
      {healthy ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function CheckList({ items, emptyMessage }) {
  if (!items?.length) {
    return <p className="text-[13px] text-emerald-700">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={`${item.label}-${item.detail}`} className="flex items-start gap-2 text-[13px] text-slate-600">
          {item.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          )}
          <div className="min-w-0">
            <p>{item.label}</p>
            {item.detail && (
              <details className="mt-1 text-[11px] text-slate-400">
                <summary className="cursor-pointer">Technical detail</summary>
                <p className="mt-1 break-words">{item.detail}</p>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Post-onboarding home for setup provenance + validation.
 * Inspection only — no mapping edits or fabricated scores.
 */
export default function DataQualityWorkspace({ result, dataset }) {
  const status = dataQualityStatusSummary({ result, dataset });
  const sources = detectSourceCards(dataset);
  const mapping = mappingProvenanceSummary(dataset?.mappings || []);
  const readinessItems = readinessDisplayItems(dataset?.readiness || {});
  const analysisItems = analysisDataQualityItems(result);
  const dq = dataQualityItems(result);
  const validationItems = [...readinessItems, ...analysisItems].filter(
    (item, index, list) => list.findIndex((other) => other.label === item.label && other.detail === item.detail) === index,
  );

  return (
    <div className="space-y-5" data-testid="data-quality-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Data Quality
          </h3>
          <p className="mt-1 text-[13px] text-slate-600">
            How WYZ understood your business data for this analysis.
          </p>
        </div>
        <StatusPill tone={status.tone} label={status.label} />
      </div>

      <section className="rounded-xl border border-gray-100 bg-[#f8fafc] p-4">
        <h4 className="text-[12px] font-semibold text-[#1a3673]">Data sources</h4>
        {sources.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-500">
            Source file details are unavailable for this dataset in the current session.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {sources.map((card) => (
              <li key={card.key} className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1a3673]">{card.title}</p>
                    {card.filename ? (
                      <p className="truncate text-[11px] text-slate-500">{card.filename}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">
                      {card.rowCount != null
                        ? `${Number(card.rowCount).toLocaleString("en-IN")} rows`
                        : "Rows unavailable"}
                      {card.dateMin ? ` · ${card.dateMin} → ${card.dateMax || card.dateMin}` : ""}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 p-4">
        <h4 className="text-[12px] font-semibold text-[#1a3673]">Data mappings</h4>
        {mapping.total === 0 ? (
          <p className="mt-2 text-[12px] text-slate-500">Mapping details are not available in this session.</p>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] text-slate-600">
              {mapping.autoAccepted} auto-accepted
              {mapping.userConfirmed > 0 ? ` · ${mapping.userConfirmed} confirmed` : ""}
              {mapping.needingAttention > 0
                ? ` · ${mapping.needingAttention} still needing attention`
                : ""}
              {" · "}
              {mapping.total} total
            </p>
            <details className="rounded-lg border border-gray-100 bg-[#f8fafc] px-3 py-2">
              <summary className="cursor-pointer text-[12px] font-medium text-[#1a3673]">
                View mapping details
              </summary>
              <div className="mt-2 max-h-56 overflow-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Source field</th>
                      <th className="py-1 pr-2">WYZ field</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.allRows.slice(0, 80).map((row) => (
                      <tr key={`${row.source_file}:${row.source_column}`} className="border-t border-gray-100 text-slate-600">
                        <td className="py-1 pr-2">
                          <span className="font-medium text-slate-700">{row.source_column}</span>
                          <span className="block text-[10px] text-slate-400">{row.source_file}</span>
                        </td>
                        <td className="py-1 pr-2">{row.canonical_field || "—"}</td>
                        <td className="py-1">{row.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mapping.allRows.length > 80 ? (
                  <p className="mt-2 text-[11px] text-slate-400">Showing first 80 mappings.</p>
                ) : null}
              </div>
            </details>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 p-4">
        <h4 className="text-[12px] font-semibold text-[#1a3673]">Validation & join coverage</h4>
        <div className="mt-3">
          <CheckList
            items={validationItems}
            emptyMessage="No data-quality issues reported for this analysis."
          />
        </div>
        {dq.gaps?.length > 0 && (
          <p className="mt-3 text-[12px] text-slate-500">Known analytics gaps: {dq.gaps.join(", ")}</p>
        )}
      </section>

      <details className="rounded-xl border border-gray-100 bg-[#f8fafc] px-4 py-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#1a3673]">
          Technical details
        </summary>
        <dl className="mt-3 grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Engine</dt>
            <dd className="mt-0.5 tabular-nums">{result?.engine_version || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Mapping</dt>
            <dd className="mt-0.5 tabular-nums">{result?.mapping_version || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Dataset version</dt>
            <dd className="mt-0.5 tabular-nums">
              {result?.dataset_version != null
                ? `v${result.dataset_version}`
                : dataset?.dataset_version != null
                  ? `v${dataset.dataset_version}`
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Dataset</dt>
            <dd className="mt-0.5 break-all text-[11px]">{dataset?.dataset_id || result?.dataset_id || "—"}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
