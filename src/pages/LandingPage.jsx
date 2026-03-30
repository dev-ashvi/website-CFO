import Background from "../components/Background.jsx";
import Navbar from "../components/Navbar.jsx";
import footerLogo from "../../ChatGPT_Image_Mar_30__2026__07_33_52_PM-removebg-preview.png";
import HeroSection from "../components/HeroSection.jsx";
import WyzAiChatSection from "../components/WyzAiChatSection.jsx";
import TrustAccuracySection from "../components/TrustAccuracySection.jsx";
import UseCasesSection from "../components/UseCasesSection.jsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
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
  {
    step: "01",
    title: "Connect",
    desc: "Connect your accounting tools, CRM, spreadsheets, and bank data.",
    icon: <Database size={16} />,
  },
  {
    step: "02",
    title: "Sync & Clean",
    desc: "Automatically structure and reconcile your data into a unified model.",
    icon: <Link2 size={16} />,
  },
  {
    step: "03",
    title: "Model & Review",
    desc: "Financial models are built instantly. Assumptions are surfaced for approval.",
    icon: <GitBranch size={16} />,
  },
  {
    step: "04",
    title: "Ask & Explore",
    desc: "Ask any financial question in plain language — get instant answers.",
    icon: <MessageSquare size={16} />,
  },
  {
    step: "05",
    title: "Report & Act",
    desc: "Generate reports, share insights, and assign actions across teams.",
    icon: <FileText size={16} />,
  },
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

      <TrustAccuracySection />
      <UseCasesSection />

      <section
        id="how-it-works"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f7f9fd] px-4 py-24 md:py-28"
      >
        <style>{`
          @keyframes howFlowPulse {
            0% { transform: translateX(-2%); opacity: 0; }
            25% { opacity: 0.28; }
            75% { opacity: 0.28; }
            100% { transform: translateX(2%); opacity: 0; }
          }
        `}</style>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.h2 variants={transformItem} className="text-3xl md:text-[2.15rem] font-semibold tracking-tight text-[#1a3673]">
              How It Works
            </motion.h2>
            <motion.p variants={transformItem} className="mt-4 text-base md:text-lg leading-relaxed text-[rgba(26,54,115,0.7)]">
              A connected workflow from raw data to decisions and action.
            </motion.p>
          </motion.div>

          <div className="relative mt-12 md:mt-14">
            <div className="pointer-events-none hidden md:block absolute left-[8%] right-[8%] top-[22px] h-px bg-[rgba(26,54,115,0.16)]" />
            <div
              className="pointer-events-none hidden md:block absolute left-[8%] right-[8%] top-[22px] h-px bg-gradient-to-r from-transparent via-[#fc7d25]/40 to-transparent"
              style={{ animation: "howFlowPulse 4.6s ease-in-out infinite" }}
            />
            <div className="grid grid-cols-1 gap-7 md:grid-cols-5 md:gap-6">
              {howSteps.map((item) => (
                <motion.article
                  key={item.step}
                  variants={transformItem}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.35 }}
                  className="group relative min-w-0 transition-transform duration-200 ease-out hover:-translate-y-1"
                >
                  <div className="flex items-start gap-3 md:flex-col md:items-center md:text-center">
                    <div className="relative mt-0.5 md:mt-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(252,125,37,0.4)] bg-white text-[#fc7d25] transition-colors duration-200 group-hover:border-[#fc7d25] group-hover:text-[#e86f16]">
                        {item.icon}
                      </div>
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 text-[10px] font-semibold tracking-[0.08em] text-[rgba(26,54,115,0.62)] md:left-auto md:right-[-16px] md:top-1/2 md:-translate-y-1/2 md:translate-x-0">
                        {item.step}
                      </span>
                    </div>
                    <div className="min-w-0 md:mt-5">
                      <h4 className="text-[1.02rem] font-semibold tracking-tight text-[#1a3673]">{item.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-[rgba(26,54,115,0.66)]">{item.desc}</p>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="final-cta"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-white px-4 py-24 md:py-28"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            backgroundColor: "#ffffff",
            backgroundImage: [
              "linear-gradient(rgba(26,54,115,0.035) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(26,54,115,0.035) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "60px 60px",
          }}
        />
        <div className="mx-auto max-w-5xl text-center relative z-[1]">
          <motion.div
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
          >
            <motion.h2
              variants={transformItem}
              className="text-3xl md:text-[2.5rem] font-semibold tracking-tight leading-tight text-[#1a3673]"
            >
              Turn Financial Chaos into Clarity — Instantly
            </motion.h2>
            <motion.p
              variants={transformItem}
              className="mx-auto mt-6 max-w-3xl text-base md:text-lg leading-relaxed text-[rgba(26,54,115,0.72)]"
            >
              Replace weeks of manual financial work with instant, explainable insights. Spend less time in spreadsheets — and more
              time making decisions that matter.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.22 }}
          >
            {[
              {
                title: "10× Faster Reporting",
                sub: "From days → minutes",
              },
              {
                title: "100% Traceable Answers",
                sub: "Every number backed by source data",
              },
              {
                title: "Zero Black-Box Decisions",
                sub: "Full transparency in every model",
              },
            ].map((metric) => (
              <motion.div
                key={metric.title}
                variants={transformItem}
                className="rounded-2xl border border-[rgba(26,54,115,0.1)] bg-white px-5 py-5 shadow-[0_2px_16px_rgba(26,54,115,0.06)]"
              >
                <p className="text-lg font-semibold text-[#1a3673]">{metric.title}</p>
                <p className="mt-1.5 text-sm text-[rgba(26,54,115,0.62)]">{metric.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[rgba(26,54,115,0.12)] bg-[rgba(248,250,253,0.92)] px-6 py-8 shadow-[0_8px_32px_rgba(26,54,115,0.07)]"
          >
            <motion.h3
              variants={transformItem}
              className="text-2xl font-semibold tracking-tight text-[#1a3673] md:text-[1.65rem]"
            >
              Let&apos;s Build Your Financial System
            </motion.h3>
            <motion.p variants={transformItem} className="mt-4 text-sm leading-relaxed text-[rgba(26,54,115,0.68)] md:text-base">
              See your own financial data transformed into insights — live. Ask real questions. Get real answers.
            </motion.p>

            <motion.div
              variants={transformItem}
              className="mt-7 flex flex-col items-center justify-center gap-3.5 sm:flex-row"
            >
              <a
                href="mailto:hello@example.com?subject=Book%20Your%20Live%20Demo"
                className="w-full rounded-xl bg-[#fc7d25] px-7 py-3.5 text-center text-base font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e86f16] sm:w-auto"
              >
                → Book Your Live Demo
              </a>
              <a
                href="#hero-chat"
                className="w-full rounded-xl border border-[rgba(26,54,115,0.14)] bg-white px-7 py-3.5 text-center text-base font-semibold text-[#1a3673] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(252,125,37,0.4)] hover:bg-[rgba(252,125,37,0.06)] sm:w-auto"
              >
                Try a Sample Demo →
              </a>
            </motion.div>

            <motion.p variants={transformItem} className="mt-6 text-xs text-[rgba(26,54,115,0.5)] md:text-sm">
              No setup required • 15-min demo • Works with your existing data
            </motion.p>
          </motion.div>
        </div>
      </section>

      <section
        id="security"
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f7f9fd] px-4 py-24 md:py-28"
      >
        <div className="mx-auto max-w-3xl text-center relative z-[1]">
          <motion.div
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
            className="rounded-[32px] border border-[rgba(26,54,115,0.12)] bg-white p-10 shadow-[0_8px_40px_rgba(26,54,115,0.08)] md:p-14"
          >
            <motion.div
              variants={transformItem}
              className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-[rgba(252,125,37,0.35)] bg-[rgba(252,125,37,0.08)] text-[#fc7d25]"
            >
              <Shield className="h-10 w-10" strokeWidth={1.75} aria-hidden />
            </motion.div>
            <motion.h2
              variants={transformItem}
              className="text-3xl font-semibold tracking-tight text-[#1a3673] md:text-[2.15rem] md:leading-snug"
            >
              Enter Your CFO Workspace
            </motion.h2>
            <motion.p
              variants={transformItem}
              className="mx-auto mt-4 max-w-xl px-2 text-sm leading-relaxed text-[rgba(26,54,115,0.68)] md:text-base"
            >
              Access your dashboards, reports, AI CFO chat, and planning tools in one secure environment.
            </motion.p>
            <motion.div variants={transformItem} className="mx-auto mt-10 flex max-w-sm flex-col gap-3">
              <Link
                to="/login"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-6 py-4 text-[15px] font-semibold text-[#1a3673] shadow-[0_2px_12px_rgba(26,54,115,0.06)] transition-all hover:border-[rgba(26,54,115,0.18)] hover:shadow-[0_6px_20px_rgba(26,54,115,0.1)]"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-[rgba(26,54,115,0.14)] bg-[rgba(248,250,253,0.95)] px-6 py-4 text-[15px] font-semibold text-[#1a3673] transition-all hover:border-[rgba(252,125,37,0.4)] hover:bg-[rgba(252,125,37,0.06)]"
              >
                <Mail className="h-5 w-5 shrink-0 text-[rgba(26,54,115,0.75)]" strokeWidth={1.75} aria-hidden />
                Continue with Email
              </Link>
            </motion.div>
            <motion.p variants={transformItem} className="mt-8 text-xs text-[rgba(26,54,115,0.48)] md:text-sm">
              Secure, encrypted, and built for founders.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[rgba(26,54,115,0.1)] bg-white py-8 text-sm text-[rgba(26,54,115,0.55)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 md:flex-row md:gap-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link to="/" className="flex shrink-0 items-center outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[rgba(252,125,37,0.45)]">
              <img
                src={footerLogo}
                alt="Wyz"
                className="h-9 w-auto max-w-[140px] object-contain object-left sm:h-10 sm:max-w-[160px]"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Link>
            <span className="text-center sm:text-left">© {new Date().getFullYear()}. All rights reserved.</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
            <a
              href="#"
              className="font-medium text-[rgba(26,54,115,0.62)] transition-colors hover:text-[#1a3673]"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="font-medium text-[rgba(26,54,115,0.62)] transition-colors hover:text-[#1a3673]"
            >
              Terms of Service
            </a>
          </nav>
        </div>
      </footer>
    </Background>
  );
}
