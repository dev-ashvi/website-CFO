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
  const variablePct = Math.round((mix.variableExpensePercent || 0) * 100);
  const fixedPct = Math.round((mix.fixedExpensePercent || 0) * 100);

  if (variablePct + fixedPct > 0) {
    insights.push(`Variable expenses account for ${variablePct}% of operating outflow.`);
    insights.push(`Fixed expenses account for ${fixedPct}% of operating outflow.`);
  }

  if (mix.largestExpenseCategory) {
    insights.push(`${mix.largestExpenseCategory} is the largest expense category.`);
  }

  const avgPayroll = average(months.map((m) => m.payroll));
  const avgOtherFixed = average(months.map((m) => m.otherFixedCosts));
  if (avgPayroll >= avgOtherFixed && mix.averageMonthlyFixedExpenses > 0) {
    insights.push("Payroll is the largest fixed expense.");
  } else if (avgOtherFixed > avgPayroll && mix.averageMonthlyFixedExpenses > 0) {
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

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
