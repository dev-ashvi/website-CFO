/**
 * Ambient “live signal” band — graph + scattered pills (2–3 visible at a time).
 */
import { useState, useEffect, useCallback } from "react";

const PILL_SLOTS = [
  { label: "MIS Report", left: "5%", bottom: "3.15rem", rot: "-1deg", floatDelay: "0s" },
  { label: "Runway Analysis", left: "22%", bottom: "0.92rem", rot: "0.7deg", floatDelay: "-1.1s" },
  { label: "Cash Flow Forecast", left: "40%", bottom: "2.72rem", rot: "-0.5deg", floatDelay: "-2.3s" },
  { label: "Budget vs Actual", left: "56%", bottom: "0.42rem", rot: "1.1deg", floatDelay: "-0.55s" },
  { label: "Investor Update", left: "72%", bottom: "2.18rem", rot: "-0.65deg", floatDelay: "-3.4s" },
  { label: "Variance Analysis", left: "86%", bottom: "1.22rem", rot: "0.45deg", floatDelay: "-1.8s" },
];

const PILL_EXTRA_LG = [
  { label: "Board Summary", left: "13%", bottom: "0.38rem", rot: "0.85deg", floatDelay: "-2.8s" },
  { label: "Fundraising Prep", left: "59%", bottom: "1.02rem", rot: "-0.9deg", floatDelay: "-0.9s" },
  { label: "Working Capital", left: "31%", bottom: "0.18rem", rot: "-0.35deg", floatDelay: "-4.2s" },
  { label: "Monthly KPI Pack", left: "79%", bottom: "3.05rem", rot: "0.55deg", floatDelay: "-2s" },
];

const PILL_MOBILE = [
  { ...PILL_SLOTS[0], left: "4%", bottom: "2.55rem", floatDelay: "0s" },
  { ...PILL_SLOTS[2], left: "50%", bottom: "0.48rem", floatDelay: "-1.5s" },
  { ...PILL_SLOTS[4], left: "82%", bottom: "2.05rem", floatDelay: "-3s" },
];

const ROTATE_MS = 4800;

function poolForWidth(w) {
  if (w < 640) return PILL_MOBILE;
  if (w < 1024) return PILL_SLOTS;
  return [...PILL_SLOTS, ...PILL_EXTRA_LG];
}

function pickVisibleLabels(pool, width) {
  const cap = width < 640 ? 2 : 2 + Math.floor(Math.random() * 2);
  const n = Math.min(cap, pool.length);
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return new Set(idx.slice(0, n).map((i) => pool[i].label));
}

