import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  FileText,
  Gauge,
  GitBranch,
  Landmark,
  LineChart,
  Target,
  Users,
  Wallet,
} from "lucide-react";

const modelingModules = [
  {
    id: "daily-pulse",
    title: "Daily Pulse & Weekly Scorecard",
    question: "What's happening? What's the trend?",
    Icon: Activity,
  },
  {
    id: "monthly-mis",
    title: "Monthly MIS",
    question: "How did the month actually go?",
    Icon: FileText,
  },
  {
    id: "pl",
    title: "Profit & Loss Statement",
    question: "What is the actual business performance?",
    Icon: LineChart,
  },
  {
    id: "cash-runway",
    title: "Cash & Runway Management",
    question: "How much cash do you have, where is it going, and how long does it last?",
    Icon: Wallet,
  },
  {
    id: "raise-ready",
    title: "Raise-Ready Score",
    question: "Am I fundable right now?",
    Icon: Gauge,
  },
  {
    id: "unit-econ",
    title: "Unit Economics & Cohorts",
    question: "Which channel, which cohort worked well?",
    Icon: Users,
  },
  {
    id: "scenario",
    title: "Scenario Planning",
    question: "What happens if you hire two people, double your ad spend?",
    Icon: GitBranch,
  },
  {
    id: "forecast",
    title: "Forecast vs Reality",
    question: "What are your variance, where are you on track versus drifting?",
    Icon: BarChart3,
  },
  {
    id: "capital",
    title: "Capital Strategy",
    question: "Are your financials good to raise debt or equity?",
    Icon: Landmark,
  },
  {
    id: "all-in-one",
    title: "All-in-One View",
    question: "Comprehensive view for all decisions",
    Icon: Target,
  },
];

const LEFT_COUNT = 5;
const leftModules = modelingModules.slice(0, LEFT_COUNT);
const rightModules = modelingModules.slice(LEFT_COUNT);

const miniKpis = [
  { label: "Revenue", value: "↑ 12%", accent: false },
  { label: "EBITDA", value: "↓ 18%", accent: true },
  { label: "Runway", value: "14.2 mo", accent: false },
];

const centerFeatureChips = ["Live Financial Model", "Real-time Insights", "Decision Intelligence"];

