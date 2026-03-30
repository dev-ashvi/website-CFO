import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  FileText,
  LineChart,
  PieChart,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DecorativeGlow } from "./reference-ui.jsx";
import HeroSignalStrip from "./HeroSignalStrip.jsx";

/** Rotating hint copy for hero input (when empty) */
const PLACEHOLDER_HINTS = [
  "How much runway do I have?",
  "Summarize my MIS",
  "Forecast next 6 months",
  "Why is burn increasing?",
];

const WELCOME_MESSAGE =
  "I can help with MIS insights, runway analysis, budget planning, investor updates, and forecasting. What would you like to explore first?";

const chipPrompts = [
  { label: "Runway Analysis", prompt: "How much runway do I have based on last month's burn?", icon: TrendingUp },
  { label: "MIS Summary", prompt: "Summarize this MIS report for my leadership sync.", icon: FileText },
  { label: "Cash Flow Forecast", prompt: "Build a 6 month cash flow forecast with base and stress cases.", icon: LineChart },
  { label: "Budget Variance", prompt: "Why is our burn increasing vs budget this quarter?", icon: PieChart },
  { label: "Fundraising Prep", prompt: "Prepare investor update highlights from last month's MIS.", icon: Sparkles },
  { label: "Investor Report", prompt: "Draft an investor-ready summary from our latest MIS and runway metrics.", icon: BarChart3 },
];

function replyFor(text) {
  const t = text.toLowerCase();
  if (t.includes("runway")) {
    return "Based on trailing burn and cash on hand, you’re at ~14 months runway (base case). Want a hiring stress test?";
  }
  if (t.includes("mis")) {
    return "MIS snapshot: revenue +12% MoM, margin stable, OPEX up on payroll & infra. I can generate a one-page board summary.";
  }
  if (t.includes("forecast") || t.includes("cash flow")) {
    return "Draft 6-month forecast ready: collections, payroll, and infra mapped. Connect your ledger to tighten timing.";
  }
  if (t.includes("burn") || t.includes("variance")) {
    return "Burn vs budget: engineering +₹4.2L, infra +₹1.1L; marketing flat. I can build a bridge for your next standup.";
  }
  if (t.includes("investor") || t.includes("fundraising")) {
    return "Investor highlights drafted: growth, retention, runway, risks + mitigations. A human CFO can refine tone for your cap table.";
  }
  return "I’ll analyze that against your sources and flag items that need CFO sign-off before you share externally.";
}

/** Faint edge stat cards — ghosted finance UI (lg+), gentle float */
const EdgeStat = ({ label, value, positionClass, floatClass }) => (
  <motion.div
    initial={false}
    className={`pointer-events-none absolute z-20 hidden max-w-[118px] -rotate-1 select-none flex-col rounded-xl border border-white/[0.07] bg-[#0a2048]/18 px-2.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.15)] backdrop-blur-xl motion-reduce:!animate-none lg:flex ${floatClass ?? ""} ${positionClass}`}
  >
    <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#a3b8d7]/45">{label}</p>
    <p className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight text-white/55">{value}</p>
  </motion.div>
);

const HERO_GRAPH_MASK = {
  maskImage:
    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 5%, rgba(0,0,0,0.38) 16%, rgba(0,0,0,0.78) 30%, #000 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 5%, rgba(0,0,0,0.38) 16%, rgba(0,0,0,0.78) 30%, #000 100%)",
};

