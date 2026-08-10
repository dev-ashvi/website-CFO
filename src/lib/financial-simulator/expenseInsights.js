/**
 * Deterministic expense insights from calculated projection / KPI data.
 * No external benchmarks — only statements supported by the numbers.
 * @param {{ months: import('./types.js').MonthlyProjection[], kpis: import('./types.js').SimulatorKpis }} sim
 * @returns {string[]}
 */
export function buildExpenseInsights(sim) {
  const months = sim.months || [];
  const mix = sim.kpis?.expenseMix;
  if (!months.length || !mix) return [];

  const insights = [];
  const variablePct = Math.round(
    (mix.variableSharePercent ?? mix.variableExpensePercent ?? 0) * 100,
  );
  const fixedPct = Math.round((mix.fixedSharePercent ?? mix.fixedExpensePercent ?? 0) * 100);

  if (variablePct + fixedPct > 0) {
    insights.push(`Variable expenses account for ${variablePct}% of Month 1 operating outflow.`);
    insights.push(`Fixed expenses account for ${fixedPct}% of Month 1 operating outflow.`);
  }

  const largestLabel = mix.largestExpenseCategoryLabel ?? mix.largestExpenseCategory;
  if (largestLabel) {
    insights.push(`${largestLabel} is the largest Month 1 expense category.`);
  }

  const fixedTotal = mix.fixedExpenses ?? mix.averageMonthlyFixedExpenses ?? 0;
  const m1Payroll = months[0]?.payroll ?? 0;
  const m1OtherFixed = months[0]?.otherFixedCosts ?? 0;
  if (m1Payroll >= m1OtherFixed && fixedTotal > 0) {
    insights.push("Payroll is the largest fixed expense.");
  } else if (m1OtherFixed > m1Payroll && fixedTotal > 0) {
    insights.push("Other fixed costs are the largest fixed expense.");
  }

  if (months.length >= 2) {
    const firstVar = months[0].totalVariableExpenses;
    const lastVar = months[months.length - 1].totalVariableExpenses;
    const firstFix = months[0].totalFixedExpenses;
    const lastFix = months[months.length - 1].totalFixedExpenses;
    const varGrowth = firstVar > 0 ? (lastVar - firstVar) / firstVar : 0;
    const fixGrowth = firstFix > 0 ? (lastFix - firstFix) / firstFix : 0;
    if (varGrowth > fixGrowth + 0.02) {
      insights.push("Variable expenses grow faster than fixed expenses over the forecast.");
    } else if (fixGrowth > varGrowth + 0.02) {
      insights.push("Fixed expenses grow faster than variable expenses over the forecast.");
    }
  }

  return insights.slice(0, 5);
}
