import { useCallback, useMemo, useState } from "react";
import {
  askAiCfo,
  buildSuggestedPrompts,
} from "../../lib/financial-simulator/aiCfoEngine.js";
import { formatMoney, formatMonths } from "../../lib/financial-simulator/format.js";

/**
 * Interactive AI CFO workspace — structured deterministic analysis.
 * @param {{
 *   baseSim: { months: object[], kpis: object, inputs: object },
 *   currency?: string,
 *   onPreview?: (sim: object | null) => void,
 *   onApplyScenario?: (inputs: object) => void,
 * }} props
 */
export function AiCfoPanel({ baseSim, currency = baseSim?.inputs?.currency || "INR", onPreview, onApplyScenario }) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [clarifyInput, setClarifyInput] = useState("");
  const [selectedPathIdx, setSelectedPathIdx] = useState(null);

  const prompts = useMemo(() => buildSuggestedPrompts(baseSim), [baseSim]);
  const money = useCallback((v) => formatMoney(v, { currency }), [currency]);

  const runQuestion = useCallback(
    (q, options = {}) => {
      const trimmed = String(q || "").trim();
      if (!trimmed) return;
      const res = askAiCfo(trimmed, baseSim, { pendingAction: options.pendingAction ?? pendingAction });
      setResponse(res);
      setPendingAction(res.pendingAction || null);
      setSelectedPathIdx(null);
      if (res.scenarioSim) {
        onPreview?.(res.scenarioSim);
      } else if (res.type !== "clarify") {
        onPreview?.(null);
      }
    },
    [baseSim, pendingAction, onPreview],
  );

  const handleSubmit = (e) => {
    e?.preventDefault();
    runQuestion(question);
  };

  const handlePrompt = (label) => {
    setQuestion(label);
    runQuestion(label);
  };

  const handleClarifyOption = (opt) => {
    if (opt.id === "revenue") runQuestion("What if revenue growth increases by 5%?");
    else if (opt.id === "fixed") runQuestion("What if fixed costs are reduced by 10%?");
    else if (opt.id === "marketing") runQuestion("What if I increase marketing by 50%?");
    else if (opt.id === "capex") runQuestion("What if CapEx is delayed by 3 months?");
  };

  const handleClarifySubmit = () => {
    if (!clarifyInput.trim()) return;
    runQuestion(clarifyInput, { pendingAction });
    setClarifyInput("");
  };

  const handleApply = () => {
    const inputs = response?.scenarioInputs || response?.paths?.[selectedPathIdx ?? 0]?.scenarioInputs;
    if (inputs && onApplyScenario) {
      onApplyScenario(inputs);
      setResponse(null);
      setPendingAction(null);
      onPreview?.(null);
    }
  };

  const handleDiscard = () => {
    setResponse(null);
    setPendingAction(null);
    setSelectedPathIdx(null);
    onPreview?.(null);
  };

  const handleViewPath = (idx) => {
    const path = response?.paths?.[idx];
    if (path?.scenarioSim) {
      setSelectedPathIdx(idx);
      onPreview?.(path.scenarioSim);
    }
  };

  const activeScenario = response?.scenarioSim || response?.paths?.[selectedPathIdx ?? 0]?.scenarioSim;

  return (
    <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a3673]">AI CFO</p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
        Ask questions about your forecast, test decisions, or find out what needs to change to reach your goals.
      </p>

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask WYZ about your financial model…"
            className="min-w-0 flex-1 rounded-lg border border-[rgba(26,54,115,0.15)] bg-[#f8fafc] px-3 py-2.5 text-[13px] text-[#1a3673] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[#1a3673] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#152d5c]"
          >
            Ask →
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          e.g. What would it take to reach 12 months runway?
        </p>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => handlePrompt(prompt.label)}
            className="rounded-full border border-[rgba(26,54,115,0.15)] bg-[#f8fafc] px-3 py-1.5 text-[11px] font-medium text-[#1a3673] transition hover:border-[rgba(26,54,115,0.3)]"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      {response?.type === "clarify" ? (
        <div className="mt-4 rounded-lg border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#1a3673]">{response.clarify?.message}</p>
          {response.pendingAction?.awaiting === "costPerHead" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={clarifyInput}
                onChange={(e) => setClarifyInput(e.target.value)}
                placeholder="₹ per engineer/month"
                className="w-40 rounded-lg border border-[rgba(26,54,115,0.15)] px-3 py-2 text-[13px]"
              />
              <button
                type="button"
                onClick={handleClarifySubmit}
                className="rounded-lg bg-[#fc7d25] px-4 py-2 text-[12px] font-semibold text-white"
              >
                Continue
              </button>
            </div>
          ) : null}
          {response.clarify?.options?.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {response.clarify.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleClarifyOption(opt)}
                  className="rounded-lg border border-[rgba(26,54,115,0.2)] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a3673] hover:border-[#1a3673]"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {response && response.type !== "clarify" ? (
        <AiCfoResponseCard
          response={response}
          money={money}
          currency={currency}
          selectedPathIdx={selectedPathIdx}
          onSelectPath={handleViewPath}
          onApply={handleApply}
          onDiscard={handleDiscard}
          onFollowUp={(fu) => {
            setQuestion(fu);
            runQuestion(fu);
          }}
          hasScenario={!!activeScenario}
          baseSim={baseSim}
        />
      ) : null}
    </div>
  );
}