function SignalGraphPaths({ idPrefix }) {
  const gf = `${idPrefix}-stroke`;
  return (
    <>
      <defs>
        <linearGradient id={gf} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(163, 184, 215, 0.1)" />
          <stop offset="45%" stopColor="rgba(252, 124, 35, 0.08)" />
          <stop offset="100%" stopColor="rgba(163, 184, 215, 0.09)" />
        </linearGradient>
      </defs>
      <path
        d="M0,62 C320,54 520,64 780,58 C1040,52 1280,62 1520,56 C1760,58 1980,54 2400,60"
        fill="none"
        stroke={`url(#${gf})`}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ReportPill({ label }) {
  return (
    <div className="max-w-[8.75rem] rounded-full border border-white/[0.07] bg-[#050b1a]/75 px-2 py-1 shadow-[0_4px_18px_rgba(0,0,0,0.22)] backdrop-blur-md sm:max-w-[10.5rem] sm:px-2.5 sm:py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1 w-1 shrink-0 rounded-full bg-[#fc7c23]/80 shadow-[0_0_5px_rgba(252,124,35,0.3)]"
          aria-hidden
        />
        <span className="truncate text-[9px] font-medium uppercase tracking-[0.12em] text-[#c5d4ec]/72 sm:text-[10px] sm:tracking-[0.14em]">
          {label}
        </span>
      </div>
    </div>
  );
}

function FloatingPill({ left, bottom, rot, floatDelay, label, visible }) {
  return (
    <div className="absolute" style={{ left, bottom }}>
      <div
        className={`hero-signal-pill-wrap transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          visible ? "pointer-events-none opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          transform: visible ? "translateY(0)" : "translateY(8px)",
        }}
      >
        <div className="hero-signal-float will-change-transform" style={{ animationDelay: floatDelay }}>
          <div
            className="hero-signal-pill origin-bottom"
            style={{ "--pill-rot": rot }}
          >
            <ReportPill label={label} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeroSignalStrip({ dimmed = false }) {
  const opacityWrap = dimmed ? "opacity-[0.26]" : "opacity-100";
  const [visibleLabels, setVisibleLabels] = useState(() => new Set());

  const refreshVisible = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window.innerWidth;
    setVisibleLabels(pickVisibleLabels(poolForWidth(w), w));
  }, []);

  useEffect(() => {
    refreshVisible();
    const id = window.setInterval(refreshVisible, ROTATE_MS);
    window.addEventListener("resize", refreshVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", refreshVisible);
    };
  }, [refreshVisible]);

  return (
    <>
      <style>{`
        @keyframes hero-signal-float {
          0%, 100% { transform: translateY(2px); }
          50% { transform: translateY(-4px); }
        }
        .hero-signal-float {
          display: inline-block;
        }
        @media (prefers-reduced-motion: no-preference) {
          .hero-signal-float {
            animation: hero-signal-float 6.25s cubic-bezier(0.42, 0, 0.58, 1) infinite;
          }
        }
        .hero-signal-pill {
          display: inline-block;
          transform: translate(-50%, 0) rotate(var(--pill-rot, 0deg));
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-signal-float { animation: none !important; transform: none; }
        }
      `}</style>
      <div
        className={`pointer-events-none absolute inset-x-0 z-[4] transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:opacity-[0.35] ${opacityWrap}`}
        style={{
          bottom: "clamp(9.5rem, 16vh, 13.5rem)",
        }}
        aria-hidden
      >
        <div className="relative mx-auto min-h-[4.5rem] max-w-[min(100%,1420px)] px-1 sm:min-h-[5.35rem] sm:px-3">
          <div className="absolute inset-x-0 bottom-0 h-[2.35rem] overflow-hidden sm:h-[2.55rem]">
            <div className="flex h-full w-[200%] motion-safe:animate-signal-flow motion-reduce:animate-none">
              <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 88" preserveAspectRatio="xMidYMax meet">
                <SignalGraphPaths idPrefix="hsA" />
              </svg>
              <svg className="h-full w-1/2 shrink-0" viewBox="0 0 2400 88" preserveAspectRatio="xMidYMax meet">
                <SignalGraphPaths idPrefix="hsB" />
              </svg>
            </div>
          </div>

          <div className="relative mx-auto min-h-[4.35rem] w-full max-w-6xl sm:min-h-[5.15rem]">
            <div className="sm:hidden">
              {PILL_MOBILE.map((p) => (
                <FloatingPill
                  key={p.label}
                  left={p.left}
                  bottom={p.bottom}
                  rot={p.rot}
                  floatDelay={p.floatDelay}
                  label={p.label}
                  visible={visibleLabels.has(p.label)}
                />
              ))}
            </div>
            <div className="hidden sm:contents">
              {PILL_SLOTS.map((p) => (
                <FloatingPill
                  key={p.label}
                  left={p.left}
                  bottom={p.bottom}
                  rot={p.rot}
                  floatDelay={p.floatDelay}
                  label={p.label}
                  visible={visibleLabels.has(p.label)}
                />
              ))}
            </div>
            <div className="hidden lg:contents">
              {PILL_EXTRA_LG.map((p) => (
                <FloatingPill
                  key={p.label}
                  left={p.left}
                  bottom={p.bottom}
                  rot={p.rot}
                  floatDelay={p.floatDelay}
                  label={p.label}
                  visible={visibleLabels.has(p.label)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
