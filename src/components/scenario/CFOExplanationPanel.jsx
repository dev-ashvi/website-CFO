/**
 * @param {{
 *   explanation: null | {
 *     headline: string,
 *     keyDrivers: string[],
 *     narrative: string,
 *     risks: string[],
 *     recommendations: string[],
 *   },
 *   className?: string,
 * }} props
 */
export default function CFOExplanationPanel({ explanation, className = "" }) {
  if (!explanation || typeof explanation !== "object") return null;

  const { headline, keyDrivers, narrative, risks, recommendations } = explanation;

  return (
    <section
      className={`rounded-xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 ${className}`.trim()}
      aria-labelledby="cfo-insight-heading"
    >
      <h2 id="cfo-insight-heading" className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        CFO insight
      </h2>

      <p className="mt-3 text-[17px] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">{headline}</p>

      {keyDrivers?.length ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Key drivers</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-relaxed text-slate-700">
            {keyDrivers.map((line, i) => (
              <li key={i} className="marker:text-[#1a3673]">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {narrative ? (
        <p className="mt-4 text-[13px] leading-relaxed text-slate-700">{narrative}</p>
      ) : null}

      {risks?.length ? (
        <div className="mt-4 rounded-lg border-l-4 border-[#fc7d25] bg-[rgba(252,125,37,0.08)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#c2410c]">Risks</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-amber-950">
            {risks.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-[#fc7d25]" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recommendations?.length ? (
        <div className="mt-4 rounded-lg border-l-4 border-[#1a3673] bg-[#1a3673]/[0.06] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a3673]">Recommendations</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-slate-800">
            {recommendations.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-semibold text-[#1a3673]" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