function AiCfoResponseCard({
  response,
  money,
  currency,
  selectedPathIdx,
  onSelectPath,
  onApply,
  onDiscard,
  onFollowUp,
  hasScenario,
  baseSim,
}) {
  const selectedPath = response.paths?.[selectedPathIdx ?? -1];
  const comparisonBase = response.base || (baseSim ? snapshotFromSim(baseSim) : null);
  const comparisonScenario =
    response.scenario ||
    (selectedPath?.scenarioSim ? snapshotFromSim(selectedPath.scenarioSim) : null);
  const showComparison = comparisonBase && comparisonScenario;

  return (
    <div className="mt-4 rounded-xl border border-[rgba(26,54,115,0.12)] bg-[#f8fafc] px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fc7d25]">AI CFO analysis</p>
      {response.question ? (
        <p className="mt-1 text-[14px] font-semibold text-[#1a3673]">{response.question}</p>
      ) : null}
      {response.title ? (
        <p className="mt-0.5 text-[13px] font-medium text-slate-600">{response.title}</p>
      ) : null}

      {response.type === "explanation" && response.bullets?.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {response.bullets.map((b) => (
            <div key={b.label} className="rounded-lg border border-[rgba(26,54,115,0.08)] bg-white px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{b.label}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#1a3673]">{b.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {response.type === "find_path" && response.paths?.length > 0 ? (
        <div className="mt-3 space-y-2">
          {response.paths.map((path, idx) => (
            <button
              key={path.rank}
              type="button"
              onClick={() => onSelectPath(idx)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                selectedPathIdx === idx
                  ? "border-[#1a3673] bg-white ring-1 ring-[#1a3673]"
                  : "border-[rgba(26,54,115,0.1)] bg-white hover:border-[rgba(26,54,115,0.25)]"
              }`}
            >
              <p className="text-[13px] font-semibold text-[#1a3673]">
                {path.rank}. {path.title}
              </p>
              <p className="mt-0.5 text-[12px] text-slate-600">
                Projected runway: {formatMonths(path.runway)} · Difficulty: {path.difficulty}
              </p>
              {path.detail ? <p className="mt-0.5 text-[11px] text-slate-500">{path.detail}</p> : null}
            </button>
          ))}
          {response.observation ? (
            <div className="mt-2 rounded-lg border border-[rgba(252,125,37,0.2)] bg-[rgba(252,125,37,0.06)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#c2410c]">WYZ recommendation</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{response.observation}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {showComparison ? (
        <ComparisonTable base={comparisonBase} scenario={comparisonScenario} money={money} />
      ) : null}

      {response.runwayImpact != null && response.runwayImpact !== 0 ? (
        <div className="mt-3 rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(240,253,244,0.5)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#15803d]">Runway impact</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#15803d]">
            {response.runwayImpact > 0 ? "+" : ""}
            {formatMonths(response.runwayImpact)}
          </p>
        </div>
      ) : null}

      {response.assumptionChanges?.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Simulation assumptions</p>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-[rgba(26,54,115,0.08)] text-slate-400">
                  <th className="py-1.5 pr-3 font-semibold">Assumption</th>
                  <th className="py-1.5 pr-3 font-semibold">Base</th>
                  <th className="py-1.5 font-semibold">Scenario</th>
                </tr>
              </thead>
              <tbody>
                {response.assumptionChanges.map((row) => (
                  <tr key={row.label} className="border-b border-[rgba(26,54,115,0.05)]">
                    <td className="py-1.5 pr-3 text-slate-600">{row.label}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[#1a3673]">{row.base}</td>
                    <td className="py-1.5 tabular-nums font-medium text-[#fc7d25]">{row.scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {response.observation && response.type !== "find_path" ? (
        <div className="mt-3 rounded-lg border border-[rgba(26,54,115,0.08)] bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#fc7d25]">WYZ observation</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{response.observation}</p>
        </div>
      ) : null}

      {response.followUps?.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {response.followUps.map((fu) => (
            <button
              key={fu}
              type="button"
              onClick={() => onFollowUp?.(fu)}
              className="rounded-full border border-[rgba(26,54,115,0.12)] bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-[#1a3673]"
            >
              {fu}
            </button>
          ))}
        </div>
      ) : null}

      {hasScenario ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-[#1a3673] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#152d5c]"
          >
            Apply scenario
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg border border-[rgba(26,54,115,0.2)] bg-white px-4 py-2 text-[12px] font-semibold text-[#1a3673] hover:border-[#1a3673]"
          >
            Discard
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ComparisonTable({ base, scenario, money }) {
  const rows = [
    { label: "Runway", base: formatMonths(base.runwayMonths), scenario: formatMonths(scenario.runwayMonths) },
    { label: "Monthly net burn", base: money(base.monthlyNetBurn), scenario: money(scenario.monthlyNetBurn) },
    { label: "EBITDA", base: money(base.ebitda), scenario: money(scenario.ebitda) },
    { label: "Cash-out", base: base.cashOutMonth || "—", scenario: scenario.cashOutMonth || "—" },
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-[rgba(26,54,115,0.1)]">
            <th className="py-1.5 pr-3 font-semibold text-slate-400" />
            <th className="py-1.5 pr-3 font-semibold text-[#1a3673]">Current</th>
            <th className="py-1.5 font-semibold text-[#fc7d25]">Simulated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[rgba(26,54,115,0.05)]">
              <td className="py-1.5 pr-3 font-medium text-slate-600">{row.label}</td>
              <td className="py-1.5 pr-3 tabular-nums text-[#1a3673]">{row.base}</td>
              <td className="py-1.5 tabular-nums font-semibold text-[#fc7d25]">{row.scenario}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function snapshotFromSim(sim) {
  const m1 = sim.months?.[0] || {};
  const kpis = sim.kpis || {};
  return {
    runwayMonths: kpis.runwayMonths,
    cashOutMonth: kpis.cashOutMonthLabel,
    monthlyNetBurn: kpis.burnMetrics?.monthlyNetBurnExcludingCapex ?? m1.netBurn,
    ebitda: m1.ebitda,
    openingCash: m1.openingCash ?? sim.inputs?.currentCashBalance,
  };
}
