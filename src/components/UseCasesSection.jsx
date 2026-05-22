import { motion } from "framer-motion";

const personas = [
  {
    title: "Founder / CEO",
    tag: "Strategic Decisions",
    accent: "border-[#fc7d25]",
    conversations: [
      {
        user: "What’s my 18-month runway at current burn?",
        aiParts: [
          { text: "You have " },
          { text: "14.2 months", highlight: true },
          { text: " of runway, with hiring spend as the biggest risk." },
        ],
        bullets: [
          "Burn rose 11% over the last two months.",
          "Hiring plan adds ~1.8 months downside risk.",
          "Collections timing is the biggest sensitivity.",
        ],
      },
      {
        user: "Which product line is most profitable?",
        aiParts: [
          { text: "Product B leads on contribution margin, despite lower top-line revenue." },
        ],
      },
      {
        user: "How did last quarter’s hiring impact margins?",
        aiParts: [
          { text: "New hiring reduced EBITDA margin by " },
          { text: "3.8 points", highlight: true },
          { text: " quarter-over-quarter." },
        ],
      },
    ],
  },
  {
    title: "CFO / Finance Head",
    tag: "Financial Control",
    accent: "border-[#fc7d25]",
    conversations: [
      {
        user: "Generate a board-ready financial pack.",
        aiParts: [
          { text: "Your board pack is ready with P&L, cash flow, KPIs, and commentary." },
        ],
      },
      {
        user: "Model 3 scenarios for Series B fundraising.",
        aiParts: [
          { text: "Base, bull, and bear cases are prepared with runway and dilution impact." },
        ],
      },
      {
        user: "Show variance analysis — actuals vs forecast.",
        aiParts: [
          { text: "Revenue is " },
          { text: "6%", highlight: true },
          { text: " above plan, while payroll and CAC are the main negative variances." },
        ],
        bullets: [
          "Payroll overspend contributes 41% of total variance.",
          "CAC is 9% above plan in two acquisition channels.",
          "Gross margin improved 1.6 points vs forecast.",
        ],
      },
    ],
  },
  {
    title: "Manage Your Stakeholders",
    tag: "Reporting & Compliance",
    accent: "border-[#fc7d25]",
    conversations: [
      {
        user: "Auto-generate investor reporting package.",
        aiParts: [
          { text: "Investor reporting is compiled with KPI trends, burn, runway, and highlights." },
        ],
      },
      {
        user: "Track covenant compliance and debt.",
        aiParts: [
          { text: "All active covenants are in range, with one coverage ratio nearing threshold." },
        ],
        bullets: [
          "DSCR remains compliant at 1.28x vs 1.20x threshold.",
          "Interest coverage is trending lower for two quarters.",
          "Next review cycle flagged for proactive lender update.",
        ],
      },
      {
        user: "Show quarterly MIS with EBITDA bridges.",
        aiParts: [
          { text: "MIS is ready with EBITDA bridges, working capital movement, and variance notes." },
        ],
      },
    ],
  },
];

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

export default function UseCasesSection() {
  return (
    <section
      id="use-cases"
      className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-[#f7f9fd] px-4 py-24 md:py-28"
    >
      <style>{`
        @keyframes useCaseTypingDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 0.85; transform: translateY(-1px); }
        }
      `}</style>
      <div className="relative z-[1] mx-auto max-w-7xl">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.h2 variants={item} className="text-3xl font-semibold tracking-tight text-[#1a3673] md:text-[2.05rem]">
            Use Cases
          </motion.h2>
          <motion.p variants={item} className="mt-4 text-base leading-relaxed text-[rgba(26,54,115,0.68)] md:text-lg">
            Tailored Insights for Every Decision-Maker
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-14 grid grid-cols-1 gap-10 md:mt-16 md:grid-cols-3 md:gap-12"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {personas.map((persona) => (
            <motion.article
              key={persona.title}
              variants={item}
              className={`border-l-2 pl-4 md:pl-5 ${persona.accent}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(26,54,115,0.48)]">{persona.tag}</p>
              <h3 className="mt-2 text-[1.1rem] font-semibold tracking-tight text-[#1a3673] md:text-[1.2rem]">{persona.title}</h3>
              <ul className="mt-5 space-y-4">
                {persona.conversations.map((chat) => (
                  <li
                    key={chat.user}
                    className="group rounded-2xl px-2 py-2 transition-[transform,opacity,background-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:bg-[rgba(26,54,115,0.02)] hover:shadow-[0_8px_20px_rgba(26,54,115,0.08)]"
                  >
                    <p className="inline-block max-w-[82%] rounded-lg border border-[rgba(26,54,115,0.08)] bg-[rgba(26,54,115,0.11)] px-3 py-1.5 text-[12px] leading-snug text-[rgba(26,54,115,0.9)] backdrop-blur-sm">
                      {chat.user}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2 pl-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fc7d25]">Wyz</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[rgba(26,54,115,0.44)]">
                        <span>Analyzing</span>
                        <span className="flex items-center gap-1" aria-hidden>
                          {[0, 1, 2].map((dot) => (
                            <span
                              // eslint-disable-next-line react/no-array-index-key
                              key={dot}
                              className="h-1 w-1 rounded-full bg-[rgba(26,54,115,0.45)]"
                              style={{ animation: `useCaseTypingDot 1.3s ease-in-out ${dot * 0.14}s infinite` }}
                            />
                          ))}
                        </span>
                      </span>
                    </div>

                    <div className="mt-1.5 inline-block w-[95%] rounded-xl border border-[rgba(26,54,115,0.08)] bg-[rgba(255,255,255,0.56)] px-3 py-2.5 text-[13px] leading-snug text-[rgba(26,54,115,0.72)] backdrop-blur-md group-hover:text-[rgba(26,54,115,0.84)]">
                      <p>
                        {chat.aiParts.map((part, idx) => (
                          <span
                            // eslint-disable-next-line react/no-array-index-key
                            key={idx}
                            className={part.highlight ? "font-semibold text-[#1a3673]" : undefined}
                          >
                            {part.text}
                          </span>
                        ))}
                      </p>
                      {chat.bullets && (
                        <ul className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed text-[rgba(26,54,115,0.64)]">
                          {chat.bullets.map((bullet) => (
                            <li key={bullet} className="flex items-start gap-2">
                              <span className="mt-[0.44rem] h-1 w-1 shrink-0 rounded-full bg-[rgba(252,125,37,0.7)]" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>

        <motion.p
          variants={item}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          className="mx-auto mt-14 max-w-3xl text-center text-sm font-medium text-[rgba(26,54,115,0.62)] md:mt-16 md:text-base"
        >
          Ask anything. Get clarity instantly.
        </motion.p>
      </div>
    </section>
  );
}