/** Layered parallax financial signal — 3 depths, one stroke per layer (no near-flat duplicates) */
function HeroLayeredGraph({ className }) {
  const frontLine =
    "M0,266 C260,263 430,96 660,72 C860,58 990,322 1160,302 C1325,286 1490,82 1720,66 C1945,52 2075,312 2260,292 C2335,282 2375,152 2400,128";
  return (
    <div className={className} style={HERO_GRAPH_MASK} aria-hidden>
      <div className="absolute inset-0 opacity-[0.36]">
        <div className="flex h-full w-[200%] motion-safe:animate-graph-parallax-slow motion-reduce:animate-none">
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <path
              d="M0,260 C420,248 860,274 1320,254 C1740,268 2140,252 2400,260"
              fill="none"
              stroke="rgba(100, 140, 205, 0.1)"
              strokeWidth="1.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <path
              d="M0,260 C420,248 860,274 1320,254 C1740,268 2140,252 2400,260"
              fill="none"
              stroke="rgba(100, 140, 205, 0.1)"
              strokeWidth="1.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div className="absolute inset-0 opacity-[0.44]">
        <div className="flex h-full w-[200%] motion-safe:animate-graph-parallax-mid motion-reduce:animate-none">
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <path
              d="M0,272 C340,210 720,308 1060,242 C1380,182 1680,298 1980,248 C2160,218 2300,262 2400,270"
              fill="none"
              stroke="rgba(140, 175, 220, 0.13)"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <path
              d="M0,272 C340,210 720,308 1060,242 C1380,182 1680,298 1980,248 C2160,218 2300,262 2400,270"
              fill="none"
              stroke="rgba(140, 175, 220, 0.13)"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div className="absolute inset-0 opacity-[0.5]">
        <div className="flex h-full w-[200%] motion-safe:animate-graph-parallax-fast motion-reduce:animate-none">
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <defs>
              <linearGradient id="hlg-f-st0" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(130, 168, 228, 0.45)" />
                <stop offset="35%" stopColor="rgba(252, 124, 35, 0.32)" />
                <stop offset="70%" stopColor="rgba(120, 160, 215, 0.4)" />
                <stop offset="100%" stopColor="rgba(163, 184, 215, 0.38)" />
              </linearGradient>
              <radialGradient id="hlg-f-peak0" cx="27%" cy="22%" r="1.8%">
                <stop offset="0%" stopColor="rgba(252, 124, 35, 0.16)" />
                <stop offset="100%" stopColor="rgba(252, 124, 35, 0)" />
              </radialGradient>
              <radialGradient id="hlg-f-peak1" cx="71%" cy="20%" r="1.6%">
                <stop offset="0%" stopColor="rgba(130, 175, 235, 0.14)" />
                <stop offset="100%" stopColor="rgba(130, 175, 235, 0)" />
              </radialGradient>
            </defs>
            <path
              d={frontLine}
              fill="none"
              stroke="url(#hlg-f-st0)"
              strokeWidth="1.55"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="658" cy="74" rx="26" ry="13" fill="url(#hlg-f-peak0)" opacity="0.75" />
            <ellipse cx="1720" cy="68" rx="22" ry="11" fill="url(#hlg-f-peak1)" opacity="0.7" />
          </svg>
          <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 340" preserveAspectRatio="xMidYMax meet">
            <defs>
              <linearGradient id="hlg-f-st1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(130, 168, 228, 0.45)" />
                <stop offset="35%" stopColor="rgba(252, 124, 35, 0.32)" />
                <stop offset="70%" stopColor="rgba(120, 160, 215, 0.4)" />
                <stop offset="100%" stopColor="rgba(163, 184, 215, 0.38)" />
              </linearGradient>
              <radialGradient id="hlg-f-peak0b" cx="27%" cy="22%" r="1.8%">
                <stop offset="0%" stopColor="rgba(252, 124, 35, 0.16)" />
                <stop offset="100%" stopColor="rgba(252, 124, 35, 0)" />
              </radialGradient>
              <radialGradient id="hlg-f-peak1b" cx="71%" cy="20%" r="1.6%">
                <stop offset="0%" stopColor="rgba(130, 175, 235, 0.14)" />
                <stop offset="100%" stopColor="rgba(130, 175, 235, 0)" />
              </radialGradient>
            </defs>
            <path
              d={frontLine}
              fill="none"
              stroke="url(#hlg-f-st1)"
              strokeWidth="1.55"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="658" cy="74" rx="26" ry="13" fill="url(#hlg-f-peak0b)" opacity="0.75" />
            <ellipse cx="1720" cy="68" rx="22" ry="11" fill="url(#hlg-f-peak1b)" opacity="0.7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Slow drifting “data” wave at bottom — very subtle */
function HeroBottomWave({ className }) {
  const wave = (
    <path
      d="M0 78 C140 70 260 84 420 74 C580 66 700 82 860 76 C1020 70 1080 80 1200 76 L1200 120 L0 120 Z"
      fill="url(#heroWaveFill)"
      fillOpacity={0.32}
    />
  );
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div className="flex h-full w-[200%] motion-safe:animate-flow-wave motion-reduce:animate-none">
        <svg className="h-full w-1/2 shrink-0" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroWaveFill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(252, 124, 35, 0.06)" />
              <stop offset="45%" stopColor="rgba(90, 130, 220, 0.07)" />
              <stop offset="100%" stopColor="rgba(163, 184, 215, 0.05)" />
            </linearGradient>
          </defs>
          {wave}
        </svg>
        <svg className="h-full w-1/2 shrink-0" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroWaveFillB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(252, 124, 35, 0.06)" />
              <stop offset="55%" stopColor="rgba(107, 77, 196, 0.05)" />
              <stop offset="100%" stopColor="rgba(163, 184, 215, 0.05)" />
            </linearGradient>
          </defs>
          <path
            d="M0 78 C140 70 260 84 420 74 C580 66 700 82 860 76 C1020 70 1080 80 1200 76 L1200 120 L0 120 Z"
            fill="url(#heroWaveFillB)"
            fillOpacity={0.3}
          />
        </svg>
      </div>
    </div>
  );
}

const TRUST_LINE = "Backed by real CFO expertise + AI intelligence";

const EASE_PREMIUM = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const easePremium = [0.16, 1, 0.3, 1];

const T = {
  main: { duration: 0.48, ease: easePremium },
  heading: { duration: 0.52, ease: easePremium },
  shell: { duration: 0.5, ease: easePremium },
  message: { duration: 0.42, ease: easePremium },
  chip: { duration: 0.38, ease: easePremium },
};

const chipListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { delayChildren: 0.36, staggerChildren: 0.044 },
  },
};

const chipItemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: T.chip },
};

export default function HeroSection() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isChatActive, setIsChatActive] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesScrollRef = useRef(null);
  const inputRef = useRef(null);

  const activateChat = useCallback(() => {
    setIsChatActive(true);
    setMessages((m) => (m.length === 0 ? [{ role: "assistant", text: WELCOME_MESSAGE }] : m));
  }, []);

  useEffect(() => {
    if (!isChatActive || !messagesScrollRef.current) return;
    const el = messagesScrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages, isChatActive]);

  useEffect(() => {
    if (!isChatActive) return;
    const id = window.requestAnimationFrame(() => {
      try {
        inputRef.current?.focus({ preventScroll: true });
      } catch {
        inputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [isChatActive]);

  useEffect(() => {
    if (input.trim() || inputFocused) return;
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_HINTS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [input, inputFocused]);

  const pushDemo = (text) => {
    activateChat();
    setMessages((m) => {
      const base = m.length ? m : [{ role: "assistant", text: WELCOME_MESSAGE }];
      return [...base, { role: "user", text }];
    });
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: replyFor(text) }]);
    }, 550);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    activateChat();
    setMessages((m) => {
      const base = m.length ? m : [{ role: "assistant", text: WELCOME_MESSAGE }];
      return [...base, { role: "user", text: t }];
    });
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: replyFor(t) }]);
    }, 550);
    setInput("");
  };

  const onInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (v.length > 0) activateChat();
  };

  const inputRowClass =
    "group/input-row flex flex-col gap-2 rounded-2xl border border-white/[0.1] bg-[#050b1a]/55 p-1.5 shadow-inner backdrop-blur-sm transition-[box-shadow,border-color,transform] duration-300 ease-out sm:flex-row sm:items-stretch hover:border-white/[0.13] hover:shadow-[0_10px_36px_rgba(0,0,0,0.3)] focus-within:border-white/[0.17] focus-within:shadow-[0_0_0_1px_rgba(252,124,35,0.12),0_16px_52px_rgba(0,0,0,0.38)] focus-within:ring-1 focus-within:ring-[#fc7c23]/22";

  const headingEnter = (delay) => ({
    duration: 0.55,
    ease: easePremium,
    delay: isChatActive ? 0 : delay,
  });

  const inputField = (
    <>
      <div className="flex flex-1 items-center gap-3 rounded-xl bg-transparent pl-2 sm:pl-3 md:pl-4">
        <div
          className="shrink-0 rounded-lg border border-[#fc7c23]/25 bg-[#fc7c23]/10 p-2 text-[#fc7c23] transition-transform duration-300 group-focus-within/input-row:scale-[1.03]"
          aria-hidden
        >
          <Wallet className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="relative min-h-[48px] flex-1 sm:min-h-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={onInputChange}
            onFocus={() => {
              setInputFocused(true);
              activateChat();
            }}
            onBlur={() => setInputFocused(false)}
            placeholder=""
            aria-expanded={isChatActive}
            className="min-h-[48px] w-full bg-transparent py-2.5 text-[15px] text-white caret-[#fc7c23] focus:outline-none sm:min-h-0 sm:py-3.5 sm:text-base"
          />
          {input.length === 0 && (
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex -translate-y-1/2 items-center gap-1.5 overflow-hidden pr-2">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={placeholderIdx}
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4, ease: easePremium }}
                  className="truncate text-[15px] text-[#6b849e] sm:text-base"
                >
                  {PLACEHOLDER_HINTS[placeholderIdx]}
                </motion.span>
              </AnimatePresence>
              {!inputFocused && (
                <span
                  className="motion-safe:animate-caret-blink mb-0.5 inline-block h-[1.05em] w-px shrink-0 bg-[#fc7c23]/40 motion-reduce:hidden"
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>
      </div>
      <button
        type="submit"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#fc7c23] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(252,124,35,0.35)] transition-all duration-300 hover:bg-[#e66c1b] hover:shadow-[0_14px_32px_rgba(252,124,35,0.42)] active:scale-[0.98] sm:py-0"
      >
        Ask CFO AI
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </>
  );

  return (
    <section className="relative z-10 flex flex-col overflow-hidden px-4 pb-2 pt-[calc(10.75rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-4 sm:pt-[calc(11rem+env(safe-area-inset-top,0px))] md:pt-[calc(10.5rem+env(safe-area-inset-top,0px))] lg:pt-[calc(10.25rem+env(safe-area-inset-top,0px))] xl:pt-[calc(10rem+env(safe-area-inset-top,0px))]">
      <div className="pointer-events-none absolute inset-0 h-full w-full bg-gradient-to-b from-[#0d1f45] via-[#0a1635] to-[#061028]" />
      <div
        className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.028]"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.55) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          backgroundRepeat: "repeat",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0.2) 72%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0.2) 72%, transparent 100%)",
        }}
        aria-hidden
      />
      {/* Layered center light + headline halo */}
      <div
        className={`pointer-events-none absolute left-1/2 top-[30%] z-[1] h-[min(100%,620px)] w-[min(100vw,920px)] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.38]" : "opacity-100"}`}
        style={{
          background:
            "radial-gradient(ellipse 72% 58% at 50% 48%, rgba(36, 78, 158, 0.34) 0%, rgba(14, 36, 82, 0.14) 42%, transparent 68%)",
        }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-[36%] z-[1] h-[520px] w-[min(88vw,640px)] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.14]" : "opacity-100"}`}
        aria-hidden
      >
        <div
          className="h-full w-full rounded-full blur-[72px] motion-safe:animate-breathe-glow motion-reduce:animate-none"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(59, 110, 212, 0.45) 0%, rgba(20, 45, 105, 0.18) 38%, transparent 62%)",
          }}
        />
      </div>
      <DecorativeGlow
        color="bg-[#1a3875]"
        className={`top-[22%] left-1/2 h-[580px] w-[900px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.18]" : "opacity-50"}`}
      />
      <DecorativeGlow
        color="bg-[#fc7c23]"
        className={`bottom-[-12%] right-[-6%] h-[460px] w-[540px] transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.05]" : "opacity-[0.16]"}`}
      />
      <DecorativeGlow
        color="bg-[#6b4dc4]"
        className={`bottom-[8%] right-[4%] h-[320px] w-[400px] blur-[110px] transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.04]" : "opacity-[0.12]"}`}
      />
      <HeroLayeredGraph
        className={`pointer-events-none absolute inset-x-0 z-[1] h-[min(52vh,34rem)] max-h-[560px] w-full transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.14]" : "opacity-100"} bottom-[clamp(6.25rem,13.5vh,10.5rem)] sm:bottom-[clamp(6.75rem,14.5vh,11rem)] md:bottom-[clamp(7rem,15vh,11.5rem)]`}
      />
      <HeroBottomWave
        className={`absolute inset-x-0 bottom-0 z-[1] h-[min(5.5rem,11vh)] overflow-hidden transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-[0.32]" : "opacity-100"}`}
      />
      <HeroSignalStrip dimmed={isChatActive} />
      {/* Micro UI fragments — corners, very faint */}
      <div
        className={`pointer-events-none absolute left-[3%] top-[52%] z-[1] hidden h-14 w-[5.5rem] rounded-lg border border-white/[0.05] bg-[#050b1a]/15 blur-[0.5px] transition-opacity duration-700 md:block ${isChatActive ? "opacity-0" : "opacity-[0.35]"}`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute right-[4%] top-[22%] z-[1] hidden h-11 w-20 rounded-md border border-white/[0.04] bg-[#0a2048]/12 transition-opacity duration-700 lg:block ${isChatActive ? "opacity-0" : "opacity-[0.32]"}`}
        aria-hidden
      />

      <div
        className={`pointer-events-none absolute inset-0 mx-auto max-w-[1600px] transition-opacity duration-700 ${EASE_PREMIUM} ${isChatActive ? "opacity-0" : "opacity-100"}`}
      >
        <EdgeStat
          label="Runway"
          value="14.2 mo"
          floatClass="motion-safe:animate-float-edge"
          positionClass="left-[1%] top-[38%] scale-[0.96] opacity-[0.45] lg:left-[3%] xl:left-[4%] xl:opacity-[0.52]"
        />
        <EdgeStat
          label="Cash"
          value="₹2.4 Cr"
          floatClass="motion-safe:animate-float-edge-slow"
          positionClass="right-[1%] top-[40%] scale-[0.96] opacity-[0.45] lg:right-[3%] xl:right-[4%] xl:opacity-[0.52]"
        />
      </div>

      <div className="relative z-30 mx-auto flex min-h-0 w-full max-w-4xl flex-col">
        <div
          className={`flex w-full flex-col transition-transform duration-[900ms] ${EASE_PREMIUM} ${
            isChatActive
              ? "-translate-y-[clamp(8rem,26vh,17rem)]"
              : "translate-y-[clamp(1rem,4vh,2.25rem)] sm:translate-y-[clamp(1.25rem,4.5vh,2.75rem)] md:translate-y-[clamp(1.5rem,5vh,3rem)]"
          }`}
        >
        <motion.div
          className="grid w-full overflow-hidden"
          initial={false}
          animate={{ gridTemplateRows: "1fr" }}
          transition={T.heading}
          aria-hidden={isChatActive}
        >
          <div className="min-h-0">
            <div className="origin-top text-center">
              <motion.div
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs font-semibold tracking-wide text-[#e8eef8] shadow-[0_8px_28px_rgba(0,0,0,0.2)] backdrop-blur-md sm:mb-7"
                initial={{ opacity: 0, y: 14 }}
                animate={
                  isChatActive
                    ? { opacity: 0, y: -26, scale: 0.94 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                transition={headingEnter(0)}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#fc7c23] shadow-[0_0_10px_rgba(252,124,35,0.75)] motion-safe:animate-pulse-soft motion-reduce:animate-none"
                  aria-hidden
                />
                AI + Human CFO Intelligence
              </motion.div>
              <motion.h1
                className="mx-auto max-w-4xl text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-[#f8fafc] sm:text-4xl md:text-5xl lg:text-6xl"
                initial={{ opacity: 0, y: 20 }}
                animate={
                  isChatActive
                    ? { opacity: 0, y: -30, scale: 0.94 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                transition={headingEnter(0.1)}
              >
                Clarity, Control, and Runway —{" "}
                <br className="hidden md:block" />
                <span className="text-transparent bg-gradient-to-r from-[#fc7c23] to-[#ffd2b3] bg-clip-text">Powered by AI + CFO Experts</span>
              </motion.h1>
              <motion.p
                className="mx-auto mt-6 max-w-2xl text-base font-light leading-relaxed text-[#b4c8e8] sm:mt-7 md:mt-6 md:text-lg"
                initial={{ opacity: 0, y: 18 }}
                animate={
                  isChatActive
                    ? { opacity: 0, y: -28, scale: 0.94 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                transition={headingEnter(0.22)}
              >
                Get MIS reports, runway visibility, cash flow forecasts, investor-ready updates, and strategic finance support — through one
                intelligent workspace backed by real CFOs.
              </motion.p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative mx-auto mt-10 w-full max-w-4xl shrink-0 sm:mt-12"
          initial={false}
          animate={{ y: 0 }}
          transition={T.shell}
        >
          <div className="relative h-[min(30rem,46vh)] min-h-[20rem] w-full">
            <motion.div
              id="hero-chat"
              className="absolute left-1/2 top-0 z-40 w-full scroll-mt-28 text-left"
              style={{ x: "-50%" }}
              initial={false}
              animate={{ maxWidth: isChatActive ? "64rem" : "42rem" }}
              transition={{ duration: 0.58, ease: easePremium }}
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-px rounded-t-[28px] bg-gradient-to-r from-transparent via-[#fc7c23]/55 to-transparent transition-opacity duration-500 ${EASE_PREMIUM} ${
                  isChatActive ? "opacity-100" : "opacity-0"
                }`}
              />
              <motion.div
                className="flex overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0a2048]/55 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05] backdrop-blur-2xl md:rounded-[28px]"
                initial={false}
                animate={{ height: isChatActive ? "min(30rem, 46vh)" : "auto" }}
                transition={{ duration: 0.58, ease: easePremium }}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <motion.div
                    className="overflow-hidden"
                    initial={false}
                    animate={{
                      opacity: isChatActive ? 1 : 0,
                      height: isChatActive ? "auto" : 0,
                    }}
                    transition={{ duration: 0.42, delay: isChatActive ? 0.16 : 0, ease: easePremium }}
                  >
                    <div
                      ref={messagesScrollRef}
                      className="max-h-[42vh] overflow-hidden px-3 pt-3 sm:px-4 sm:pt-4 md:px-5"
                    >
                      <div className="space-y-3 sm:space-y-3.5">
                        <AnimatePresence initial={false}>
                          {messages.map((msg, i) => (
                            <motion.div
                              key={`${msg.role}-${i}-${msg.text.slice(0, 12)}`}
                              initial={{ opacity: 0, y: 14 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{
                                ...T.message,
                                delay:
                                  i === 0 && msg.role === "assistant"
                                    ? 0.26
                                    : Math.min(0.06 + i * 0.035, 0.2),
                              }}
                              className={`rounded-2xl border px-3.5 py-3 text-sm leading-relaxed sm:px-4 ${
                                msg.role === "user"
                                  ? "ml-4 border-white/10 bg-white/[0.08] text-white sm:ml-5"
                                  : "mr-2 border-white/[0.06] bg-[#050b1a]/55 text-[#c5d4ec] sm:mr-3"
                              }`}
                            >
                              {msg.text}
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>

                  <motion.form
                    onSubmit={onSubmit}
                    className="relative shrink-0 p-3 sm:p-3.5 md:p-4"
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.38, ease: easePremium }}
                  >
                    <div className={inputRowClass}>{inputField}</div>
                    <p
                      className={`mt-2.5 text-center text-[10px] font-medium tracking-wide transition-opacity duration-400 ${EASE_PREMIUM} md:text-[11px] ${
                        isChatActive ? "text-[#6b849e]/42" : "text-[#6b849e]/55"
                      }`}
                    >
                      {TRUST_LINE}
                    </p>
                  </motion.form>

                  <motion.div
                    className="shrink-0 overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4 md:px-5 md:pb-5"
                    initial={false}
                    animate={{
                      opacity: isChatActive ? 1 : 0,
                      height: isChatActive ? "auto" : 0,
                    }}
                    transition={{ duration: 0.42, delay: isChatActive ? 0.28 : 0, ease: easePremium }}
                  >
                    <motion.div
                      initial="hidden"
                      animate={isChatActive ? "show" : "hidden"}
                      variants={chipListVariants}
                    >
                      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2.5 sm:gap-x-2.5 sm:gap-y-3 md:justify-center">
                        {chipPrompts.map((chip) => (
                          <motion.button
                            key={chip.label}
                            type="button"
                            variants={chipItemVariants}
                            onClick={() => {
                              pushDemo(chip.prompt);
                              try {
                                inputRef.current?.focus({ preventScroll: true });
                              } catch {
                                inputRef.current?.focus();
                              }
                            }}
                            className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-left text-xs font-medium leading-tight text-[#d6e2f5] antialiased transition-[border-color,background-color,color,transform] duration-300 ease-out hover:border-[#fc7c23]/40 hover:bg-white/[0.08] hover:text-white active:scale-[0.98] sm:min-h-0 sm:px-4 sm:py-2 sm:text-[13px] sm:leading-none"
                          >
                            <chip.icon className="h-3.5 w-3.5 shrink-0 text-[#fc7c23]/85 sm:h-[15px] sm:w-[15px]" strokeWidth={2} />
                            <span className="whitespace-normal text-pretty sm:whitespace-nowrap">{chip.label}</span>
                          </motion.button>
                        ))}
                      </div>
                      <motion.p
                        className="mt-4 text-center text-[11px] leading-relaxed text-[#6b849e] sm:text-left md:mt-5"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: isChatActive ? 1 : 0, y: isChatActive ? 0 : 6 }}
                        transition={{ ...T.chip, delay: isChatActive ? 0.42 : 0 }}
                      >
                        To save your workspace:{" "}
                        <Link to="/login" className="font-medium text-[#fc7c23] underline-offset-2 hover:underline">
                          Continue with Google
                        </Link>{" "}
                        or{" "}
                        <Link to="/login" className="font-medium text-[#fc7c23] underline-offset-2 hover:underline">
                          Email
                        </Link>
                        .
                      </motion.p>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
        </div>
      </div>

      <div
        className={`relative z-30 mt-8 grid min-h-[5.5rem] w-full max-w-lg grid-cols-2 gap-3 sm:mx-auto sm:mt-10 sm:max-w-md xl:hidden ${isChatActive ? "invisible pointer-events-none" : ""}`}
      >
        <div className="rounded-xl border border-white/[0.07] bg-[#0a2048]/20 p-3 backdrop-blur-md">
          <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#a3b8d7]/55">Runway</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-white/72">14.2 mo</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0a2048]/20 p-3 backdrop-blur-md">
          <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#a3b8d7]/55">Cash</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-white/72">₹2.4 Cr</p>
        </div>
      </div>
    </section>
  );
}
