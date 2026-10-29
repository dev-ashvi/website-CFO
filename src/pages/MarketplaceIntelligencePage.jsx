import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import AskWyzPanel from "../components/marketplace-intelligence/AskWyzPanel.jsx";
import FilterBar from "../components/marketplace-intelligence/FilterBar.jsx";
import SectionPanel from "../components/marketplace-intelligence/SectionPanel.jsx";
import SourcePanel from "../components/marketplace-intelligence/SourcePanel.jsx";
import {
  SECTIONS,
  attachSourceFile,
  buildInvestigationContext,
  createEmptyFilters,
  createMarketplaceSession,
  detachSourceFile,
  investigate,
  requestSampleDataset,
  runMarketplaceEngine,
  sessionSummary,
} from "../lib/marketplace-intelligence/index.js";

const LIMITATIONS =
  "Product profit needs actual product costs. Units and referral-fee splits are unavailable in this Amazon export. CSV Other credits are unexplained and are not treated as tax or fees.";

export default function MarketplaceIntelligencePage() {
  const [session, setSession] = useState(() => createMarketplaceSession());
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const [notice, setNotice] = useState("");
  const [response, setResponse] = useState(null);
  const [filters, setFilters] = useState(() => createEmptyFilters());
  const [engine, setEngine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);

  const summary = useMemo(() => sessionSummary(session), [session]);
  const ready = engine?.metrics?.status === "calculated";

  useEffect(() => {
    let cancelled = false;
    const hasCsv = Boolean(session.files.transactionsCsv?.bytes) || session.mode === "sample";
    if (!hasCsv) {
      setEngine(null);
      setSourcesCollapsed(false);
      return undefined;
    }
    setLoading(true);
    (async () => {
      try {
        const next = await runMarketplaceEngine(session, filters);
        if (cancelled) return;
        setEngine(next);
        if (next.metrics?.status === "calculated") setSourcesCollapsed(true);
        if (next.normalized?.status === "csv_rejected") {
          setNotice(next.normalized.issues?.[0]?.message || "CSV was rejected.");
          setSourcesCollapsed(false);
        }
      } catch (err) {
        if (!cancelled) setNotice(err?.message || "Could not analyse this session.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, filters]);

  const productOptions = useMemo(() => {
    const products = engine?.metrics?.sections?.product_performance?.products || [];
    return products.map((row) => row.productName);
  }, [engine]);

  const onPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = attachSourceFile(session, {
      name: file.name,
      byteLength: bytes.byteLength,
      mediaType: file.type,
      bytes,
    });
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setSession(result.session);
    setResponse(null);
    setFilters(createEmptyFilters());
    setNotice(result.classification.message);
  };

  const onClear = (slot) => {
    setSession((current) => detachSourceFile(current, slot));
    setResponse(null);
    setFilters(createEmptyFilters());
    setNotice("File removed from this session.");
    setSourcesCollapsed(false);
  };

  const onSample = () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    setSession(sample.session);
    setResponse(null);
    setFilters(createEmptyFilters());
    setNotice(sample.message);
  };

  const onAsk = (question, chartId = null) => {
    const context = buildInvestigationContext({
      sessionId: session.id,
      sectionId,
      dateRange: filters.dateRange,
      product: filters.products?.[0] || null,
      filters,
      chartId,
    });
    setResponse(investigate(question, context, engine?.metrics || null));
  };

  return (
    <div className="relative min-h-screen bg-white font-sans text-[#1a3673]">
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
      <main className="relative z-10 px-4 pb-20 pt-[calc(9.5rem+env(safe-area-inset-top,0px))] sm:px-6 md:pt-[calc(10rem+env(safe-area-inset-top,0px))]">
        <div className="mx-auto max-w-6xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-[#1a3673]"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>

          <header className={`mt-6 max-w-3xl ${ready ? "mt-4" : "mt-8"}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1a3673]/14 bg-white px-3 py-1 text-xs font-semibold text-[#1a3673] shadow-[0_6px_20px_rgba(26,54,115,0.06)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#fc7c23]" aria-hidden />
              WYZ Marketplace Intelligence
            </div>
            {ready ? (
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-[#1a3673] sm:text-2xl">
                  Marketplace analysis
                </h1>
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Shield size={12} aria-hidden />
                  Session-only · {summary.persistence}
                </p>
              </div>
            ) : (
              <>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-[#1a3673] sm:text-4xl">
                  Amazon seller economics, from the file you provide.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  Public page. No account required. Each analysis stays in this browser session.
                </p>
                <p className="mt-3 inline-flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <Shield size={14} className="mt-0.5 shrink-0" aria-hidden />
                  Session {summary.id}. Persistence: {summary.persistence}.
                </p>
              </>
            )}
          </header>

          <div className="mt-6">
            <SourcePanel
              files={summary.files}
              notice={notice}
              collapsed={sourcesCollapsed && ready}
              mode={summary.mode}
              onToggle={() => setSourcesCollapsed((value) => !value)}
              onPick={onPick}
              onClear={onClear}
              onSample={onSample}
            />
          </div>

          {loading ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Calculating from this session…
            </p>
          ) : null}

          {ready ? (
            <div className="mt-4">
              <FilterBar
                period={engine.metrics.period}
                products={productOptions}
                filters={filters}
                onChange={(next) => {
                  setFilters(next);
                  setResponse(null);
                }}
                reconciliationStatus={engine.reconciliation?.status}
                reconciliationLabel={engine.reconciliation?.statusLabel}
              />
            </div>
          ) : null}

          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {SECTIONS.map((section) => {
              const active = section.id === sectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setSectionId(section.id);
                    setResponse(null);
                  }}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                    active
                      ? "bg-[#1a3673] text-white"
                      : "border border-[rgba(26,54,115,0.14)] bg-white text-[#1a3673] hover:border-[#fc7d25]"
                  }`}
                  aria-pressed={active}
                >
                  {section.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <SectionPanel
              sectionId={sectionId}
              engine={engine}
              onInvestigate={(chartId, question) => onAsk(question, chartId)}
              limitations={ready ? LIMITATIONS : null}
            />
            <AskWyzPanel sectionId={sectionId} response={response} onAsk={(question) => onAsk(question)} />
          </div>
        </div>
      </main>
    </div>
  );
}
