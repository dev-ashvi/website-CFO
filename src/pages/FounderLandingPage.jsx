import Background from "../components/Background.jsx";
import Navbar from "../components/Navbar.jsx";
import footerLogo from "../assets/brand/adobe-express-file-1.png";
import wyzCoreLogo from "../assets/brand/adobe-express-file-2.png";
import HeroSection from "../components/HeroSection.jsx";
import WyzAiChatSection from "../components/WyzAiChatSection.jsx";
import ModelingInsightsSection from "../components/ModelingInsightsSection.jsx";
import TrustAccuracySection from "../components/TrustAccuracySection.jsx";
import UseCasesSection from "../components/UseCasesSection.jsx";
import { Fragment } from "react";
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
  Upload,
  Users,
  Wallet,
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
    title: "Manual Bottleneck",
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

const wyzLiteCapabilities = [
  { title: "Upload", Icon: Upload },
  { title: "Insight Engine", Icon: Sparkles },
  { title: "Ask WYZ", Icon: MessageSquare },
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

export default function FounderLandingPage() {
  return (
    <Background>
      <Navbar />
      <HeroSection
        pillTagline="AI Decision Intelligence for Founders"
        heroLine1="Data To Insights To Decisions —"
        heroLine2Accent="Wise Finance For Your Buisness"
        heroSubheading="Financial clarity, business planning and decision making - enabling founders with insights customized for your business"
        ctaButtonLabel="Ask WYZ"
        ctaLinkTo="/early-access"
      />

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
              The problem isn&apos;t the team. It&apos;s the system around them.
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
                      <img
                        src={wyzCoreLogo}
                        alt="Wyz"
                        className="mx-auto mt-2 h-auto w-full max-w-[170px] object-contain md:max-w-[200px]"
                      />
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

                    <div className="mt-5 border-t border-[rgba(26,54,115,0.08)] pt-4">
                      <div className="rounded-xl border border-[rgba(26,54,115,0.08)] bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[#fc7d25]">
                          Wyz Lite
                        </p>
                        <div className="mt-2 flex flex-col items-center gap-1 sm:mt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-1 sm:gap-y-1.5">
                          {wyzLiteCapabilities.map(({ title, Icon }, i) => (
                            <Fragment key={title}>
                              {i > 0 ? (
                                <ChevronRight
                                  size={14}
                                  strokeWidth={2}
                                  className="shrink-0 rotate-90 text-[#1a3673]/45 sm:rotate-0"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] font-medium leading-tight text-[#1a3673]">
                                <Icon
                                  size={14}
                                  strokeWidth={1.75}
                                  className="shrink-0 text-[#1a3673]"
                                  aria-hidden
                                />
                                {title}
                              </span>
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
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

      <ModelingInsightsSection />

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
        className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] px-4 py-24 md:py-28"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-[#fafcfe] to-[#f4f7fc]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          aria-hidden
          style={{
            backgroundImage: [
              "radial-gradient(ellipse 85% 55% at 50% -12%, rgba(252,125,37,0.11), transparent 55%)",
              "radial-gradient(ellipse 70% 45% at 100% 80%, rgba(26,54,115,0.06), transparent 50%)",
              "linear-gradient(rgba(26,54,115,0.032) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(26,54,115,0.032) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "100% 100%, 100% 100%, 60px 60px, 60px 60px",
          }}
        />
        <div className="relative z-[1] mx-auto max-w-5xl text-center">
          <motion.div
            className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6"
            variants={transformStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.22 }}
          >
            {[
              {
                title: "10× faster reporting",
                sub: "Turn days of prep into minutes of answers.",
              },
              {
                title: "Answers you can trace",
                sub: "Every figure linked to its source — no guesswork.",
              },
              {
                title: "Models you can trust",
                sub: "Clear logic and assumptions — nothing hidden.",
              },
            ].map((metric) => (
              <motion.div
                key={metric.title}
                variants={transformItem}
                className="rounded-2xl border border-[rgba(26,54,115,0.1)] bg-white/90 px-5 py-5 shadow-[0_2px_16px_rgba(26,54,115,0.06)] backdrop-blur-[2px] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[rgba(252,125,37,0.28)] hover:shadow-[0_12px_36px_rgba(26,54,115,0.12)]"
              >
                <p className="text-lg font-semibold text-[#1a3673]">{metric.title}</p>
                <p className="mt-1.5 text-sm leading-snug text-[rgba(26,54,115,0.62)]">{metric.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="relative mx-auto mt-14 max-w-2xl md:mt-16 md:max-w-[40rem] md:scale-[1.03]">
            <div
              className="pointer-events-none absolute -inset-6 rounded-[1.75rem] bg-gradient-to-br from-[#fc7d25]/22 via-[#fc7d25]/5 to-[#1a3673]/12 blur-2xl md:-inset-10 md:rounded-[2rem]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-white/60 to-transparent opacity-80 md:rounded-[1.35rem]"
              aria-hidden
            />
            <motion.div
              variants={transformStagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              className="relative rounded-2xl border border-[rgba(26,54,115,0.14)] bg-[rgba(255,255,255,0.97)] px-7 py-9 shadow-[0_4px_6px_rgba(26,54,115,0.04),0_24px_48px_rgba(26,54,115,0.12),0_0_0_1px_rgba(255,255,255,0.8)_inset] md:rounded-[1.35rem] md:px-10 md:py-10 md:shadow-[0_8px_12px_rgba(26,54,115,0.05),0_32px_64px_rgba(26,54,115,0.14),0_0_0_1px_rgba(255,255,255,0.85)_inset]"
            >
              <motion.div variants={transformItem} className="mb-4 flex justify-center md:mb-5">
                <img
                  src={wyzCoreLogo}
                  alt="Wyz logo"
                  className="h-auto w-full max-w-[150px] object-contain md:max-w-[170px]"
                />
              </motion.div>
              <motion.h2
                variants={transformItem}
                className="text-2xl font-semibold tracking-tight text-[#1a3673] md:text-[1.85rem] md:leading-snug"
              >
                See Your Financial System — Live
              </motion.h2>
              <motion.div variants={transformItem} className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-[rgba(26,54,115,0.72)] md:text-base md:leading-relaxed">
                <p>Bring your data. Ask real questions.</p>
                <p className="mt-1">Watch your financial system come to life in minutes.</p>
              </motion.div>

              <motion.div
                variants={transformItem}
                className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row"
              >
                <Link
                  to="/early-access"
                  className="w-full rounded-xl bg-[#fc7d25] px-7 py-3.5 text-center text-base font-semibold text-white shadow-[0_4px_14px_rgba(252,125,37,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e86f16] hover:shadow-[0_8px_24px_rgba(252,125,37,0.4)] sm:w-auto"
                >
                  Get Early Access →
                </Link>
                <a
                  href="#hero-chat"
                  className="hidden w-full rounded-xl border border-[rgba(26,54,115,0.14)] bg-white px-7 py-3.5 text-center text-base font-semibold text-[#1a3673] shadow-[0_2px_8px_rgba(26,54,115,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(252,125,37,0.45)] hover:bg-[rgba(252,125,37,0.06)] sm:w-auto"
                >
                  Explore a Sample →
                </a>
              </motion.div>

              <motion.p variants={transformItem} className="mt-5 text-xs text-[rgba(26,54,115,0.48)] md:text-sm">
                No setup required • 15-min demo • Works with your existing data
              </motion.p>
              <motion.p
                variants={transformItem}
                className="mt-3 text-[13px] font-medium text-[#1a3673] md:text-sm"
              >
                Most teams see value in the first session
              </motion.p>
            </motion.div>
          </div>
        </div>
      </section>

      <section
        id="security"
        className="hidden relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f7f9fd] px-4 py-24 md:py-28"
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
