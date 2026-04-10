import { useEffect, useRef, useState } from "react";

export default function PlanningRefreshNotice({ recomputeVersion }) {
  const prev = useRef(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (recomputeVersion > prev.current) {
      prev.current = recomputeVersion;
      setVisible(true);
      const t = window.setTimeout(() => setVisible(false), 6500);
      return () => window.clearTimeout(t);
    }
  }, [recomputeVersion]);

  if (!visible) return null;

  return (
    <div
      className="mb-6 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-[13px] text-emerald-950 shadow-sm"
      role="status"
    >
      <span className="font-semibold text-emerald-900">Forecasts refreshed.</span>{" "}
      <span className="text-emerald-800/90">Dashboard and models now reflect your latest planning inputs.</span>
    </div>
  );
}