function WyzIntelligenceGraph({ activeIndex }) {
  const vizPrimary = activeIndex % 2 === 0;
  const vizSecondary = activeIndex % 3 !== 2;
  const vizArea = activeIndex % 2 === 0;
  const vizAccent = activeIndex % 3 === 1 || activeIndex === 4;

  return (
    <div className="relative h-[148px] w-full rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f9fbff] px-2 py-1.5 opacity-[0.97] md:h-[158px]">
      <svg viewBox="0 0 320 190" className="h-full w-full opacity-[0.92]" aria-hidden>
        <defs>
          <linearGradient id="modelingAreaInsight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(252,125,37,0.18)" />
            <stop offset="100%" stopColor="rgba(252,125,37,0.02)" />
          </linearGradient>
        </defs>
        <g>
          {[30, 70, 110, 150].map((y) => (
            <line
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
          className={vizPrimary ? "opacity-100" : "opacity-60"}
          style={{
            strokeDasharray: 360,
            strokeDashoffset: 0,
            animation: vizPrimary ? "modeling-core-line 3.2s ease-out forwards" : undefined,
          }}
        />
        <path
          d="M26 152 C 70 150 96 144 128 138 C 156 132 188 122 220 120 C 248 118 278 122 306 118"
          fill="none"
          stroke="rgba(26,54,115,0.22)"
          strokeWidth="1.4"
          className={vizSecondary ? "opacity-100" : "opacity-50"}
          style={{
            strokeDasharray: 340,
            strokeDashoffset: 0,
            animation: vizSecondary ? "modeling-secondary-line 3.4s ease-out 0.15s forwards" : undefined,
          }}
        />
        <path
          d="M26 132 C 72 120 108 116 140 110 C 176 104 204 98 232 90 C 256 84 282 80 306 76"
          fill="url(#modelingAreaInsight)"
          stroke="none"
          className={vizArea ? "opacity-95" : "opacity-50"}
        />
        <path
          d="M226 92 C 238 88 248 86 260 84 C 272 82 288 80 306 78"
          fill="none"
          stroke="rgba(252,125,37,0.7)"
          strokeWidth="1.4"
          strokeDasharray="4 4"
          className={vizAccent ? "opacity-100 drop-shadow-sm" : "opacity-30"}
        />
        <path
          d="M26 132 C 72 120 108 116 140 110 C 176 104 204 98 232 90 C 256 84 282 80 306 76"
          fill="none"
          stroke="#fc7d25"
          strokeWidth="2.2"
          strokeLinecap="round"
          className={vizPrimary ? "opacity-100" : "opacity-60"}
          style={{
            strokeDasharray: 360,
            strokeDashoffset: 0,
            filter: vizPrimary ? "drop-shadow(0 0 6px rgba(252,125,37,0.55))" : "none",
            animation: vizPrimary ? "modeling-primary-line 3s ease-out forwards" : undefined,
          }}
        />
        <circle cx="226" cy="92" r="3.3" fill="#fc7d25" style={{ animation: "modeling-point-pulse 3.4s ease-in-out infinite" }} />
        <circle cx="262" cy="84" r="2.6" fill="#1a3673" style={{ animation: "modeling-point-pulse 3.6s ease-in-out 0.4s infinite" }} />
        <circle cx="196" cy="104" r="2.4" fill="rgba(26,54,115,0.85)" style={{ animation: "modeling-point-pulse 3.8s ease-in-out 0.8s infinite" }} />
        <rect x="26" y="22" width="168" height="48" rx="6" fill="white" stroke="rgba(26,54,115,0.14)" strokeWidth="1" />
        <text x="36" y="38" fontSize="9" fill="#1a3673" fontFamily="system-ui, sans-serif" fontWeight="600">
          EBITDA ↓ 18%
        </text>
        <text x="36" y="52" fontSize="8" fill="#fc7d25" fontFamily="system-ui, sans-serif" fontWeight="600">
          ↑ 32% spend
        </text>
        <rect x="176" y="128" width="118" height="36" rx="5" fill="white" stroke="rgba(26,54,115,0.14)" strokeWidth="1" />
        <text x="184" y="142" fontSize="8" fill="#1a3673" fontFamily="system-ui, sans-serif" fontWeight="600">
          Runway
        </text>
        <text x="184" y="156" fontSize="8" fill="#fc7d25" fontFamily="system-ui, sans-serif" fontWeight="600">
          14.2 mo
        </text>
      </svg>
    </div>
  );
}

function WyzIntelligenceCenter({ activeIndex, centerRef }) {
  return (
    <div
      ref={centerRef}
      className="relative mx-auto w-full max-w-[340px] lg:max-w-none lg:w-full lg:scale-[1.04] lg:origin-center"
    >
      <div
        className="pointer-events-none absolute -inset-10 rounded-[2rem]"
        style={{
          background: "radial-gradient(ellipse at center, rgba(26,54,115,0.04), transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative rounded-[1.35rem] border border-[rgba(26,54,115,0.16)] bg-white p-3 shadow-[0_20px_56px_rgba(26,54,115,0.14),0_8px_24px_rgba(26,54,115,0.08)] md:p-3.5">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold tracking-tight text-[#1a3673] md:text-[15px]">
            WYZ Intelligence Layer
          </h3>
          <p className="mt-0.5 text-[10px] leading-[1.3] text-[rgba(26,54,115,0.58)] md:text-[11px]">
            Connecting P&amp;L, cash, runway, cohorts and scenarios
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[rgba(26,54,115,0.65)]">
            Live
          </span>
          <span className="rounded-full bg-[rgba(252,125,37,0.08)] px-1.5 py-0.5 text-[8px] font-medium text-[#c55a12]">
            Forecast
          </span>
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {miniKpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-[rgba(26,54,115,0.1)] bg-[#f9fbff] px-1.5 py-1.5 text-center"
            >
              <p className="text-[8px] font-medium text-[rgba(26,54,115,0.5)]">{k.label}</p>
              <p className={`text-[10px] font-bold leading-[1.25] ${k.accent ? "text-[#fc7d25]" : "text-[#1a3673]"}`}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {centerFeatureChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[rgba(26,54,115,0.1)] bg-[#f7f9fd] px-2 py-0.5 text-[9px] font-medium text-[rgba(26,54,115,0.7)]"
            >
              {chip}
            </span>
          ))}
        </div>

        <div className="mt-2">
          <WyzIntelligenceGraph activeIndex={activeIndex} />
        </div>

        <div className="mt-2 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#fafcfe] px-3 py-2 shadow-[0_0_16px_rgba(252,125,37,0.08)]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#fc7d25]">AI Insight</p>
          <ul className="mt-1 space-y-0.5 text-[10px] leading-[1.35] text-[#64748B]">
            <li>
              EBITDA <span className="font-semibold text-[#fc7d25]">↓36%</span>
            </li>
            <li>
              Hiring cost <span className="font-semibold text-[#fc7d25]">↑₹1.8 Cr</span>
            </li>
            <li>Action: Review headcount efficiency</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const MODULE_CARD_HEIGHT = "h-[82px]";

function ModuleCard({ item, moduleIndex, isActive, onActivate, cardRef }) {
  const { Icon } = item;

  return (
    <li className={`shrink-0 ${MODULE_CARD_HEIGHT}`}>
      <button
        type="button"
        ref={cardRef}
        onMouseEnter={() => onActivate(moduleIndex)}
        onFocus={() => onActivate(moduleIndex)}
        onClick={() => onActivate(moduleIndex)}
        className={`group flex h-full w-full items-center gap-3 overflow-hidden rounded-xl border border-[rgba(26,54,115,0.1)] bg-white py-2 pl-3 pr-3.5 text-left transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(252,125,37,0.2)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f7fb] lg:py-2.5 lg:pl-3.5 lg:pr-4 ${
          isActive
            ? "scale-[1.01] border-l-2 border-l-[#fc7d25] bg-[rgba(255,106,0,0.03)] shadow-[0_6px_20px_rgba(255,106,0,0.06)]"
            : "border-l-2 border-l-[rgba(26,54,115,0.12)] shadow-[0_2px_10px_rgba(26,54,115,0.05)] hover:border-[rgba(26,54,115,0.14)] hover:bg-[rgba(26,54,115,0.02)] hover:shadow-[0_4px_14px_rgba(26,54,115,0.08)]"
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ease-out lg:h-8 lg:w-8 ${
            isActive
              ? "bg-[rgba(255,106,0,0.1)] text-[#fc7d25]"
              : "bg-[rgba(26,54,115,0.05)] text-[rgba(26,54,115,0.45)] group-hover:bg-[rgba(26,54,115,0.07)] group-hover:text-[#1A3673]"
          }`}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
        </span>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-[1.3] tracking-tight text-[#1A3673]">
            {item.title}
          </h3>
          <p className="mt-1 line-clamp-2 max-w-[90%] text-[13px] font-normal leading-[1.3] text-[#64748B]">
            {item.question}
          </p>
        </div>
      </button>
    </li>
  );
}

function FlowConnectors({ activeIndex, layoutRef, centerRef, leftRefs, rightRefs }) {
  const [segments, setSegments] = useState([]);

  const updatePaths = useCallback(() => {
    const layout = layoutRef.current;
    const center = centerRef.current;
    if (!layout || !center) return;

    const layoutRect = layout.getBoundingClientRect();
    const centerRect = center.getBoundingClientRect();
    const centerLeft = centerRect.left - layoutRect.left;
    const centerRight = centerRect.right - layoutRect.left;
    const centerMidY = centerRect.top - layoutRect.top + centerRect.height / 2;

    const next = [];

    leftRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const y = r.top - layoutRect.top + r.height / 2;
      const x1 = r.right - layoutRect.left;
      const cx = (x1 + centerLeft) / 2;
      const cy = (y + centerMidY) / 2;
      next.push({
        key: `l-${i}`,
        moduleIndex: i,
        d: `M ${x1} ${y} Q ${cx} ${cy} ${centerLeft} ${centerMidY}`,
        delay: `${i * 0.45}s`,
      });
    });

    rightRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const y = r.top - layoutRect.top + r.height / 2;
      const x1 = r.left - layoutRect.left;
      const moduleIndex = i + LEFT_COUNT;
      const cx = (centerRight + x1) / 2;
      const cy = (y + centerMidY) / 2;
      next.push({
        key: `r-${i}`,
        moduleIndex,
        d: `M ${centerRight} ${centerMidY} Q ${cx} ${cy} ${x1} ${y}`,
        delay: `${moduleIndex * 0.45}s`,
      });
    });

    setSegments(next);
  }, [layoutRef, centerRef, leftRefs, rightRefs]);

  useLayoutEffect(() => {
    updatePaths();
    window.addEventListener("resize", updatePaths);
    return () => window.removeEventListener("resize", updatePaths);
  }, [updatePaths, activeIndex]);

  if (!segments.length) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block" aria-hidden>
      {segments.map((seg) => {
        const on = activeIndex === seg.moduleIndex;
        return (
          <g key={seg.key} opacity={on ? 0.35 : 0.18}>
            <path
              d={seg.d}
              fill="none"
              stroke={on ? "#fc7d25" : "#1a3673"}
              strokeWidth={on ? 1.25 : 1}
              strokeDasharray="5 7"
              strokeLinecap="round"
              className={on ? "map-connector-active" : ""}
            />
            <circle r="2.5" fill="#fc7d25">
              <animateMotion dur="5.5s" repeatCount="indefinite" path={seg.d} begin={seg.delay} />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export default function ModelingInsightsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const layoutRef = useRef(null);
  const centerRef = useRef(null);
  const leftRefs = useRef([]);
  const rightRefs = useRef([]);

  return (
    <section
      id="modeling"
      className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f5f7fb] py-16 md:py-20 lg:py-14 px-4"
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
        @keyframes modeling-point-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes map-dash-flow {
          to { stroke-dashoffset: -24; }
        }
        .map-connector-active {
          animation: map-dash-flow 2s linear infinite;
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
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-[2.15rem] font-semibold tracking-tight text-[#1a3673]">
            Financial Modeling &amp; Insights
          </h2>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-[rgba(26,54,115,0.7)]">
            From data → models → decisions.
          </p>
        </div>

        <div ref={layoutRef} className="relative mt-6 md:mt-8 lg:mt-8">
          <FlowConnectors
            activeIndex={activeIndex}
            layoutRef={layoutRef}
            centerRef={centerRef}
            leftRefs={leftRefs}
            rightRefs={rightRefs}
          />

          <div className="relative z-[1] grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,370px)_minmax(0,1fr)] lg:items-center lg:gap-x-2 xl:gap-x-3">
            <ul className="order-1 mx-auto flex w-full max-w-[96%] flex-col gap-3 lg:order-none lg:mx-0 lg:max-w-none lg:gap-3 lg:pr-0">
              {leftModules.map((item, idx) => (
                <ModuleCard
                  key={item.id}
                  item={item}
                  moduleIndex={idx}
                  isActive={activeIndex === idx}
                  onActivate={setActiveIndex}
                  cardRef={(el) => {
                    leftRefs.current[idx] = el;
                  }}
                />
              ))}
            </ul>

            <div className="order-2 z-[2] flex flex-col lg:order-none">
              <WyzIntelligenceCenter activeIndex={activeIndex} centerRef={centerRef} />
            </div>

            <ul className="order-3 mx-auto flex w-full max-w-[96%] flex-col gap-3 lg:order-none lg:mx-0 lg:max-w-none lg:gap-3 lg:pl-0">
              {rightModules.map((item, idx) => {
                const moduleIndex = idx + LEFT_COUNT;
                return (
                  <ModuleCard
                    key={item.id}
                    item={item}
                    moduleIndex={moduleIndex}
                    isActive={activeIndex === moduleIndex}
                    onActivate={setActiveIndex}
                    cardRef={(el) => {
                      rightRefs.current[idx] = el;
                    }}
                  />
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
