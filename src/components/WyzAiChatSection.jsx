import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Bot, GitBranch, LineChart, Link2, Send, Sparkles, Users } from "lucide-react";
import wyzChatLogo from "../../dist/assets/Adobe Express - file (2) - Copy.png";

/** Segment: plain text or highlighted metric (orange) */
const h = (t) => ({ t, h: true });
const t = (s) => ({ t: s, h: false });

const WYZ_CHAT_DEMOS = [
  {
    question: "What is my EBITDA for the last 12 months?",
    answerLines: [
      [h("₹4.2 Cr"), t(" — down "), h("18%"), t(" YoY.")],
      [t("Primary drivers: marketing spend increased "), h("32%"), t(", while revenue grew "), h("9%"), t(".")],
      [t("EBITDA margin: "), h("14.8%")],
    ],
    sources: ["QuickBooks", "Bank feeds", "CRM data"],
    highlightCapability: "Traceable Answers",
  },
  {
    question: "If I hire 10 more engineers next quarter, what happens to runway?",
    answerLines: [
      [t("Hiring "), h("10"), t(" engineers at avg. "), h("₹18L/yr"), t(" adds "), h("₹1.5 Cr"), t(" annual burn.")],
      [t("Current runway of "), h("18 months"), t(" drops to "), h("~14.2 months"), t(".")],
      [t("If the team contributes "), h("₹2 Cr ARR"), t(", payback begins around "), h("month 9"), t(".")],
    ],
    sources: ["Headcount plan", "Payroll assumptions", "Revenue forecast model"],
    highlightCapability: "What-If Simulation",
  },
  {
    question: "Why did burn increase in March?",
    answerLines: [
      [t("Burn increased "), h("11.6%"), t(" MoM driven by:")],
      [t("• hiring costs up "), h("₹22L")],
      [t("• paid acquisition up "), h("₹14L")],
      [t("• vendor spend up "), h("₹6L")],
      [t("Largest change came from new engineering hires onboarded mid-month.")],
    ],
    sources: ["Payroll ledger", "Marketing spend", "Vendor payments"],
    highlightCapability: "Driver-Level Insights",
  },
];

const SUGGESTED_PROMPTS = [
  "What is my runway at current burn?",
  "Why did burn increase in March?",
  "Forecast next 6 months with current hiring plan",
];

const CAPABILITIES = [
  { title: "Traceable Answers", Icon: Link2 },
  { title: "Driver-Level Insights", Icon: GitBranch },
  { title: "What-If Simulation", Icon: LineChart },
  { title: "Role-Based Views", Icon: Users },
];

const headingStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.06 } },
};
const headingItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const CHAR_MS = 28;
const CHAR_SPACE_MS = 22;
const THINKING_MS = 900;
const LINE_REVEAL_MS = 580;
const SOURCES_AFTER_MS = 420;
const HOLD_MS = 2800;
const FADE_OUT_MS = 480;
const START_GAP_MS = 260;

