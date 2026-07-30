import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Info, Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import { SimulatorCharts } from "../components/runway-simulator/SimulatorCharts.jsx";
import { CustomizedReportCta } from "../components/runway-simulator/CustomizedReportCta.jsx";
import { WhatIfPanel } from "../components/runway-simulator/WhatIfPanel.jsx";
import {
  FORECAST_MONTHS,
  INDUSTRY_OPTIONS,
  BUSINESS_MODEL_OPTIONS,
  STAGE_OPTIONS,
  buildFallbackInsight,
  forecastMonthOptions,
  formatHorizonCash,
  formatInr,
  formatMonths,
  formatPercent,
  getDefaultInputs,
  monthFullLabelFromStart,
  parseInrInput,
  percentDisplayValue,
  runSimulation,
} from "../lib/financial-simulator/index.js";

const STEPS = [
  { id: "context", label: "Business context" },
  { id: "position", label: "Starting financial position" },
  { id: "revenue", label: "Revenue & margins" },
  { id: "opex", label: "Operating expenses" },
  { id: "capital", label: "Capital & cash events" },
  { id: "review", label: "Review & calculate" },
];

const INTRO_BENEFITS = [
  "Built for startup financial planning",
  "24-month deterministic projection",
  "Personalized WYZ assessment",
];

const GROSS_BURN_HELP =
  "Total monthly operating cash outflow before revenue, excluding CapEx and funding.";
const NET_BURN_HELP =
  "Monthly operating cash outflow after revenue, excluding CapEx and funding.";

const emptyEvent = () => ({ monthIndex: 6, amount: "" });

const cardShellCls =
  "relative z-[1] mx-auto mt-8 max-w-[980px] rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white px-5 py-7 shadow-[0_4px_6px_rgba(26,54,115,0.04),0_24px_48px_rgba(26,54,115,0.1),0_0_0_1px_rgba(255,255,255,0.8)_inset] sm:mt-10 sm:px-8 sm:py-9 md:rounded-[1.35rem] md:px-10 md:py-10 md:shadow-[0_8px_12px_rgba(26,54,115,0.05),0_32px_64px_rgba(26,54,115,0.12)]";

