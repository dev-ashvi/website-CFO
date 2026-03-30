import Background from "../components/Background.jsx";
import Navbar from "../components/Navbar.jsx";
import HeroSection from "../components/HeroSection.jsx";
import WyzAiChatSection from "../components/WyzAiChatSection.jsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DecorativeGlow, SectionHeading } from "../components/reference-ui.jsx";
import {
  Activity,
  Bot,
  Braces,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileClock,
  FileText,
  Inbox,
  Landmark,
  Layers,
  LayoutGrid,
  LineChart,
  Link2,
  Mail,
  FileSpreadsheet,
  GitBranch,
  MessageSquare,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const financeFrictionCards = [
  {
    title: "Data Silos",
    description:
      "Financial data is spread across accounting tools, CRM systems, banking feeds, and spreadsheets — rarely unified in one place.",
    Icon: LayoutGrid,
    hint: "silos",
  },
  {
    title: "Stale Reports",
    description: "By the time reports are manually prepared, the numbers are already out of date.",
    Icon: FileClock,
    hint: "stale",
  },
  {
    title: "Black-Box Models",
    description:
      "Critical assumptions live inside analyst-built spreadsheets, making outputs hard to verify and trust.",
    Icon: Braces,
    hint: "blackbox",
  },
  {
    title: "Analyst Bottleneck",
    description: "Every strategic financial question depends on manual analysis, slowing down leadership decisions.",
    Icon: Inbox,
    hint: "queue",
  },
];

const wyzSourceItems = [
  { label: "Accounting (Tally, QuickBooks, Xero)", Icon: Layers },
  { label: "CRM & Sales (Salesforce, HubSpot)", Icon: Users },
  { label: "Excel & Spreadsheets", Icon: FileSpreadsheet },
  { label: "Banking & Payment Feeds", Icon: Landmark },
];

const wyzCoreCapabilities = [
  { title: "Smart Integration", Icon: Link2 },
  { title: "Insight Engine", Icon: Sparkles },
  { title: "CFO-Grade Outputs", Icon: ShieldCheck },
];

const wyzOutputGroups = [
  {
    title: "Core Financial Analysis",
    description:
      "Understand performance across metrics with structured financial reporting and variance tracking.",
    bullets: ["Trend & variance analysis", "FP&A & management reporting", "3-statement model"],
  },
  {
    title: "Forecasting",
    description:
      "Project future financial performance with dynamic forecasts and scenario-based planning.",
    bullets: ["Cash flow & runway visibility", "Revenue & expense projections", "Scenario planning"],
  },
  {
    title: "Predictive Insights",
    description: "Identify key drivers and risks early with explainable, model-based insights.",
    bullets: ["Driver-based root cause analysis", "Risk signals", "What-if with explainability"],
  },
  {
    title: "Data-Driven Decisions",
    description: "Translate insights into clear, actionable decisions across growth, hiring, and capital allocation.",
    bullets: ["Growth vs spend trade-offs", "Capital allocation & hiring decisions", "Investor / board reporting"],
  },
];

const modelingItems = [
  {
    title: "Cash Flow Forecasting",
    description: "Rolling 12/24-mo cash with live triggers, burn alerts, and forward visibility.",
  },
  {
    title: "Runway Management",
    description: "Live burn with hiring, spend, and revenue scenarios modeled in one pass.",
  },
  {
    title: "3-Statement Model",
    description: "Connected P&L, balance sheet, and cash flow with fully linked schedules.",
  },
  {
    title: "Scenario Planning",
    description: "Base, bull, and bear cases with transparent drivers and instant recalc.",
  },
  {
    title: "Board & Investor Reporting",
    description: "Investor-ready outputs with structured narratives and automated insights.",
  },
];

const modelingModuleIcons = [LineChart, Activity, Layers, GitBranch, FileText];

const featureBlocks = [
  {
    title: "AI CFO Chat",
    desc: "Ask complex financial questions in plain English and get instant answers grounded in your data.",
    col: "lg:col-span-2",
    icon: <MessageSquare size={20} />,
  },
  {
    title: "Smart MIS Engine",
    desc: "Transform raw numbers into structured reports automatically.",
    col: "lg:col-span-1",
    icon: <FileText size={20} />,
  },
  {
    title: "Real-Time Dashboards",
    desc: "See your business health update as your raw data flows in.",
    col: "lg:col-span-1",
    icon: <LineChart size={20} />,
  },
  {
    title: "Client-Specific AI Agents",
    desc: "Each startup gets a customized agent tuned to historical data, stage, and business model.",
    col: "lg:col-span-2",
    icon: <Bot size={20} />,
  },
  {
    title: "Forecasting Intelligence",
    desc: "Project cash, burn, and runway months ahead with defensible assumptions.",
    col: "lg:col-span-2",
    icon: <TrendingUp size={20} />,
  },
  {
    title: "Investor Readiness Layer",
    desc: "Generate investor-facing summaries and financial narratives in a single click.",
    col: "lg:col-span-2",
    icon: <Layers size={20} />,
  },
  {
    title: "Excel + Accounting Sync",
    desc: "Works seamlessly with your existing operational workflow.",
    col: "lg:col-span-1",
    icon: <Database size={20} />,
  },
  {
    title: "Bank-Grade Security",
    desc: "Built with controlled data access and safe financial handling.",
    col: "lg:col-span-1",
    icon: <ShieldCheck size={20} />,
  },
];

const howSteps = [
  { step: "01", title: "Connect your data", desc: "Upload Excel files or securely connect your accounting tools." },
  { step: "02", title: "AI starts analyzing", desc: "Reports, forecasts, and hidden anomalies are generated instantly." },
  { step: "03", title: "Experts review & guide", desc: "Human CFOs validate models and convert insights into strategy." },
  { step: "04", title: "Make decisions", desc: "Operate with confidence using interactive dashboards and tools." },
];

const whyItems = [
  { title: "AI speed with human judgment", icon: <Zap size={24} /> },
  { title: "Built for Indian startup realities", icon: <Database size={24} /> },
  { title: "Strategic support, not bookkeeping", icon: <TrendingUp size={24} /> },
  { title: "Faster reporting, deeper visibility", icon: <Search size={24} /> },
  { title: "Flexible Excel & tool workflows", icon: <Layers size={24} /> },
  { title: "Secure data handling", icon: <Shield size={24} /> },
];

const trustPillars = [
  {
    title: "Data Security",
    icon: <ShieldCheck size={22} />,
    points: [
      "End-to-end encryption across all financial data flows",
      "Role-based access with strict controls",
      "Complete data isolation per client",
      "Zero cross-client data leakage",
    ],
  },
  {
    title: "Scalable Architecture",
    icon: <Layers size={22} />,
    points: [
      "Containerized, modular infrastructure",
      "Distributed processing for performance",
      "High availability with failover systems",
      "Built to handle large financial datasets",
    ],
  },
  {
    title: "Reliable Integrations",
    icon: <Database size={22} />,
    points: [
      "Native integrations (Tally, Zoho)",
      "Excel and custom data pipelines",
      "API-first architecture",
      "Continuous sync and validation",
    ],
  },
];

const transformStagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

const transformItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export default function LandingPage() {
  const [activeModelingIndex, setActiveModelingIndex] = useState(0);

  return (
    <Background>
      <Navbar />
      <HeroSection />

      <section
        id="benefits"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[#1a3673]/10 bg-white py-24 md:py-28 px-4"
      >
        <style>{`
          @keyframes benefits-chip-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          @keyframes benefits-stale-blink {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          @keyframes benefits-formula-fade {
            0%, 45% { opacity: 0.42; }
            55%, 90% { opacity: 1; }
            100% { opacity: 0.42; }
          }
          @keyframes benefits-queue-pulse {
            0%, 100% { opacity: 0.88; border-color: rgba(26,54,115,0.1); }
            50% { opacity: 1; border-color: rgba(26,54,115,0.2); }
          }
        `}</style>
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            backgroundColor: "#ffffff",
            backgroundImage: [
              "linear-gradient(rgba(26,54,115,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(26,54,115,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "60px 60px",
          }}
        />
        <div className="max-w-7xl mx-auto relative z-[1]">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.h2
              variants={transformItem}
              className="text-3xl md:text-[2.35rem] font-semibold tracking-tight leading-[1.2] text-[#1a3673]"
            >
              The problem isn&apos;t the finance team. It&apos;s the system around them.
            </motion.h2>
            <motion.p
              variants={transformItem}
              className="mt-5 text-base md:text-lg leading-relaxed text-[rgba(26,54,115,0.7)]"
            >
              Finance leaders are expected to deliver clarity, speed, and confidence — but the underlying tools are
              fragmented, manual, and hard to trust.
            </motion.p>
          </motion.div>

          <div className="relative mt-14 md:mt-16">
            <motion.div
              className="relative grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-8 md:gap-y-6"
              variants={transformStagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.18 }}
            >
              {financeFrictionCards.map(({ title, description, Icon, hint }, idx) => (
                <motion.article
                  key={title}
                  variants={transformItem}
                  transition={{ delay: 0.03 * idx }}
                  className={`group relative flex h-full flex-col rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-6 shadow-[0_4px_24px_rgba(26,54,115,0.08),0_1px_3px_rgba(26,54,115,0.04)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(26,54,115,0.12)] md:p-7 ${idx >= 2 ? "md:mt-6" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold tracking-tight text-[#1a3673]">{title}</h3>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] text-[#1a3673]">
                      <Icon size={20} strokeWidth={1.5} className="text-[#1a3673]" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-sm md:text-[15px] leading-relaxed text-[rgba(26,54,115,0.7)]">
                    {description}
                  </p>

                  {hint === "silos" && (
                    <div
                      className="mt-5 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-3"
                      aria-hidden
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {["GL", "CRM", "Banks", "Sheets"].map((label, i) => (
                          <span key={label} className="inline-flex items-center">
                            <span
                              className="inline-flex rounded-md border border-[rgba(26,54,115,0.12)] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#1a3673]/75"
                              style={{
                                animation: "benefits-chip-float 6s ease-in-out infinite",
                                animationDelay: `${i * 0.55}s`,
                              }}
                            >
                              {label}
                            </span>
                            {i < 3 && (
                              <span className="mx-0.5 inline-block text-[10px] font-medium text-[#fc7d25]/50">· ·</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-[#1a3673]/55">Sources rarely share one timely view</p>
                    </div>
                  )}

                  {hint === "stale" && (
                    <div
                      className="mt-5 flex items-center gap-3 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-3"
                      aria-hidden
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(26,54,115,0.1)] bg-white text-[#1a3673]/65">
                        <Clock size={16} strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-[#1a3673]">Management pack</p>
                        <p
                          className="mt-0.5 text-[10px] font-medium text-[#c55a12]"
                          style={{ animation: "benefits-stale-blink 2.8s ease-in-out infinite" }}
                        >
                          Last refreshed · data through Mar 12 · circulated Mar 18
                        </p>
                      </div>
                    </div>
                  )}

                  {hint === "blackbox" && (
                    <div
                      className="mt-5 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-3"
                      aria-hidden
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          {
                            className:
                              "rounded border border-dashed border-[#fc7d25]/40 bg-white px-2 py-0.5 font-mono text-[9px] text-[#1a3673]/75",
                            text: "Assumption_Set_A",
                          },
                          {
                            className:
                              "rounded border border-[rgba(26,54,115,0.12)] bg-white px-2 py-0.5 font-mono text-[9px] text-[#1a3673]/75",
                            text: "=SUMIFS(…)",
                          },
                          {
                            className:
                              "rounded border border-[rgba(26,54,115,0.12)] bg-white px-2 py-0.5 font-mono text-[9px] text-[#1a3673]/75",
                            text: "hidden_refs",
                          },
                        ].map((tag, ti) => (
                          <span
                            key={tag.text}
                            className={tag.className}
                            style={{
                              animation: "benefits-formula-fade 5.5s ease-in-out infinite",
                              animationDelay: `${ti * 0.75}s`,
                            }}
                          >
                            {tag.text}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-[#1a3673]/55">Hard to audit without opening every link</p>
                    </div>
                  )}

                  {hint === "queue" && (
                    <div
                      className="mt-5 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-2.5"
                      aria-hidden
                    >
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[#1a3673]/65">
                        Analyst queue
                      </p>
                      <ul className="space-y-1.5">
                        {[
                          { label: "Board metrics pack", state: "Queued" },
                          { label: "Scenario: hire plan", state: "In model" },
                          { label: "Investor follow-up", state: "Pending" },
                        ].map((row, qi) => (
                          <li
                            key={row.label}
                            className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(26,54,115,0.1)] bg-white px-2 py-1.5"
                            style={{
                              animation: "benefits-queue-pulse 4.5s ease-in-out infinite",
                              animationDelay: `${qi * 0.6}s`,
                            }}
                          >
                            <span className="truncate text-[11px] text-[#1a3673]/75">{row.label}</span>
                            <span className="shrink-0 rounded-md bg-[#fc7d25]/12 px-1.5 py-0.5 text-[9px] font-medium text-[#c55a12]">
                              {row.state}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.article>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section
        id="wyz-platform"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#fafbfc] py-24 md:py-28"
      >
        <style>{`
          @keyframes wyz-connector-flow {
            to { stroke-dashoffset: -20; }
          }
          @keyframes wyz-core-glow {
            0%, 100% { opacity: 0.55; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(1.03); }
          }
        `}</style>
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            backgroundColor: "#fafbfc",
            backgroundImage: [
              "linear-gradient(rgba(26,54,115,0.035) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(26,54,115,0.035) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative z-[1] mx-auto max-w-7xl px-4">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.h2
              variants={transformItem}
              className="text-3xl font-semibold tracking-tight text-[#1a3673] md:text-[2.15rem] md:leading-snug"
            >
              One Platform. Total Financial Intelligence.
            </motion.h2>
            <motion.p
              variants={transformItem}
              className="mt-4 text-base leading-relaxed text-[rgba(26,54,115,0.7)] md:text-lg"
            >
              Connect your financial data, unify it through Wyz, and turn it into board-ready reports, forecasts, and
              instant answers.
            </motion.p>
          </motion.div>

          <div className="relative mx-auto mt-14 max-w-6xl lg:mt-16">
            <svg
              className="pointer-events-none absolute left-0 top-[22%] z-0 hidden h-[56%] min-h-[200px] w-full lg:block"
              viewBox="0 0 1000 280"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient id="wyzLineL" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(26,54,115,0.2)" />
                  <stop offset="50%" stopColor="rgba(252,125,37,0.45)" />
                  <stop offset="100%" stopColor="rgba(26,54,115,0.35)" />
                </linearGradient>
                <linearGradient id="wyzLineR" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(26,54,115,0.35)" />
                  <stop offset="50%" stopColor="rgba(252,125,37,0.45)" />
                  <stop offset="100%" stopColor="rgba(26,54,115,0.2)" />
                </linearGradient>
              </defs>
              <path
                d="M 120 140 C 240 60, 360 220, 500 140"
                stroke="rgba(26,54,115,0.12)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M 120 140 C 240 60, 360 220, 500 140"
                stroke="url(#wyzLineL)"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeDasharray="5 7"
                style={{ animation: "wyz-connector-flow 2.8s linear infinite" }}
              />
              <path
                d="M 500 140 C 640 60, 760 220, 880 140"
                stroke="rgba(26,54,115,0.12)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M 500 140 C 640 60, 760 220, 880 140"
                stroke="url(#wyzLineR)"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeDasharray="5 7"
                style={{ animation: "wyz-connector-flow 2.8s linear infinite reverse" }}
              />
            </svg>

            <div className="relative z-[1] grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-6">
              <motion.div
                className="lg:col-span-3"
                variants={transformItem}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.25 }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fc7d25]">Your Financial Stack</p>
                <ul className="mt-5 space-y-3">
                  {wyzSourceItems.map(({ label, Icon }) => (
                    <li
                      key={label}
                      className="flex items-start gap-3 rounded-xl border border-[rgba(26,54,115,0.1)] bg-white px-4 py-3 shadow-[0_2px_12px_rgba(26,54,115,0.05)]"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(26,54,115,0.08)] bg-[#f8fafc] text-[#1a3673]">
                        <Icon size={16} strokeWidth={1.5} aria-hidden />
                      </span>
                      <span className="text-sm font-medium leading-snug text-[#1a3673]">{label}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <div className="flex justify-center lg:col-span-6">
                <motion.div
                  className="relative w-full max-w-md"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    className="pointer-events-none absolute -inset-4 z-0 rounded-[28px] bg-gradient-to-br from-[#1a3673]/18 via-[#fafbfc]/0 to-[#fc7d25]/22 opacity-90 blur-2xl"
                    style={{ animation: "wyz-core-glow 5s ease-in-out infinite" }}
                    aria-hidden
                  />
                  <motion.div
                    className="relative z-10 rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white px-6 py-8 shadow-[0_28px_56px_rgba(26,54,115,0.1),0_0_0_1px_rgba(255,255,255,0.8)_inset,0_0_64px_rgba(252,125,37,0.12)] md:px-8 md:py-9"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div className="text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#fc7d25]">Wyz Core</p>
                      <h3 className="mt-2 font-semibold tracking-tight text-[#1a3673] text-3xl md:text-4xl">Wyz</h3>
                      <p className="mt-2 text-sm text-[rgba(26,54,115,0.65)]">Your financial intelligence layer</p>
                    </div>
                    <ul className="mt-8 space-y-3 border-t border-[rgba(26,54,115,0.08)] pt-6">
                      {wyzCoreCapabilities.map(({ title, Icon }) => (
                        <li key={title} className="flex items-center gap-3 text-[15px] font-medium text-[#1a3673]">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(252,125,37,0.12)] text-[#c55a12]">
                            <Icon size={18} strokeWidth={1.75} className="text-[#1a3673]" aria-hidden />
                          </span>
                          {title}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </motion.div>
              </div>

              <motion.div
                className="lg:col-span-3"
                variants={transformItem}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.25 }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fc7d25]">What You Get</p>
                <div className="mt-5 flex flex-col gap-3.5">
                  {wyzOutputGroups.map((group) => (
                    <div
                      key={group.title}
                      className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-white px-4 py-3.5 shadow-[0_2px_10px_rgba(26,54,115,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(252,125,37,0.28)] hover:shadow-[0_8px_24px_rgba(26,54,115,0.08)]"
                    >
                      <h4 className="text-[13px] font-semibold leading-snug tracking-tight text-[#1a3673]">
                        {group.title}
                      </h4>
                      <ul className="mt-2.5 space-y-2 border-t border-[rgba(26,54,115,0.06)] pt-2.5">
                        {group.bullets.map((line) => (
                          <li key={line} className="flex gap-2.5 text-[13px] leading-snug text-[rgba(26,54,115,0.78)]">
                            <span
                              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#fc7d25]"
                              aria-hidden
                            />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>

          <motion.p
            className="mx-auto mt-14 max-w-2xl text-center text-sm font-medium text-[rgba(26,54,115,0.55)] md:mt-16 md:text-base"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.45 }}
          >
            From fragmented tools to a unified financial command system.
          </motion.p>
        </div>
      </section>

      <WyzAiChatSection />

      <section
        id="modeling"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f5f7fb] py-24 md:py-28 px-4"
      >
        <style>{`
          @keyframes modeling-primary-line {
            0% { stroke-dashoffset: 360; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes modeling-secondary-line {
            0% { stroke-dashoffset: 340; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes modeling-core-line {
            0% { stroke-dashoffset: 360; }
            100% { stroke-dashoffset: 0; }
          }
        `}</style>
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            backgroundImage: [
              "linear-gradient(rgba(26,54,115,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(26,54,115,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "64px 64px",
          }}
        />
        <div className="relative z-[1] mx-auto max-w-7xl">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.h2
              variants={transformItem}
              className="text-3xl md:text-[2.15rem] font-semibold tracking-tight text-[#1a3673]"
            >
              Financial Modeling &amp; Insights
            </motion.h2>
            <motion.p
              variants={transformItem}
              className="mt-4 text-base md:text-lg leading-relaxed text-[rgba(26,54,115,0.7)]"
            >
              From data → models → decisions.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-12 grid grid-cols-1 gap-10 items-start md:mt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
          >
            <motion.div
              variants={transformItem}
              className="relative overflow-hidden rounded-3xl border border-[rgba(26,54,115,0.16)] bg-white px-4 py-4 shadow-[0_22px_60px_rgba(26,54,115,0.16)] md:px-6 md:py-5"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-[rgba(250,252,255,0.9)] via-[rgba(245,247,252,0.9)] to-white opacity-95" />
              <div className="pointer-events-none absolute -left-16 top-1/2 h-[320px] w-[320px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(26,54,115,0.2),transparent_70%)] opacity-[0.12]" />
              <div className="relative z-[1]">
                <div className="mb-3 flex items-center justify-between text-[11px] text-[rgba(26,54,115,0.7)]">
                  <span className="font-semibold tracking-[0.16em] uppercase text-[rgba(26,54,115,0.75)]">
                    Unified financial view
                  </span>
                  <span className="rounded-full bg-[rgba(252,125,37,0.08)] px-2 py-0.5 text-[10px] font-medium text-[#c55a12]">
                    Live | Scenario | Forecast
                  </span>
                </div>
                <div className="relative mt-1 h-[230px] w-full rounded-2xl border border-[rgba(26,54,115,0.12)] bg-[#f9fbff] px-2.5 py-2 md:h-[270px] md:px-3.5 md:py-3">
                  <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden>
                    <defs>
                      <linearGradient id="modelingArea" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(252,125,37,0.18)" />
                        <stop offset="100%" stopColor="rgba(252,125,37,0.02)" />
                      </linearGradient>
                    </defs>
                    <g>
                      {[30, 70, 110, 150].map((y) => (
                        <line
                          // eslint-disable-next-line react/no-array-index-key
                          key={y}
                          x1="26"
                          y1={y}
                          x2="306"
                          y2={y}
                          stroke="rgba(26,54,115,0.08)"
                          strokeWidth="1"
                          strokeDasharray="2 4"
                        />
                      ))}
                      {[26, 86, 146, 206, 266].map((x) => (
                        <line
                          // eslint-disable-next-line react/no-array-index-key
                          key={x}
                          x1={x}
                          y1="26"
                          x2={x}
                          y2="170"
                          stroke="rgba(26,54,115,0.05)"
                          strokeWidth="1"
                        />
                      ))}
                    </g>
                    <path
                      d="M26 140 C 74 130 104 110 132 104 C 164 96 196 102 228 88 C 252 78 276 70 306 64"
                      fill="none"
                      stroke="rgba(26,54,115,0.4)"
                      strokeWidth="1.6"
                      className={
                        activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 4
                          ? "opacity-100"
                          : "opacity-50"
                      }
                      style={{
                        strokeDasharray: 360,
                        strokeDashoffset: 0,
                        animation:
                          activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 4
                            ? "modeling-core-line 3.2s ease-out forwards"
                            : undefined,
                      }}
                    />
                    <path
                      d="M26 152 C 70 150 96 144 128 138 C 156 132 188 122 220 120 C 248 118 278 122 306 118"
                      fill="none"
                      stroke="rgba(26,54,115,0.22)"
                      strokeWidth="1.4"
                      className={
                        activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 3
                          ? "opacity-100"
                          : "opacity-40"
                      }
                      style={{
                        strokeDasharray: 340,
                        strokeDashoffset: 0,
                        animation:
                          activeModelingIndex === 0 || activeModelingIndex === 3
                            ? "modeling-secondary-line 3.4s ease-out 0.15s forwards"
                            : undefined,
                      }}
                    />
                    <path
                      d="M26 132 C 72 120 108 116 140 110 C 176 104 204 98 232 90 C 256 84 282 80 306 76"
                      fill="url(#modelingArea)"
                      stroke="none"
                      className={activeModelingIndex === 0 || activeModelingIndex === 2 ? "opacity-90" : "opacity-40"}
                    />
                    <path
                      d="M226 92 C 238 88 248 86 260 84 C 272 82 288 80 306 78"
                      fill="none"
                      stroke="rgba(252,125,37,0.7)"
                      strokeWidth="1.4"
                      strokeDasharray="4 4"
                      className={
                        activeModelingIndex === 0 || activeModelingIndex === 1
                          ? "opacity-100 drop-shadow-sm"
                          : "opacity-30"
                      }
                    />
                    <path
                      d="M26 132 C 72 120 108 116 140 110 C 176 104 204 98 232 90 C 256 84 282 80 306 76"
                      fill="none"
                      stroke="#fc7d25"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      className={
                        activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 4
                          ? "opacity-100"
                          : "opacity-60"
                      }
                      style={{
                        strokeDasharray: 360,
                        strokeDashoffset: 0,
                        filter:
                          activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 4
                            ? "drop-shadow(0 0 6px rgba(252,125,37,0.55))"
                            : "none",
                        animation:
                          activeModelingIndex === 0 || activeModelingIndex === 2 || activeModelingIndex === 4
                            ? "modeling-primary-line 3s ease-out forwards"
                            : undefined,
                      }}
                    />
                    <circle
                      cx="226"
                      cy="92"
                      r="3.3"
                      fill="#fc7d25"
                      className="origin-center"
                      style={{ animation: "modeling-point-pulse 3.4s ease-in-out infinite" }}
                    />
                    <circle
                      cx="262"
                      cy="84"
                      r="2.6"
                      fill="#1a3673"
                      className="origin-center"
                      style={{ animation: "modeling-point-pulse 3.6s ease-in-out 0.4s infinite" }}
                    />
                    <circle
                      cx="196"
                      cy="104"
                      r="2.4"
                      fill="rgba(26,54,115,0.85)"
                      className="origin-center"
                      style={{ animation: "modeling-point-pulse 3.8s ease-in-out 0.8s infinite" }}
                    />
                    <circle
                      cx="132"
                      cy="114"
                      r="2.4"
                      fill="rgba(26,54,115,0.7)"
                      className="origin-center"
                      style={{ animation: "modeling-point-pulse 3.6s ease-in-out 1.2s infinite" }}
                    />
                    <rect
                      x="26"
                      y="22"
                      width="210"
                      height="58"
                      rx="8"
                      ry="8"
                      fill="white"
                      stroke="rgba(26,54,115,0.14)"
                      strokeWidth="1"
                    />
                    <text x="38" y="40" fontSize="10" fill="#1a3673" fontFamily="system-ui, sans-serif" fontWeight="600">
                      EBITDA ↓ 18% QoQ
                    </text>
                    <text x="38" y="54" fontSize="9" fill="rgba(26,54,115,0.7)" fontFamily="system-ui, sans-serif">
                      Driven by marketing spend
                    </text>
                    <text x="38" y="68" fontSize="9" fill="#fc7d25" fontFamily="system-ui, sans-serif" fontWeight="600">
                      ↑ 32%
                    </text>
                    <rect
                      x="176"
                      y="122"
                      width="132"
                      height="44"
                      rx="6"
                      ry="6"
                      fill="white"
                      stroke="rgba(26,54,115,0.14)"
                      strokeWidth="1"
                    />
                    <text x="186" y="138" fontSize="10" fill="#1a3673" fontFamily="system-ui, sans-serif" fontWeight="600">
                      Runway scenario
                    </text>
                    <text x="186" y="154" fontSize="9" fill="rgba(26,54,115,0.7)" fontFamily="system-ui, sans-serif">
                      <tspan>↓ from </tspan>
                      <tspan fill="#1a3673" fontWeight="600">
                        18 mo
                      </tspan>
                      <tspan> · </tspan>
                      <tspan fill="#fc7d25" fontWeight="600">
                        14.2 mo
                      </tspan>
                    </text>
                  </svg>
                </div>
                <div className="mt-3 rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3.5 shadow-[0_12px_30px_rgba(26,54,115,0.12)] md:px-5 md:py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#fc7d25]">
                    ⚡ AI Insight
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[rgba(26,54,115,0.9)] md:text-sm">
                    EBITDA dropped{" "}
                    <span className="font-semibold text-[#fc7d25]">36%</span> in Q3–Q4 despite revenue growth. Root cause: employee
                    costs rose{" "}
                    <span className="font-semibold text-[#fc7d25]">₹1.8 Cr</span> after Q3 hiring (
                    <span className="font-semibold text-[#fc7d25]">14</span> new hires). Recommend reviewing headcount-to-revenue ROI
                    before next hiring cycle.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div variants={transformItem} className="relative min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fc7d25]">
                Modeling &amp; insight modules
              </p>
              <ul className="mt-6 flex flex-col">
                {modelingItems.map((item, idx) => {
                  const Icon = modelingModuleIcons[idx];
                  const isActive = activeModelingIndex === idx;
                  const isLast = idx === modelingItems.length - 1;
                  return (
                    <li
                      key={item.title}
                      className={isLast ? undefined : "border-b border-[rgba(26,54,115,0.06)]"}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setActiveModelingIndex(idx)}
                        onFocus={() => setActiveModelingIndex(idx)}
                        onMouseLeave={() => setActiveModelingIndex(0)}
                        className={`group flex w-full items-start gap-3 border-l border-transparent py-6 pl-3 pr-2 text-left transition-[background-color,border-color] duration-200 ease-out md:py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(252,125,37,0.25)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f7fb] ${
                          isActive
                            ? "border-l-[#fc7d25] bg-[rgba(26,54,115,0.028)]"
                            : "hover:bg-[rgba(26,54,115,0.034)]"
                        }`}
                      >
                        <Icon
                          size={14}
                          strokeWidth={1.75}
                          className={`mt-0.5 shrink-0 transition-colors duration-200 ${
                            isActive
                              ? "text-[rgba(26,54,115,0.85)]"
                              : "text-[rgba(26,54,115,0.5)] group-hover:text-[rgba(26,54,115,0.68)]"
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3
                            className={`text-[13px] font-bold tracking-tight leading-snug md:text-sm ${
                              isActive ? "text-[#1a3673]" : "text-[rgba(26,54,115,0.88)]"
                            }`}
                          >
                            {item.title}
                          </h3>
                          <p className="text-[12px] leading-snug text-[rgba(26,54,115,0.52)] md:text-[13px] truncate">
                            {item.description}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="relative py-28 px-4 z-10 scroll-mt-28">
        <DecorativeGlow color="bg-[#1a3875]" className="bottom-0 left-0 w-[600px] h-[600px] opacity-35" />
        <DecorativeGlow color="bg-[#fc7c23]" className="top-[8%] right-[6%] w-[340px] h-[340px] opacity-[0.12]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionHeading
            title="A real CFO system, in action"
            subtitle="See how founders actually interact with AI + human CFO intelligence in one workflow."
          />

          <div className="rounded-[30px] border border-white/12 bg-[#0a1635]/80 backdrop-blur-xl p-1 shadow-[0_22px_70px_rgba(0,0,0,0.4)]">
            <div className="rounded-[26px] border border-white/8 bg-gradient-to-br from-[#0f2249]/90 via-[#0a1635]/95 to-[#07122a]/95 p-5 md:p-7">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#a3b8d7]/70">Live Product Experience</p>
                  <h3 className="mt-2 text-2xl md:text-3xl font-semibold text-white">Ask your CFO anything</h3>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#fc7c23]/35 bg-[#fc7c23]/10 px-3 py-1.5 text-xs text-[#ffd6bc]">
                  <Bot size={14} className="text-[#fc7c23]" />
                  AI CFO + Human Review Layer
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] gap-5">
                <div className="rounded-2xl border border-white/10 bg-[#061028]/75 p-4 md:p-5">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#7f9ac0]">Example questions</p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {["How much runway do I have?", "Why is burn increasing?", "Can we hire more?"].map((q) => (
                      <span
                        key={q}
                        className="rounded-full border border-white/14 bg-white/5 px-3 py-1.5 text-xs md:text-sm text-[#d5e3f8]"
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#fc7c23]/20 bg-[#050b1a]/75 p-4 md:p-5 shadow-[0_0_0_1px_rgba(252,124,35,0.08),0_18px_44px_rgba(0,0,0,0.35)]">
                  <div className="space-y-3">
                    <div className="ml-auto max-w-[88%] rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white">
                      Why is burn increasing, and can we still hire 2 engineers this quarter?
                    </div>
                    <div className="max-w-[94%] rounded-2xl border border-[#fc7c23]/18 bg-[#0b1a38] px-4 py-4 text-sm leading-relaxed text-[#d0dff3]">
                      <p className="font-medium text-white">AI CFO Response</p>
                      <p className="mt-2">
                        Burn is up <span className="text-[#fc7c23] font-semibold">13.4% MoM</span>, driven by infra (+₹1.1L) and sales tooling (+₹0.8L).
                        At current spend, runway is <span className="text-[#fc7c23] font-semibold">14.2 months</span>.
                      </p>
                      <p className="mt-2">
                        If you add 2 engineers now, runway drops to <span className="text-[#fc7c23] font-semibold">11.6 months</span>, but expected
                        feature velocity can improve conversion by ~6-8% in the next two quarters.
                      </p>
                      <p className="mt-2 text-[#f3f7ff]">
                        <span className="font-semibold">Recommendation:</span> Hire one engineer now, review pipeline conversion in 45 days, then decide on
                        the second role.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-md p-6">
              <div className="w-11 h-11 rounded-xl bg-[#fc7c23]/15 text-[#fc7c23] flex items-center justify-center mb-4">
                <LineChart size={20} />
              </div>
              <h4 className="text-lg font-semibold text-white">Real-time financial intelligence</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                {["Live MIS", "Anomaly detection", "Instant insights"].map((li) => (
                  <li key={li} className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#fc7c23]" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-md p-6">
              <div className="w-11 h-11 rounded-xl bg-[#fc7c23]/15 text-[#fc7c23] flex items-center justify-center mb-4">
                <Users size={20} />
              </div>
              <h4 className="text-lg font-semibold text-white">Backed by real CFO expertise</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                {["Strategic reviews", "Fundraising prep", "Board support"].map((li) => (
                  <li key={li} className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#fc7c23]" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-md p-6">
              <div className="w-11 h-11 rounded-xl bg-[#fc7c23]/15 text-[#fc7c23] flex items-center justify-center mb-4">
                <Database size={20} />
              </div>
              <h4 className="text-lg font-semibold text-white">Connected finance stack</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                {["Excel integration", "Accounting tools (Tally, Zoho)", "Automated reporting pipelines"].map((li) => (
                  <li key={li} className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#fc7c23]" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="relative py-24 px-4 bg-[#050b1a]/80 z-10 scroll-mt-28">
        <DecorativeGlow color="bg-[#1a3875]" className="top-[20%] left-[4%] w-[420px] h-[420px] opacity-20" />
        <DecorativeGlow color="bg-[#fc7c23]" className="bottom-[6%] right-[7%] w-[340px] h-[340px] opacity-[0.1]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionHeading
            title="Everything your CFO would do — done continuously"
            subtitle="Your finance system — fully managed"
          />

          <div className="relative mt-10">
            <div className="hidden lg:block absolute left-[12.5%] right-[12.5%] top-10 h-px bg-gradient-to-r from-transparent via-[#fc7c23]/45 to-transparent" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <article className="relative rounded-3xl border border-white/12 bg-white/[0.05] backdrop-blur-md p-6 shadow-[0_16px_46px_rgba(0,0,0,0.3)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-[#8ea7ca]">Step 1</span>
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/12 text-[#d3e0f4] flex items-center justify-center">
                    <Database size={18} />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white">Data Layer</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                  {["Excel, accounting tools, bank data", "Real-time syncing"].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-[#fc7c23]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="relative rounded-3xl border border-[#fc7c23]/26 bg-gradient-to-br from-[#0f2249]/85 via-[#0d1d40]/90 to-[#09152f]/95 backdrop-blur-md p-6 shadow-[0_0_0_1px_rgba(252,124,35,0.14),0_20px_52px_rgba(0,0,0,0.35)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-[#ffd8bf]">Step 2</span>
                  <div className="w-10 h-10 rounded-xl bg-[#fc7c23]/16 border border-[#fc7c23]/25 text-[#fc7c23] flex items-center justify-center shadow-[0_0_18px_rgba(252,124,35,0.25)]">
                    <LineChart size={18} />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white">Intelligence Layer</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#c2d3ec]">
                  {["MIS auto-generated", "Dashboards", "Anomaly detection"].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-[#fc7c23] motion-safe:animate-pulse" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="relative rounded-3xl border border-white/12 bg-white/[0.05] backdrop-blur-md p-6 shadow-[0_16px_46px_rgba(0,0,0,0.3)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-[#8ea7ca]">Step 3</span>
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/12 text-[#d3e0f4] flex items-center justify-center">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white">Decision Layer</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                  {["Forecasting", "Runway visibility", "Variance analysis"].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-[#fc7c23]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="relative rounded-3xl border border-white/12 bg-white/[0.05] backdrop-blur-md p-6 shadow-[0_16px_46px_rgba(0,0,0,0.3)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-[#8ea7ca]">Step 4</span>
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/12 text-[#d3e0f4] flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white">Execution Layer</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#a9bedf]">
                  {["Investor reports", "Fundraising support", "Strategic planning"].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-[#fc7c23]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative py-32 px-4 z-10 scroll-mt-28">
        <DecorativeGlow color="bg-[#fc7c23]" className="top-1/2 right-0 w-[400px] h-[400px] opacity-20" />
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionHeading title="Why This Feels Like a CFO Team in One Platform" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {featureBlocks.map((feature, i) => (
              <div
                key={i}
                className={`bg-[#0a1635]/80 backdrop-blur-sm border border-white/10 p-8 rounded-3xl hover:bg-white/5 transition-all duration-300 ${feature.col} flex flex-col justify-between`}
              >
                <div className="bg-white/10 w-10 h-10 rounded-full flex items-center justify-center text-[#fc7c23] mb-6">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-2">{feature.title}</h4>
                  <p className="text-sm text-[#a3b8d7] leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative py-24 px-4 bg-gradient-to-b from-transparent to-[#050b1a] z-10 scroll-mt-28">
        <div className="max-w-5xl mx-auto relative z-10">
          <SectionHeading title="How It Works" />
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#fc7c23]/50 to-transparent z-0" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {howSteps.map((item, i) => (
                <div key={i} className="relative z-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-[#0a1635] border-2 border-[#fc7c23] flex items-center justify-center text-xl font-bold text-[#fc7c23] shadow-[0_0_20px_rgba(252,124,35,0.3)] mb-6">
                    {item.step}
                  </div>
                  <h4 className="text-lg font-bold text-white mb-3 bg-[#050b1a] px-2 rounded-md">{item.title}</h4>
                  <p className="text-sm text-[#a3b8d7] leading-relaxed px-2 bg-[#050b1a]/95 rounded-md">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="vision"
        className="relative py-32 md:py-40 px-4 flex items-center justify-center border-y border-white/5 bg-[#050b1a] overflow-hidden z-10 scroll-mt-28"
      >
        <DecorativeGlow color="bg-[#1a3875]" className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-40" />
        <div
          className="absolute inset-0 z-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: "url(https://www.transparenttextures.com/patterns/stardust.png)",
          }}
        />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <h2 className="text-sm font-bold text-[#fc7c23] tracking-[0.2em] uppercase mb-8">Our Vision</h2>
          <blockquote className="text-2xl md:text-4xl lg:text-5xl font-light text-white leading-tight tracking-tight">
            We believe every startup deserves access to world-class financial intelligence — not just large enterprises. We are
            building an AI + human CFO layer for Indian startups so founders can make faster, smarter, and safer decisions.
          </blockquote>
        </div>
      </section>

      <section id="trust-security" className="relative py-28 px-4 z-10 bg-gradient-to-b from-[#060f24] to-[#050b1a] scroll-mt-28 overflow-hidden">
        <style>{`
          @keyframes trustNodeGlow {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 0.68; }
          }
          @keyframes trustNodePing {
            0% { transform: scale(0.9); opacity: 0; }
            20% { opacity: 0.55; }
            100% { transform: scale(2.5); opacity: 0; }
          }
          @keyframes trustSecurityBreath {
            0%, 100% {
              box-shadow: 0 0 0 1px rgba(252,124,35,0.12), 0 20px 52px rgba(0,0,0,0.38);
              border-color: rgba(252,124,35,0.28);
            }
            50% {
              box-shadow: 0 0 0 1px rgba(252,124,35,0.2), 0 24px 62px rgba(0,0,0,0.42), 0 0 32px rgba(252,124,35,0.14);
              border-color: rgba(252,124,35,0.4);
            }
          }
          @keyframes trustIconBreath {
            0%, 100% { box-shadow: 0 0 14px rgba(252,124,35,0.16); }
            50% { box-shadow: 0 0 24px rgba(252,124,35,0.28); }
          }
          @keyframes trustFlowSweep {
            0% { transform: translateX(-8%); opacity: 0; }
            20% { opacity: 0.22; }
            80% { opacity: 0.22; }
            100% { transform: translateX(8%); opacity: 0; }
          }
          @keyframes trustMoneyFade {
            0%, 100% { opacity: 0; }
            20%, 65% { opacity: 0.55; }
          }
          @keyframes trustValueFloat {
            0%, 100% { transform: translateY(0); opacity: 0.18; }
            50% { transform: translateY(-4px); opacity: 0.3; }
          }
          @keyframes trustNodeBurst {
            0% { transform: scale(0.7); opacity: 0; }
            20% { opacity: 0.24; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          @keyframes trustStreakDrift {
            0% { transform: translateX(-3%); opacity: 0.16; }
            50% { opacity: 0.28; }
            100% { transform: translateX(3%); opacity: 0.16; }
          }
          @keyframes trustRupeeDrift {
            0%, 100% { transform: translate3d(0, 0, 0); opacity: 0; }
            20%, 70% { opacity: 0.5; }
            50% { transform: translate3d(16px, -8px, 0); opacity: 0.7; }
          }
        `}</style>

        <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.2]" aria-hidden>
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute left-[8%] top-[24%] h-[2px] w-[36%] rounded-full blur-[8px]"
              style={{
                background: "linear-gradient(90deg, rgba(114,155,223,0) 0%, rgba(114,155,223,0.52) 55%, rgba(114,155,223,0) 100%)",
                animation: "trustStreakDrift 14s ease-in-out infinite",
              }}
            />
            <div
              className="absolute right-[10%] top-[58%] h-[2px] w-[30%] rounded-full blur-[8px]"
              style={{
                background: "linear-gradient(90deg, rgba(114,155,223,0) 0%, rgba(114,155,223,0.48) 50%, rgba(114,155,223,0) 100%)",
                animation: "trustStreakDrift 17s ease-in-out 1.2s infinite",
              }}
            />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(110,148,210,0.04) 0%, rgba(138,173,231,0.14) 50%, rgba(110,148,210,0.04) 100%)",
              animation: "trustFlowSweep 18s ease-in-out infinite",
            }}
          />
          <svg className="h-full w-full" viewBox="0 0 1200 560" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="trustLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(128,163,224,0.22)" />
                <stop offset="100%" stopColor="rgba(128,163,224,0.06)" />
              </linearGradient>
              <radialGradient id="trustNode" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(160,190,240,0.48)" />
                <stop offset="100%" stopColor="rgba(160,190,240,0)" />
              </radialGradient>
            </defs>

            {/* input -> processing */}
            <path d="M140,120 C300,120 360,170 510,190" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />
            <path d="M140,200 C300,210 350,230 510,230" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />
            <path d="M140,280 C300,295 350,285 510,270" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />
            <path d="M140,360 C300,360 360,325 510,310" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />

            {/* processing -> outputs */}
            <path d="M610,190 C760,170 840,145 1010,140" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />
            <path d="M610,250 C760,250 840,250 1010,250" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />
            <path d="M610,310 C760,330 840,360 1010,360" fill="none" stroke="url(#trustLine)" strokeWidth="1.15" />

            {/* nodes */}
            {[
              [140, 120, "Excel"],
              [140, 200, "Tally"],
              [140, 280, "Zoho"],
              [140, 360, "Bank data"],
              [560, 190, "AI Engine"],
              [560, 250, "CFO Layer"],
              [560, 310, "Analytics Engine"],
              [1030, 140, "MIS Report"],
              [1030, 250, "Forecast"],
              [1030, 360, "Investor Report"],
            ].map(([x, y, label], idx) => (
              <g key={label} style={{ animation: `trustNodeGlow ${6 + (idx % 3)}s ease-in-out ${idx * 0.35}s infinite` }}>
                <circle cx={x} cy={y} r="17" fill="url(#trustNode)" />
                <circle cx={x} cy={y} r="2.8" fill="rgba(170,200,245,0.85)" />
                <circle
                  cx={x}
                  cy={y}
                  r="2.8"
                  fill="rgba(252,124,35,0.35)"
                  style={{ transformOrigin: `${x}px ${y}px`, animation: `trustNodePing ${9 + (idx % 4)}s ease-out ${idx * 0.45}s infinite` }}
                />
                <text x={x + 12} y={y - 8} fill="rgba(193,213,242,0.62)" fontSize="10" fontFamily="system-ui, sans-serif">
                  {label}
                </text>
              </g>
            ))}

            {/* subtle moving pulses */}
            <circle r="2.6" fill="rgba(252,124,35,0.78)">
              <animateMotion dur="12s" repeatCount="indefinite" path="M140,120 C300,120 360,170 510,190 C760,170 840,145 1010,140" />
            </circle>
            <circle r="2.5" fill="rgba(252,124,35,0.7)">
              <animateMotion dur="14s" begin="2.5s" repeatCount="indefinite" path="M140,280 C300,295 350,285 510,270 C760,250 840,250 1010,250" />
            </circle>
            <circle r="2.4" fill="rgba(252,124,35,0.66)">
              <animateMotion dur="16s" begin="5.2s" repeatCount="indefinite" path="M140,360 C300,360 360,325 510,310 C760,330 840,360 1010,360" />
            </circle>

            {/* rupee flow markers */}
            <text fill="rgba(252,124,35,0.62)" fontSize="12" fontFamily="system-ui, sans-serif" style={{ animation: "trustMoneyFade 12s ease-in-out infinite" }}>
              ₹
              <animateMotion dur="12s" repeatCount="indefinite" path="M140,200 C300,210 350,230 510,230 C760,250 840,250 1010,250" />
            </text>
            <text fill="rgba(252,124,35,0.56)" fontSize="11" fontFamily="system-ui, sans-serif" style={{ animation: "trustMoneyFade 15s ease-in-out 2s infinite" }}>
              ₹
              <animateMotion dur="15s" begin="2s" repeatCount="indefinite" path="M140,120 C300,120 360,170 510,190 C760,170 840,145 1010,140" />
            </text>
            <text fill="rgba(252,124,35,0.5)" fontSize="10" fontFamily="system-ui, sans-serif" style={{ animation: "trustMoneyFade 17s ease-in-out 4s infinite" }}>
              ₹
              <animateMotion dur="17s" begin="4s" repeatCount="indefinite" path="M140,360 C300,360 360,325 510,310 C760,330 840,360 1010,360" />
            </text>

            {/* node arrival burst cues */}
            {[ [560,190,12], [560,250,14], [560,310,16], [1030,140,12], [1030,250,14], [1030,360,16] ].map(([x,y,d],i) => (
              <circle
                key={`burst-${x}-${y}-${i}`}
                cx={x}
                cy={y}
                r="3"
                fill="rgba(252,124,35,0.28)"
                style={{ transformOrigin: `${x}px ${y}px`, animation: `trustNodeBurst ${d}s ease-out ${i * 1.4}s infinite` }}
              />
            ))}

            {/* faint financial data hints */}
            <text x="210" y="86" fill="rgba(180,205,242,0.4)" fontSize="10" fontFamily="system-ui, sans-serif" style={{ animation: "trustValueFloat 11s ease-in-out infinite" }}>
              ₹2.4Cr
            </text>
            <text x="455" y="420" fill="rgba(180,205,242,0.34)" fontSize="10" fontFamily="system-ui, sans-serif" style={{ animation: "trustValueFloat 13s ease-in-out 1.8s infinite" }}>
              ₹12L burn
            </text>
            <text x="880" y="318" fill="rgba(180,205,242,0.38)" fontSize="10" fontFamily="system-ui, sans-serif" style={{ animation: "trustValueFloat 12.5s ease-in-out 0.9s infinite" }}>
              ₹80L revenue
            </text>
          </svg>
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.16]" aria-hidden>
          <span className="absolute left-[18%] top-[34%] text-[11px] text-[#fc7c23]/80 blur-[0.2px]" style={{ animation: "trustRupeeDrift 10s ease-in-out 0.4s infinite" }}>₹</span>
          <span className="absolute left-[47%] top-[45%] text-[10px] text-[#fc7c23]/70 blur-[0.2px]" style={{ animation: "trustRupeeDrift 12s ease-in-out 1.8s infinite" }}>₹</span>
          <span className="absolute right-[20%] top-[53%] text-[10px] text-[#fc7c23]/65 blur-[0.2px]" style={{ animation: "trustRupeeDrift 11s ease-in-out 3s infinite" }}>₹</span>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-[58%] z-0 h-[390px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1a3875] blur-[130px] opacity-[0.1]" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">Built for security. Designed for scale.</h2>
            <p className="mt-5 text-base md:text-lg text-[#a3b8d7] leading-relaxed">
              Financial workflows involve highly sensitive data. This platform is engineered to protect it at every layer while
              maintaining speed, reliability, and operational continuity.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-7 md:gap-8">
            {trustPillars.map((pillar, idx) => (
              <article
                key={pillar.title}
                className={`group rounded-3xl backdrop-blur-md p-6 md:p-7 transition-all duration-300 ${
                  idx === 0
                    ? "md:-translate-y-1 border border-[#fc7c23]/30 bg-gradient-to-b from-[#0d1f44]/85 to-[#07122a]/92 shadow-[0_0_0_1px_rgba(252,124,35,0.14),0_22px_55px_rgba(0,0,0,0.4)] hover:-translate-y-1.5 hover:shadow-[0_0_0_1px_rgba(252,124,35,0.22),0_28px_70px_rgba(0,0,0,0.45)]"
                    : "border border-white/12 bg-[#07122a]/78 shadow-[0_14px_38px_rgba(0,0,0,0.28)] hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_20px_56px_rgba(0,0,0,0.36)]"
                }`}
                style={idx === 0 ? { animation: "trustSecurityBreath 8.8s ease-in-out infinite" } : undefined}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                    idx === 0
                      ? "border border-[#fc7c23]/35 bg-[#fc7c23]/12 text-[#ffcda9] shadow-[0_0_18px_rgba(252,124,35,0.2)]"
                      : "border border-white/15 bg-white/[0.06] text-[#c9d8ef] transition-all duration-300 group-hover:border-[#fc7c23]/30 group-hover:text-[#ffd5b9]"
                  }`}
                  style={idx === 0 ? { animation: "trustIconBreath 8.8s ease-in-out infinite" } : undefined}
                >
                  {pillar.icon}
                </div>
                <h3 className="text-xl font-semibold text-white">{pillar.title}</h3>
                <ul className="mt-5 space-y-3 text-sm text-[#a5bcdd]">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#7ea0d6]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <p className="mt-11 text-center text-sm md:text-base font-medium text-[#d2dff1]/95">
            <span className="inline-block mr-2 h-1.5 w-1.5 rounded-full bg-[#fc7c23] shadow-[0_0_10px_rgba(252,124,35,0.5)]" />
            Built to handle mission-critical financial workflows — without compromise
          </p>
        </div>
      </section>

      <section className="relative py-32 px-4 z-10">
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionHeading title="Why founders choose us" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-[#fc7c23]/50 transition-colors group cursor-default"
              >
                <div className="bg-white/10 text-gray-300 p-3 rounded-xl group-hover:text-[#fc7c23] group-hover:bg-[#fc7c23]/10 transition-colors shrink-0">
                  {item.icon}
                </div>
                <h4 className="text-lg font-semibold text-gray-200">{item.title}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="relative py-24 px-4 bg-[#0a1635] z-10 scroll-mt-28">
        <div className="max-w-3xl mx-auto relative z-10 text-center">
          <div className="bg-gradient-to-b from-[#112455] to-[#0a1635] border border-white/10 rounded-[40px] p-10 md:p-16 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[#fc7c23] rounded-full blur-[100px] opacity-10 pointer-events-none z-0" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-3xl mx-auto flex items-center justify-center mb-8 shadow-inner">
                <Shield className="text-[#fc7c23] w-10 h-10" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Enter Your CFO Workspace</h2>
              <p className="text-[#a3b8d7] mb-10 text-sm md:text-base px-4">
                Access your dashboards, reports, AI CFO chat, and planning tools in one secure environment.
              </p>
              <div className="flex flex-col gap-4 max-w-sm mx-auto">
                <Link
                  to="/login"
                  className="w-full bg-white text-gray-900 hover:bg-gray-100 px-6 py-4 rounded-xl font-semibold transition-all shadow-md flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Link>
                <Link
                  to="/login"
                  className="w-full bg-transparent border border-white/20 text-white hover:bg-white/5 px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-3"
                >
                  <Mail className="w-5 h-5" />
                  Continue with Email
                </Link>
              </div>
              <p className="text-xs text-gray-500 mt-8">Secure, encrypted, and built for founders.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="final-cta" className="relative py-32 px-4 border-t border-white/5 z-10 scroll-mt-28">
        <DecorativeGlow color="bg-[#fc7c23]" className="bottom-0 right-1/4 w-[500px] h-[400px] opacity-20" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-white mb-8 tracking-tight leading-tight">
            Stop guessing. Start operating with <span className="text-[#fc7c23]">financial clarity.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <a
              href="#hero-chat"
              className="w-full sm:w-auto bg-[#fc7c23] hover:bg-[#e66c1b] text-white px-8 py-4 rounded-xl font-bold transition-all shadow-[0_0_30px_rgba(252,124,35,0.3)] hover:-translate-y-1 text-lg"
            >
              Start AI CFO Chat
            </a>
            <a
              href="mailto:hello@example.com"
              className="w-full sm:w-auto bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:-translate-y-1 text-lg"
            >
              Book a Strategy Call
            </a>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-white/10 text-sm text-gray-500 relative z-10 bg-[#050b1a]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[#fc7c23]">Cfo</span>
            <span>© {new Date().getFullYear()}. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </Background>
  );
}