function useSchedule() {
  const idsRef = useRef([]);
  const clear = useCallback(() => {
    idsRef.current.forEach((id) => window.clearTimeout(id));
    idsRef.current = [];
  }, []);
  const schedule = useCallback(
    (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      idsRef.current.push(id);
      return id;
    },
    [],
  );
  return { clear, schedule };
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 py-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#1a3673]/35"
          animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function WyzAiChatSection() {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { amount: 0.12, once: false });
  const { clear, schedule } = useSchedule();

  const [demoIndex, setDemoIndex] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [typedLen, setTypedLen] = useState(0);
  const [answerLinesShown, setAnswerLinesShown] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [showCtas, setShowCtas] = useState(false);
  /** Only the message thread fades between demos; chrome stays visible */
  const [threadOpacity, setThreadOpacity] = useState(1);
  const loopGenerationRef = useRef(0);
  const threadScrollRef = useRef(null);

  const demo = WYZ_CHAT_DEMOS[demoIndex];

  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [typedLen, answerLinesShown, showSources, showCtas, phase, demoIndex, threadOpacity]);

  const runDemo = useCallback(
    (index, gen) => {
      const d = WYZ_CHAT_DEMOS[index];
      if (!d) return;

      setDemoIndex(index);
      setPhase("typing");
      setTypedLen(0);
      setAnswerLinesShown(0);
      setShowSources(false);
      setShowCtas(false);

      let pos = 0;
      const typeStep = () => {
        if (loopGenerationRef.current !== gen) return;
        if (pos < d.question.length) {
          pos += 1;
          setTypedLen(pos);
          const ch = d.question[pos - 1];
          schedule(typeStep, ch === " " ? CHAR_SPACE_MS : CHAR_MS);
        } else {
          setPhase("thinking");
          schedule(() => {
            if (loopGenerationRef.current !== gen) return;
            setPhase("answer");
            const revealLine = (lineIdx) => {
              if (loopGenerationRef.current !== gen) return;
              if (lineIdx < d.answerLines.length) {
                setAnswerLinesShown(lineIdx + 1);
                schedule(() => revealLine(lineIdx + 1), LINE_REVEAL_MS);
              } else {
                schedule(() => {
                  if (loopGenerationRef.current !== gen) return;
                  setPhase("sources");
                  setShowSources(true);
                  schedule(() => {
                    if (loopGenerationRef.current !== gen) return;
                    setShowCtas(true);
                    setPhase("hold");
                    schedule(() => {
                      if (loopGenerationRef.current !== gen) return;
                      setPhase("transition");
                      setThreadOpacity(0);
                      schedule(() => {
                        if (loopGenerationRef.current !== gen) return;
                        runDemo((index + 1) % WYZ_CHAT_DEMOS.length, gen);
                        schedule(() => setThreadOpacity(1), 48);
                      }, FADE_OUT_MS);
                    }, HOLD_MS);
                  }, SOURCES_AFTER_MS);
                }, 200);
              }
            };
            revealLine(0);
          }, THINKING_MS);
        }
      };
      schedule(typeStep, START_GAP_MS);
    },
    [schedule],
  );

  useEffect(() => {
    if (!inView) {
      clear();
      loopGenerationRef.current += 1;
      setPhase("idle");
      setTypedLen(0);
      setAnswerLinesShown(0);
      setShowSources(false);
      setShowCtas(false);
      setThreadOpacity(1);
      return;
    }
    const gen = ++loopGenerationRef.current;
    clear();
    runDemo(0, gen);
    return () => {
      loopGenerationRef.current += 1;
      clear();
    };
  }, [inView, clear, runDemo]);

  const showAssistantShell =
    phase !== "idle" && phase !== "typing" && typedLen >= (WYZ_CHAT_DEMOS[demoIndex]?.question.length ?? 0);
  const questionFull = Boolean(demo && typedLen >= demo.question.length);

  return (
    <section
      ref={sectionRef}
      id="wyz-ai-chat"
      className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-white py-24 md:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: [
            "linear-gradient(rgba(26,54,115,0.03) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(26,54,115,0.03) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "52px 52px",
        }}
      />
      <div className="relative z-[1] mx-auto max-w-4xl px-4">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          variants={headingStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.h2
            variants={headingItem}
            className="text-3xl font-semibold tracking-tight text-[#1a3673] md:text-[2.05rem] md:leading-snug"
          >
            Ask anything. Get instant financial clarity.
          </motion.h2>
          <motion.p
            variants={headingItem}
            className="mt-4 text-base leading-relaxed text-[rgba(26,54,115,0.7)] md:text-lg"
          >
            Wyz turns your financial data into answers you can trust — grounded in real numbers, not assumptions.
          </motion.p>
        </motion.div>

        <motion.div
          className="relative mx-auto mt-12 max-w-2xl md:mt-14"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="pointer-events-none absolute -inset-3 rounded-[28px] bg-gradient-to-br from-[#1a3673]/[0.07] via-transparent to-[#fc7d25]/[0.1] blur-2xl"
            aria-hidden
          />
          <div className="relative overflow-hidden rounded-2xl border border-[rgba(26,54,115,0.11)] bg-white/85 shadow-[0_24px_56px_rgba(26,54,115,0.1),0_0_0_1px_rgba(255,255,255,0.65)_inset] backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-[rgba(26,54,115,0.08)] bg-[rgba(248,250,252,0.75)] px-4 py-3 md:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={wyzChatLogo}
                  alt="Wyz logo"
                  className="h-9 w-auto shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1a3673]">Wyz</p>
                  <p className="truncate text-[11px] text-[rgba(26,54,115,0.55)]">Financial intelligence · live</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 rounded-full border border-[rgba(26,54,115,0.1)] bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[rgba(26,54,115,0.55)]">
                Data-backed
              </span>
            </div>

            <motion.div
              className="min-h-0"
              animate={{ opacity: threadOpacity }}
              transition={{ duration: FADE_OUT_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                ref={threadScrollRef}
                className="h-[min(21rem,44vh)] overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-color:rgba(26,54,115,0.28)_transparent] [scrollbar-width:thin] sm:h-[22rem] md:h-[23rem]"
              >
                <div className="space-y-4 px-4 py-5 md:px-6 md:py-6">
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md border border-[rgba(26,54,115,0.08)] bg-[#f8fafc] px-4 py-3 text-left shadow-sm">
                <p className="min-h-[1.4rem] text-[13px] font-medium leading-relaxed text-[#1a3673] md:text-sm">
                  {demo.question.slice(0, typedLen)}
                  {phase === "typing" && typedLen < demo.question.length ? (
                    <span
                      className="ml-0.5 inline-block h-[0.95em] w-px translate-y-px animate-pulse bg-[#1a3673]/45 align-middle"
                      aria-hidden
                    />
                  ) : null}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {showAssistantShell ? (
                  <motion.div
                    key={`${demoIndex}-assistant`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="max-w-[96%] rounded-2xl rounded-tl-md border border-[rgba(252,125,37,0.2)] bg-gradient-to-b from-white to-[rgba(252,125,37,0.04)] px-4 py-3.5 shadow-[0_4px_20px_rgba(26,54,115,0.06)] md:max-w-full"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(26,54,115,0.06)] text-[#1a3673]">
                        <Bot size={15} strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed md:text-sm">
                        {phase === "thinking" && questionFull ? (
                          <ThinkingDots />
                        ) : null}
                        {(phase === "answer" || phase === "sources" || phase === "hold" || phase === "transition") && (
                          <div className="space-y-2 text-[rgba(26,54,115,0.88)]">
                            {demo.answerLines.slice(0, answerLinesShown).map((line, li) => (
                              <motion.p
                                key={li}
                                className="flex flex-wrap items-baseline gap-x-0.5"
                                initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                              >
                                {line.map((seg, si) =>
                                  seg.h ? (
                                    <span
                                      key={si}
                                      className="font-semibold tabular-nums text-[#fc7d25]"
                                    >
                                      {seg.t}
                                    </span>
                                  ) : (
                                    <span key={si} className="text-[rgba(26,54,115,0.9)]">
                                      {seg.t}
                                    </span>
                                  ),
                                )}
                              </motion.p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {showSources ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                          className="mt-3 overflow-hidden border-t border-[rgba(26,54,115,0.08)] pt-3"
                        >
                          <div className="flex flex-wrap gap-1.5">
                            {demo.sources.map((tag, ti) => (
                              <motion.span
                                key={tag}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: ti * 0.08, duration: 0.3 }}
                                className="rounded-md border border-[rgba(26,54,115,0.1)] bg-white/90 px-2 py-0.5 text-[10px] font-medium text-[rgba(26,54,115,0.65)]"
                              >
                                {tag}
                              </motion.span>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <AnimatePresence>
                      {showCtas ? (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.32 }}
                          className="mt-3 flex flex-wrap gap-2"
                        >
                          <button
                            type="button"
                            className="rounded-lg border border-[rgba(252,125,37,0.38)] bg-[rgba(252,125,37,0.07)] px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:border-[rgba(252,125,37,0.55)] hover:bg-[rgba(252,125,37,0.11)]"
                          >
                            View full breakdown
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-[rgba(26,54,115,0.12)] bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:border-[rgba(252,125,37,0.35)] hover:bg-[rgba(252,125,37,0.05)]"
                          >
                            See driver analysis
                          </button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                ) : null}
              </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <div className="border-t border-[rgba(26,54,115,0.08)] bg-[rgba(248,250,252,0.65)] px-4 py-3 md:px-5">
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(26,54,115,0.1)] bg-white/90 px-3 py-2.5 shadow-sm">
                <input
                  type="text"
                  readOnly
                  placeholder="Ask Wyz a question…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a3673] outline-none placeholder:text-[rgba(26,54,115,0.45)]"
                  aria-label="Chat input preview"
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a3673] text-white shadow-sm">
                  <Send size={16} strokeWidth={2} className="-translate-x-px translate-y-px" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-[rgba(26,54,115,0.45)]">
                Suggested
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-[rgba(26,54,115,0.1)] bg-white/95 px-3 py-1.5 text-left text-[11px] font-medium text-[#1a3673] transition-colors hover:border-[rgba(252,125,37,0.35)] hover:bg-[rgba(252,125,37,0.06)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p
          className="mx-auto mt-7 max-w-xl text-center text-[12px] leading-relaxed text-[rgba(26,54,115,0.52)] md:mt-8 md:text-[13px]"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Used by founders, CFOs, and finance teams to make faster decisions
        </motion.p>

        <motion.div
          className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 md:mt-12 md:grid-cols-4 md:gap-4"
          variants={headingStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {CAPABILITIES.map(({ title, Icon }) => {
            const active = demo.highlightCapability === title;
            return (
              <motion.div
                key={title}
                variants={headingItem}
                className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3.5 text-center shadow-[0_2px_12px_rgba(26,54,115,0.05)] transition-all duration-500 md:py-4 ${
                  active
                    ? "border-[rgba(252,125,37,0.45)] bg-[rgba(252,125,37,0.08)] shadow-[0_10px_28px_rgba(26,54,115,0.1)] ring-1 ring-[rgba(252,125,37,0.25)]"
                    : "border-[rgba(26,54,115,0.09)] bg-white/90 hover:border-[rgba(252,125,37,0.22)] hover:shadow-[0_8px_20px_rgba(26,54,115,0.07)]"
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-[#1a3673] transition-colors duration-500 ${
                    active ? "bg-[rgba(252,125,37,0.22)]" : "bg-[rgba(252,125,37,0.1)]"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <p className="text-[11px] font-semibold leading-snug text-[#1a3673] md:text-xs">{title}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