/** Reusable: scroll element below sticky navbar with 24px breathing room. */
function scrollToElementWithNavbarOffset(element) {
  if (!element) return;
  const navbar = document.querySelector("[data-site-navbar]");
  const navbarHeight = navbar?.getBoundingClientRect().height ?? 0;
  const offset = navbarHeight + 24;
  element.style.scrollMarginTop = `${offset}px`;
  const targetTop = element.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

export default function RunwaySimulatorPage() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("form"); // form | calculating | results
  const [inputs, setInputs] = useState(() => ({
    ...getDefaultInputs(),
    capexEvents: [{ monthIndex: 6, amount: "" }],
    equityEvents: [{ monthIndex: 4, amount: "" }],
    debtEvents: [{ monthIndex: 8, amount: "" }],
  }));
  const [errors, setErrors] = useState([]);
  const [result, setResult] = useState(null);
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const formRef = useRef(null);
  const [scrollTick, setScrollTick] = useState(0);

  const setField = (key, value) => setInputs((prev) => ({ ...prev, [key]: value }));

  const setEvent = (key, patch) => {
    setInputs((prev) => ({
      ...prev,
      [key]: [{ ...(prev[key]?.[0] || emptyEvent()), ...patch }],
    }));
  };

  const requestFormScroll = () => setScrollTick((t) => t + 1);

  const goToStep = (next) => {
    if (next > step && step === 0) {
      const contactErrors = [];
      const email = String(inputs.email || "").trim();
      if (!email) contactErrors.push("Email ID is required.");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) contactErrors.push("Enter a valid Email ID.");
      const phoneDigits = String(inputs.phone || "").replace(/\D/g, "");
      if (!String(inputs.phone || "").trim()) contactErrors.push("Phone is required.");
      else if (phoneDigits.length < 10) contactErrors.push("Enter a valid phone number.");
      if (contactErrors.length) {
        setErrors(contactErrors);
        return;
      }
    }
    setErrors([]);
    setStep(next);
    requestFormScroll();
  };

  useLayoutEffect(() => {
    if (phase !== "form" || !started) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) scrollToElementWithNavbarOffset(formRef.current);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [started, step, phase, scrollTick]);

  const normalizeForCalc = (raw) => {
    const toNum = (v) => (v === "" || v == null ? 0 : Number(v));
    const cleanEvents = (arr) =>
      (arr || [])
        .map((e) => ({ monthIndex: Number(e.monthIndex), amount: toNum(e.amount) }))
        .filter((e) => e.amount > 0 && e.monthIndex >= 1 && e.monthIndex <= FORECAST_MONTHS);

    return {
      ...raw,
      currentCashBalance: toNum(raw.currentCashBalance),
      currentMonthlyRevenue: toNum(raw.currentMonthlyRevenue),
      monthlyRevenueGrowth: toNum(raw.monthlyRevenueGrowth),
      currentVolume: toNum(raw.currentVolume),
      monthlyVolumeGrowth: toNum(raw.monthlyVolumeGrowth),
      averageOrderValue: toNum(raw.averageOrderValue),
      monthlyAovGrowth: toNum(raw.monthlyAovGrowth),
      cogsPercent: toNum(raw.cogsPercent),
      otherDirectCostsPercent: toNum(raw.otherDirectCostsPercent),
      salesMarketingPercent: toNum(raw.salesMarketingPercent),
      productTechPercent: toNum(raw.productTechPercent),
      monthlyPayroll: toNum(raw.monthlyPayroll),
      payrollGrowth: toNum(raw.payrollGrowth),
      otherFixedCosts: toNum(raw.otherFixedCosts),
      otherFixedGrowth: toNum(raw.otherFixedGrowth),
      capexEvents: cleanEvents(raw.capexEvents),
      equityEvents: cleanEvents(raw.equityEvents),
      debtEvents: cleanEvents(raw.debtEvents),
    };
  };

  const startAssessment = () => {
    setStarted(true);
    setPhase("form");
    setStep(0);
    requestFormScroll();
  };

  const runCalc = async () => {
    const normalized = normalizeForCalc(inputs);
    const sim = runSimulation(normalized);
    if (!sim.ok) {
      setErrors(sim.errors);
      return;
    }
    setErrors([]);
    setResult(sim);
    setInsight(null);
    setInsightLoading(true);
    setPhase("calculating");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const payload = {
      businessContext: {
        companyName: normalized.companyName || undefined,
        industry: normalized.industry,
        businessModel: normalized.businessModel,
        startupStage: normalized.startupStage,
        mainPriority: normalized.mainPriority,
      },
      metrics: {
        runwayMonths: sim.kpis.runwayMonths,
        cashOutMonth: sim.kpis.cashOutMonthLabel,
        monthlyNetBurn: Math.round(sim.kpis.avgMonthlyNetBurn),
        monthlyGrossBurn: Math.round(sim.kpis.avgMonthlyGrossBurn),
        grossMarginPercent: Math.round(sim.kpis.avgGrossMargin * 1000) / 10,
        monthlyRevenueGrowthPercent:
          normalized.revenueMode === "simple"
            ? Math.round(normalized.monthlyRevenueGrowth * 1000) / 10
            : Math.round(normalized.monthlyVolumeGrowth * 1000) / 10,
        ebitda: Math.round(sim.kpis.month1Ebitda),
        sixMonthClosingCash: sim.kpis.sixMonthClosingCash,
        twelveMonthClosingCash: sim.kpis.twelveMonthClosingCash,
        healthStatus: sim.kpis.healthStatus,
      },
      costMix: {
        payrollPercentOfExpenses: Math.round(sim.kpis.costMix.payrollPercentOfExpenses * 100),
        marketingPercentOfExpenses: Math.round(sim.kpis.costMix.marketingPercentOfExpenses * 100),
        technologyPercentOfExpenses: Math.round(sim.kpis.costMix.technologyPercentOfExpenses * 100),
      },
    };

    const minDelay = new Promise((resolve) => setTimeout(resolve, 900));

    try {
      const [, insightResult] = await Promise.all([
        minDelay,
        (async () => {
          try {
            const res = await fetch("/api/runway-insight", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("insight_failed");
            return await res.json();
          } catch {
            return buildFallbackInsight(payload);
          }
        })(),
      ]);
      setInsight(insightResult);
    } finally {
      setInsightLoading(false);
      setPhase("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const restart = () => {
    setStarted(true);
    setPhase("form");
    setStep(0);
    setResult(null);
    setInsight(null);
    setErrors([]);
    requestFormScroll();
  };

  const statusTone = useMemo(() => {
    const s = result?.kpis?.healthStatus;
    if (s === "Critical") return "border-red-200 bg-red-50 text-[#b91c1c]";
    if (s === "Attention required") return "border-[rgba(252,125,37,0.25)] bg-[rgba(252,125,37,0.08)] text-[#c55a12]";
    if (s === "Stable") return "border-[rgba(26,54,115,0.14)] bg-[#f4f8ff] text-[#1a3673]";
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }, [result]);

  const runwayExplain = useMemo(() => {
    if (!result) return "";
    const { runwayMonths, cashOutMonthLabel, cashOutMonthIndex } = result.kpis;
    if (cashOutMonthIndex == null) {
      return `At your current burn rate, cash lasts beyond the 24-month forecast (${formatMonths(runwayMonths)} estimated).`;
    }
    return `Based on your assumptions, cash is projected to run out around ${cashOutMonthLabel} (${formatMonths(runwayMonths)} of runway).`;
  }, [result]);

  const eventLine = (ev) => {
    const amount = ev?.amount;
    if (amount === "" || amount == null || Number(amount) <= 0) return "None";
    const month =
      ev?.monthIndex >= 1
        ? monthFullLabelFromStart(inputs.forecastStartMonth, Number(ev.monthIndex))
        : "—";
    return `${formatInr(Number(amount))} · ${month}`;
  };

  return (
    <div className="relative min-h-screen bg-white font-sans text-[#1a3673] selection:bg-[#fc7c23] selection:text-white">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.32]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(26,54,115,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,54,115,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
        }}
        aria-hidden
      />

      <Navbar />

      <main className="relative z-10 px-4 pb-24 pt-[calc(9.5rem+env(safe-area-inset-top,0px))] sm:px-6 md:pb-28 md:pt-[calc(10rem+env(safe-area-inset-top,0px))]">
        <div className="mx-auto max-w-[1050px]">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-[#1a3673]"
          >
            <ArrowLeft size={16} /> Back to home
          </Link>

          {/* Hero only before assessment starts — prevents clipping behind sticky navbar */}
          {phase === "form" && !started && (
            <header className="mx-auto mt-10 max-w-3xl text-center md:mt-14">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1a3673]/14 bg-[#1a3673]/[0.03] px-4 py-1.5 text-xs font-semibold tracking-wide text-[#1a3673] shadow-[0_6px_20px_rgba(26,54,115,0.07)] sm:mb-7">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#fc7c23] shadow-[0_0_10px_rgba(252,124,35,0.75)]"
                  aria-hidden
                />
                WYZ Cashflow Assessment Tool
              </div>
              <h1 className="text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-slate-800 sm:text-4xl md:text-5xl">
                Understand Your Runway —
                <br className="hidden sm:block" />{" "}
                <span className="text-[#fc7d25]">Plan With More Clarity</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-slate-500 md:mt-6 md:text-lg">
                Enter a few business assumptions to generate a 24-month cash-flow projection, runway estimate, and
                personalized financial assessment.
              </p>
              <p className="mx-auto mt-3 max-w-xl text-[12px] leading-relaxed text-slate-400 md:text-[13px]">
                Simplified planning tool. Not audited financial, tax, or investment advice.
              </p>
            </header>
          )}

          {phase === "form" && !started && (
            <section className={`${cardShellCls} max-w-[560px] text-center`}>
              <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(252,125,37,0.25)] bg-[rgba(252,125,37,0.08)]">
                <span className="h-2 w-2 rounded-full bg-[#fc7d25]" aria-hidden />
              </div>
              <h2 className="text-balance text-xl font-semibold tracking-tight text-[#1a3673] sm:text-2xl md:text-[1.65rem] md:leading-snug">
                Estimate your startup runway in under 3 minutes
              </h2>
              <ul className="mx-auto mt-6 max-w-sm space-y-3 text-left">
                {INTRO_BENEFITS.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-snug text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1a3673]/[0.06] text-[#fc7d25]">
                      <Check size={12} strokeWidth={2.5} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={startAssessment} className={`${primaryBtnCls} mt-8 w-full sm:w-auto`}>
                Start Assessment <ArrowRight size={16} />
              </button>
              <p className="mt-4 text-[13px] text-slate-400">No signup required to calculate your results.</p>
            </section>
          )}

          {phase === "form" && started && (
            <section ref={formRef} className={cardShellCls}>
              {/* Progress */}
              <nav aria-label="Form progress" className="mb-8">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#fc7d25]">
                  Step {step + 1} of {STEPS.length}
                </p>
                <p className="mt-1 text-[12px] font-medium text-slate-400">
                  {Math.round(((step + 1) / STEPS.length) * 100)}% complete
                </p>
                <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#1a3673] md:text-xl">
                  {STEPS[step].label}
                </p>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-[rgba(26,54,115,0.1)]">
                  <div
                    className="h-full rounded-full bg-[#fc7d25] transition-all duration-300"
                    style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  />
                </div>
              </nav>

              {errors.length > 0 && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <ul className="list-disc space-y-1 pl-4">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step === 0 && (
                <StepFrame subtitle="Used to personalize the AI assessment — not the math.">
                  <Field label="Company name">
                    <input
                      className={inputCls}
                      value={inputs.companyName}
                      onChange={(e) => setField("companyName", e.target.value)}
                      placeholder="Acme Pvt Ltd"
                    />
                  </Field>
                  <Field label="Industry">
                    <select className={inputCls} value={inputs.industry} onChange={(e) => setField("industry", e.target.value)}>
                      {INDUSTRY_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Business model">
                    <select
                      className={inputCls}
                      value={inputs.businessModel}
                      onChange={(e) => setField("businessModel", e.target.value)}
                    >
                      {BUSINESS_MODEL_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Startup stage">
                    <select
                      className={inputCls}
                      value={inputs.startupStage}
                      onChange={(e) => setField("startupStage", e.target.value)}
                    >
                      {STAGE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2 border-t border-[rgba(26,54,115,0.08)] pt-4">
                    <p className="text-[13px] font-semibold text-[#1a3673]">Contact info</p>
                  </div>
                  <Field label="Email ID">
                    <input
                      type="email"
                      className={inputCls}
                      value={inputs.email}
                      onChange={(e) => setField("email", e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      className={inputCls}
                      value={inputs.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                    />
                  </Field>
                </StepFrame>
              )}

              {step === 1 && (
                <StepFrame subtitle="Opening cash and forecast start.">
                  <Field label="Current cash balance">
                    <InrInput value={inputs.currentCashBalance} onChange={(v) => setField("currentCashBalance", v)} />
                  </Field>
                  <Field label="Forecast start month">
                    <input
                      type="month"
                      className={inputCls}
                      value={inputs.forecastStartMonth}
                      onChange={(e) => setField("forecastStartMonth", e.target.value)}
                    />
                  </Field>
                  <Field label="Currency">
                    <input className={inputCls} value={inputs.currency} disabled />
                  </Field>
                </StepFrame>
              )}

              {step === 2 && (
                <StepFrame subtitle="Simple mode by default. Switch to detailed for volume × AOV.">
                  <div className="md:col-span-2 mb-1 flex flex-wrap gap-2">
                    {["simple", "detailed"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setField("revenueMode", mode)}
                        className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize transition ${
                          inputs.revenueMode === mode
                            ? "border-[#1a3673] bg-[#1a3673] text-white"
                            : "border-[rgba(26,54,115,0.14)] bg-white text-[#1a3673] hover:border-[rgba(252,125,37,0.4)]"
                        }`}
                      >
                        {mode} mode
                      </button>
                    ))}
                  </div>
                  {inputs.revenueMode === "simple" ? (
                    <>
                      <Field label="Current monthly revenue">
                        <InrInput
                          value={inputs.currentMonthlyRevenue}
                          onChange={(v) => setField("currentMonthlyRevenue", v)}
                        />
                      </Field>
                      <Field label="Monthly revenue growth" hint="Enter 5 for 5%. Enter 0.2 for 0.2%.">
                        <PctInput
                          value={inputs.monthlyRevenueGrowth}
                          onChange={(v) => setField("monthlyRevenueGrowth", v)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Current monthly sales volume">
                        <input
                          type="number"
                          min="0"
                          className={inputCls}
                          value={inputs.currentVolume}
                          onChange={(e) => setField("currentVolume", e.target.value)}
                        />
                      </Field>
                      <Field label="Monthly volume growth" hint="Enter 5 for 5%. Enter 0.2 for 0.2%.">
                        <PctInput value={inputs.monthlyVolumeGrowth} onChange={(v) => setField("monthlyVolumeGrowth", v)} />
                      </Field>
                      <Field label="Average order / service value">
                        <InrInput value={inputs.averageOrderValue} onChange={(v) => setField("averageOrderValue", v)} />
                      </Field>
                      <Field label="Monthly AOV growth" hint="Enter 5 for 5%. Enter 0.2 for 0.2%.">
                        <PctInput value={inputs.monthlyAovGrowth} onChange={(v) => setField("monthlyAovGrowth", v)} />
                      </Field>
                    </>
                  )}
                  <Field label="COGS / cost of services (% of revenue)" hint="Enter 35 for 35% of revenue.">
                    <PctInput value={inputs.cogsPercent} onChange={(v) => setField("cogsPercent", v)} />
                  </Field>
                  <Field label="Other direct costs (% of revenue)" hint="Enter 5 for 5% of revenue.">
                    <PctInput
                      value={inputs.otherDirectCostsPercent}
                      onChange={(v) => setField("otherDirectCostsPercent", v)}
                    />
                  </Field>
                </StepFrame>
              )}

              {step === 3 && (
                <StepFrame subtitle="% of revenue for variable costs; ₹ / month for fixed costs.">
                  <Field label="Sales & marketing (% of revenue)" hint="Enter 40 for 40% of revenue.">
                    <PctInput
                      value={inputs.salesMarketingPercent}
                      onChange={(v) => setField("salesMarketingPercent", v)}
                    />
                  </Field>
                  <Field label="Product & technology (% of revenue)" hint="Enter 20 for 20% of revenue.">
                    <PctInput value={inputs.productTechPercent} onChange={(v) => setField("productTechPercent", v)} />
                  </Field>
                  <Field label="Monthly payroll">
                    <InrInput value={inputs.monthlyPayroll} onChange={(v) => setField("monthlyPayroll", v)} />
                  </Field>
                  <Field
                    label="Payroll monthly growth"
                    hint="Enter 0.2 for 0.2% month-over-month (not 20%)."
                  >
                    <PctInput value={inputs.payrollGrowth} onChange={(v) => setField("payrollGrowth", v)} />
                  </Field>
                  <Field label="Other fixed costs monthly">
                    <InrInput value={inputs.otherFixedCosts} onChange={(v) => setField("otherFixedCosts", v)} />
                  </Field>
                  <Field
                    label="Other fixed costs monthly growth"
                    hint="Enter 0.2 for 0.2% month-over-month (not 20%)."
                  >
                    <PctInput value={inputs.otherFixedGrowth} onChange={(v) => setField("otherFixedGrowth", v)} />
                  </Field>
                </StepFrame>
              )}

              {step === 4 && (
                <StepFrame subtitle="Optional. Choose the forecast month for each event. Leave amount blank to skip.">
                  <EventRow
                    label="Planned CapEx"
                    event={inputs.capexEvents[0]}
                    forecastStartMonth={inputs.forecastStartMonth}
                    onChange={(p) => setEvent("capexEvents", p)}
                  />
                  <EventRow
                    label="Expected equity funding"
                    event={inputs.equityEvents[0]}
                    forecastStartMonth={inputs.forecastStartMonth}
                    onChange={(p) => setEvent("equityEvents", p)}
                  />
                  <EventRow
                    label="Expected debt, grant or other funding"
                    event={inputs.debtEvents[0]}
                    forecastStartMonth={inputs.forecastStartMonth}
                    onChange={(p) => setEvent("debtEvents", p)}
                  />
                </StepFrame>
              )}

              {step === 5 && (
                <StepFrame subtitle="Confirm your assumptions, then generate the projection.">
                  <div className="md:col-span-2 space-y-3">
                    <ReviewBlock title="Business context" onEdit={() => goToStep(0)}>
                      <ReviewLine label="Company" value={inputs.companyName || "Unnamed company"} />
                      <ReviewLine
                        label="Profile"
                        value={`${inputs.industry} · ${inputs.businessModel || "—"}`}
                      />
                      <ReviewLine label="Stage" value={inputs.startupStage} />
                      <ReviewLine label="Email" value={inputs.email || "—"} />
                      <ReviewLine label="Phone" value={inputs.phone || "—"} />
                    </ReviewBlock>
                    <ReviewBlock title="Starting cash & forecast" onEdit={() => goToStep(1)}>
                      <ReviewLine label="Starting cash" value={formatInr(Number(inputs.currentCashBalance) || 0)} />
                      <ReviewLine
                        label="Forecast start"
                        value={monthFullLabelFromStart(inputs.forecastStartMonth, 1)}
                      />
                    </ReviewBlock>
                    <ReviewBlock title="Revenue & direct costs" onEdit={() => goToStep(2)}>
                      {inputs.revenueMode === "simple" ? (
                        <>
                          <ReviewLine
                            label="Revenue"
                            value={`${formatInr(Number(inputs.currentMonthlyRevenue) || 0)} / month`}
                          />
                          <ReviewLine
                            label="Growth"
                            value={`Growing ${formatPercent(Number(inputs.monthlyRevenueGrowth) || 0)} monthly`}
                          />
                        </>
                      ) : (
                        <>
                          <ReviewLine label="Volume" value={String(inputs.currentVolume || 0)} />
                          <ReviewLine
                            label="AOV"
                            value={formatInr(Number(inputs.averageOrderValue) || 0)}
                          />
                        </>
                      )}
                      <ReviewLine
                        label="Direct costs"
                        value={`COGS ${formatPercent(Number(inputs.cogsPercent) || 0)} · Other ${formatPercent(Number(inputs.otherDirectCostsPercent) || 0)}`}
                      />
                    </ReviewBlock>
                    <ReviewBlock title="Operating costs" onEdit={() => goToStep(3)}>
                      <ReviewLine
                        label="Variable opex"
                        value={`S&M ${formatPercent(Number(inputs.salesMarketingPercent) || 0)} · Tech ${formatPercent(Number(inputs.productTechPercent) || 0)}`}
                      />
                      <ReviewLine
                        label="Payroll"
                        value={`${formatInr(Number(inputs.monthlyPayroll) || 0)} · ${formatPercent(Number(inputs.payrollGrowth) || 0)} MoM`}
                      />
                      <ReviewLine
                        label="Other fixed"
                        value={`${formatInr(Number(inputs.otherFixedCosts) || 0)} · ${formatPercent(Number(inputs.otherFixedGrowth) || 0)} MoM`}
                      />
                    </ReviewBlock>
                    <ReviewBlock title="Capital events" onEdit={() => goToStep(4)}>
                      <ReviewLine label="CapEx" value={eventLine(inputs.capexEvents[0])} />
                      <ReviewLine label="Equity" value={eventLine(inputs.equityEvents[0])} />
                      <ReviewLine label="Debt / other" value={eventLine(inputs.debtEvents[0])} />
                    </ReviewBlock>
                  </div>
                  <div className="md:col-span-2 pt-2">
                    <button type="button" onClick={runCalc} className={`${primaryBtnCls} w-full sm:w-auto`}>
                      Calculate 24-month projection <ArrowRight size={16} />
                    </button>
                  </div>
                </StepFrame>
              )}

              <div className="mt-8 flex items-center justify-between gap-3 border-t border-[rgba(26,54,115,0.08)] pt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (step === 0) {
                      setStarted(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return;
                    }
                    goToStep(Math.max(0, step - 1));
                  }}
                  className="text-sm font-semibold text-slate-500 transition hover:text-[#1a3673]"
                >
                  ← Back
                </button>
                {step < STEPS.length - 1 && (
                  <button
                    type="button"
                    onClick={() => goToStep(Math.min(STEPS.length - 1, step + 1))}
                    className={primaryBtnCls}
                  >
                    Continue <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </section>
          )}

          {phase === "calculating" && (
            <section className={`${cardShellCls} max-w-[560px] text-center`} aria-live="polite" aria-busy="true">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(26,54,115,0.12)] bg-[#f8fafc]">
                <Loader2 className="animate-spin text-[#fc7d25]" size={22} aria-hidden />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-[#1a3673]">Building your projection</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                Calculating your 24-month cash flow, runway, and preparing a personalized WYZ assessment.
              </p>
              <div className="mx-auto mt-6 h-1 max-w-[220px] overflow-hidden rounded-full bg-[rgba(26,54,115,0.1)]">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-[#fc7d25]" />
              </div>
            </section>
          )}

          {phase === "results" && result && (
            <div className="mt-10 space-y-6 md:mt-12 md:space-y-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#fc7d25]">Results</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1a3673] md:text-[1.85rem]">
                    Your free projection
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">Based on the assumptions you provided</p>
                </div>
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(26,54,115,0.14)] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a3673] shadow-[0_2px_8px_rgba(26,54,115,0.06)] transition hover:border-[rgba(252,125,37,0.4)] hover:bg-[rgba(252,125,37,0.05)]"
                >
                  <RefreshCw size={14} /> Edit inputs
                </button>
              </div>

              <section className="rounded-2xl border border-[rgba(252,125,37,0.35)] bg-white px-6 py-6 shadow-[0_8px_32px_rgba(26,54,115,0.08)] ring-1 ring-[rgba(252,125,37,0.12)] md:rounded-[1.35rem] md:px-8 md:py-7">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#fc7d25]">
                  Your estimated runway
                </p>
                <p className="mt-2 text-5xl font-semibold tracking-tight text-[#1a3673] md:text-6xl">
                  {result.kpis.runwayMonths == null
                    ? "—"
                    : Number(result.kpis.runwayMonths).toFixed(1)}
                </p>
                <p className="mt-1 text-base font-medium text-slate-500">months of runway</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className={"inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold " + statusTone}>
                    {result.kpis.healthStatus}
                  </span>
                  <span className="text-sm text-slate-600">
                    Expected cash-out:{" "}
                    <span className="font-semibold text-[#1a3673]">{result.kpis.cashOutMonthLabel}</span>
                  </span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-500">{runwayExplain}</p>
              </section>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Metric
                    label="Avg monthly net burn"
                    value={formatInr(result.kpis.avgMonthlyNetBurn)}
                    help={NET_BURN_HELP}
                    primary
                  />
                  <Metric label="Expected cash-out" value={result.kpis.cashOutMonthLabel} primary />
                  <Metric
                    label="Cash after 6 months"
                    value={formatHorizonCash(
                      result.kpis.sixMonthClosingCash,
                      6,
                      result.kpis.cashOutMonthIndex,
                    )}
                    primary
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric
                    label="Avg monthly gross burn"
                    value={formatInr(result.kpis.avgMonthlyGrossBurn)}
                    help={GROSS_BURN_HELP}
                  />
                  <Metric label="Gross margin (avg)" value={formatPercent(result.kpis.avgGrossMargin)} />
                  <Metric label="EBITDA (month 1)" value={formatInr(result.kpis.month1Ebitda)} />
                  <Metric
                    label="Cash after 12 months"
                    value={formatHorizonCash(
                      result.kpis.twelveMonthClosingCash,
                      12,
                      result.kpis.cashOutMonthIndex,
                    )}
                  />
                </div>
              </div>

              <SimulatorCharts months={result.months} />

              <WhatIfPanel baseInputs={result.inputs} baseResult={result} />

              <section className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-5 shadow-[0_8px_32px_rgba(26,54,115,0.07)] md:rounded-[1.35rem] md:p-7">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(252,125,37,0.1)] text-[#fc7d25]">
                    <Sparkles size={16} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-[#1a3673]">WYZ Financial Assessment</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Personalized interpretation of your 24-month projection.
                    </p>
                  </div>
                </div>
                {insightLoading && <p className="mt-4 text-sm text-slate-500">Generating assessment…</p>}
                {!insightLoading && insight && (
                  <div className="mt-5 space-y-5">
                    <p className="text-[16px] leading-[1.7] text-slate-700 md:text-[17px]">
                      {insight.summary}
                    </p>
                    <div className="grid grid-cols-1 gap-5 border-t border-[rgba(26,54,115,0.08)] pt-5 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-[#1a3673]">Key risks</p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-slate-600">
                          {(insight.keyRisks || []).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#1a3673]">Recommended actions</p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-slate-600">
                          {(insight.recommendedActions || []).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {insight.priorityObservation && (
                      <p className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-4 py-3 text-[13px] leading-relaxed text-slate-700">
                        <span className="font-semibold text-[#1a3673]">Priority — </span>
                        {insight.priorityObservation}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <CustomizedReportCta
                priority={result.inputs.mainPriority}
                runwayMonths={result.kpis.runwayMonths}
                healthStatus={result.kpis.healthStatus}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-3.5 py-2.5 text-sm text-[#1a3673] placeholder:text-slate-400 outline-none transition focus:border-[#1a3673] focus:ring-2 focus:ring-[rgba(26,54,115,0.12)] disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-slate-400";

const inputClsAffixed =
  "w-full rounded-xl border-0 bg-transparent py-2.5 pr-3.5 text-sm text-[#1a3673] placeholder:text-slate-400 outline-none";

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#1a3673] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#122652]";

function AffixInput({ prefix, suffix, children, disabled = false }) {
  return (
    <div
      className={`flex items-center rounded-xl border border-[rgba(26,54,115,0.12)] bg-white focus-within:border-[#1a3673] focus-within:ring-2 focus-within:ring-[rgba(26,54,115,0.12)] ${
        disabled ? "bg-[#f8fafc]" : ""
      }`}
    >
      {prefix ? <span className="pl-3.5 text-sm text-slate-400">{prefix}</span> : null}
      {children}
      {suffix ? <span className="pr-3.5 text-sm text-slate-400">{suffix}</span> : null}
    </div>
  );
}

function InrInput({ value, onChange, placeholder = "0", disabled = false }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const blurredDisplay =
    value === "" || value == null || Number.isNaN(Number(value))
      ? ""
      : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <AffixInput prefix="₹" disabled={disabled}>
      <input
        inputMode="decimal"
        disabled={disabled}
        className={inputClsAffixed}
        value={focused ? draft : blurredDisplay}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setDraft(value === "" || value == null ? "" : String(value));
        }}
        onBlur={() => {
          setFocused(false);
          onChange(parseInrInput(draft));
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, "");
          setDraft(next);
          onChange(parseInrInput(next));
        }}
      />
    </AffixInput>
  );
}

function StepFrame({ subtitle, children }) {
  return (
    <div>
      {subtitle ? <p className="text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
      <div className={`${subtitle ? "mt-6" : ""} grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5`}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block text-left ${className}`}>
      <span className="text-[13px] font-medium text-[#1a3673]">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] text-slate-400">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function PctInput({ value, onChange }) {
  const display = percentDisplayValue(value);
  const interpreted =
    value === "" || value == null || Number.isNaN(Number(value)) ? null : formatPercent(Number(value), 2);

  return (
    <div>
      <AffixInput suffix="%">
        <input
          type="number"
          step="0.1"
          className={`${inputClsAffixed} pl-3.5`}
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange("");
              return;
            }
            onChange(Number(raw) / 100);
          }}
        />
      </AffixInput>
      {interpreted != null && (
        <p className="mt-1 text-[11px] text-slate-400">Interpreted as {interpreted}</p>
      )}
    </div>
  );
}

function EventRow({ label, event, onChange, forecastStartMonth }) {
  const hasAmount = event?.amount !== "" && event?.amount != null && Number(event.amount) > 0;
  const options = useMemo(() => forecastMonthOptions(forecastStartMonth), [forecastStartMonth]);

  return (
    <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[13px] font-semibold text-[#1a3673]">{label}</p>
      <Field label="Amount">
        <InrInput
          value={event?.amount ?? ""}
          placeholder="Leave blank to skip"
          onChange={(amount) => {
            if (amount === "" || amount == null || Number(amount) <= 0) {
              onChange({ amount: "", monthIndex: "" });
              return;
            }
            onChange({
              amount,
              monthIndex: Number(event?.monthIndex) >= 1 ? Number(event.monthIndex) : 6,
            });
          }}
        />
      </Field>
      <Field label="Expected month">
        <select
          className={inputCls}
          disabled={!hasAmount}
          value={hasAmount ? event?.monthIndex ?? 6 : ""}
          onChange={(e) => onChange({ monthIndex: Number(e.target.value) })}
        >
          {!hasAmount && <option value="">Enter an amount first</option>}
          {options.map((o) => (
            <option key={o.monthIndex} value={o.monthIndex}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }) {
  return (
    <div className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#1a3673]">{title}</p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#fc7d25] transition hover:text-[#e86f16]"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
      <div className="mt-2 space-y-2.5">{children}</div>
    </div>
  );
}

function ReviewLine({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm leading-snug text-slate-700">{value}</p>
    </div>
  );
}

function Metric({ label, value, highlight = false, help, primary = false }) {
  const [open, setOpen] = useState(false);
  const helpId = help ? `metric-help-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined;

  return (
    <div
      className={`rounded-2xl border bg-white shadow-[0_4px_24px_rgba(26,54,115,0.06)] ${
        primary ? "px-4 py-4 md:px-5 md:py-5" : "px-4 py-3.5"
      } ${
        highlight || primary
          ? "border-[rgba(26,54,115,0.16)]"
          : "border-[rgba(26,54,115,0.12)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium text-slate-500 ${primary ? "text-[12px]" : "text-[11px]"}`}>{label}</p>
        {help ? (
          <span className="relative shrink-0">
            <button
              type="button"
              className="rounded-full p-0.5 text-slate-400 transition hover:text-[#1a3673] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,54,115,0.25)]"
              aria-label={`About ${label}`}
              aria-expanded={open}
              aria-controls={helpId}
              onClick={() => setOpen((v) => !v)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            >
              <Info size={13} strokeWidth={2} />
            </button>
            {open && (
              <span
                id={helpId}
                role="tooltip"
                className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-[rgba(26,54,115,0.14)] bg-white px-3 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-[0_8px_24px_rgba(26,54,115,0.12)]"
              >
                {help}
              </span>
            )}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-1 font-semibold leading-snug text-[#1a3673] ${
          primary ? "text-base md:text-lg" : "text-[15px] md:text-base"
        } ${highlight ? "text-[#fc7d25]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

