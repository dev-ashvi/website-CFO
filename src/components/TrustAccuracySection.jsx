import { motion } from "framer-motion";
import { CheckCircle2, History, KeyRound, Lock, Settings2, ShieldCheck, Sparkles } from "lucide-react";

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.06,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const blocks = [
  {
    title: "Human-in-the-Loop",
    Icon: CheckCircle2,
    lines: [
      "Every critical assumption is surfaced for review.",
      "Nothing goes out without founder approval — especially board reports.",
    ],
  },
  {
    title: "Data Trail",
    Icon: History,
    lines: [
      "Every number traces back to its source.",
      "Track who changed what, when, and why — with complete version history.",
    ],
  },
  {
    title: "Explainable AI",
    Icon: Sparkles,
    lines: [
      "Not just outputs — clear reasoning.",
      "Every insight includes cost-driver breakdowns and plain-language explanations.",
    ],
  },
  {
    title: "Assumption Transparency",
    Icon: Settings2,
    lines: [
      "All key inputs — growth, margins, hiring — are visible and editable.",
      "No hidden logic. Fully version-controlled.",
    ],
  },
];

const securityItems = [
  {
    title: "Enterprise-Grade Security",
    description: "Your financial data is encrypted at rest and in transit.",
    Icon: ShieldCheck,
  },
  {
    title: "Access Control & Permissions",
    description: "Role-based access ensures proper visibility.",
    Icon: KeyRound,
  },
  {
    title: "Secure Infrastructure",
    description: "Hosted with monitoring, backups, and high availability.",
    Icon: Lock,
  },
];

export default function TrustAccuracySection() {
  return (
    <section
      id="trust-accuracy"
      className="relative scroll-mt-28 z-10 overflow-hidden border-y border-[rgba(26,54,115,0.08)] bg-gradient-to-b from-[#f8faff] via-[#f5f7fb] to-[#f3f6fb] px-4 py-24 md:py-28"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: [
            "linear-gradient(rgba(26,54,115,0.035) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(26,54,115,0.035) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "64px 64px",
        }}
      />
      <div className="relative z-[1] mx-auto max-w-7xl">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.h2 variants={item} className="text-3xl font-semibold tracking-tight text-[#1a3673] md:text-[2.05rem]">
            Trust &amp; Accuracy
          </motion.h2>
          <motion.p
            variants={item}
            className="mt-4 text-base leading-relaxed text-[rgba(26,54,115,0.72)] md:text-lg"
          >
            So you never have to trust a black box.
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-14 grid grid-cols-1 gap-10 sm:gap-12 md:mt-16 md:grid-cols-2 md:gap-x-14 md:gap-y-12"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          {blocks.map((block) => (
            <motion.div
              key={block.title}
              variants={item}
              className="group min-w-0 border-l-2 border-transparent py-1 pl-4 pr-1 opacity-95 transition-[border-color,background-color,transform,opacity] duration-200 [-webkit-tap-highlight-color:transparent] hover:-translate-y-0.5 hover:border-l-[#fc7d25] hover:bg-[rgba(26,54,115,0.03)] hover:opacity-100 md:pl-5"
            >
              <div className="flex items-center gap-2.5">
                <block.Icon
                  size={15}
                  strokeWidth={1.8}
                  className="shrink-0 text-[rgba(252,125,37,0.82)] transition-colors duration-200 group-hover:text-[#fc7d25]"
                  aria-hidden
                />
                <h3 className="text-lg font-semibold tracking-tight text-[#1a3673] md:text-xl">{block.title}</h3>
              </div>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[rgba(26,54,115,0.62)] md:text-base">
                {block.lines.map((line, i) => (
                  <p key={`${block.title}-${i}`}>{line}</p>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-14 border-t border-[rgba(26,54,115,0.1)] pt-11 md:mt-16 md:pt-12"
        >
          <h3 className="text-xl font-semibold tracking-tight text-[#1a3673] md:text-2xl">Security &amp; Data Integrity</h3>
          <div className="mt-7 grid grid-cols-1 gap-6 md:mt-8 md:grid-cols-2 md:gap-x-12 md:gap-y-7">
            {securityItems.map(({ title, description, Icon }, idx) => (
              <motion.div
                key={title}
                variants={item}
                className={`group min-w-0 border-l-2 border-transparent py-1 pl-4 pr-1 opacity-95 transition-[border-color,background-color,transform,opacity] duration-200 hover:-translate-y-0.5 hover:border-l-[#fc7d25] hover:bg-[rgba(26,54,115,0.03)] hover:opacity-100 md:pl-5 ${
                  idx === securityItems.length - 1
                    ? "md:col-span-2 md:max-w-xl md:justify-self-center"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={16}
                    strokeWidth={1.8}
                    className="shrink-0 text-[rgba(252,125,37,0.82)] transition-colors duration-200 group-hover:text-[#fc7d25]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold tracking-tight text-[#1a3673]">{title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[rgba(26,54,115,0.58)] md:text-[15px]">
                      {description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.p
          className="mx-auto mt-14 max-w-3xl text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[rgba(26,54,115,0.45)] md:mt-16 md:text-xs"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4 }}
        >
          Used by Finance Teams • Audit-Friendly • Built for Scale • Enterprise Ready
        </motion.p>
      </div>
    </section>
  );
}
