/**
 * Natural language → structured dashboard actions (demo parser).
 */

function findBlockIndex(blocks, frag) {
  const q = frag.toLowerCase().trim();
  if (!q) return -1;
  return blocks.findIndex((b) => {
    const t = (b.title || "").toLowerCase();
    const m = (b.metricName || "").toLowerCase();
    const d = (b.dataset || "").toLowerCase();
    return t.includes(q) || q.includes(t) || m.includes(q) || q.includes(m) || d.includes(q) || q.includes(d);
  });
}

function demoChartSeries(metricNames) {
  const labels = ["M-5", "M-4", "M-3", "M-2", "M-1", "M"];
  const series = metricNames.map((name, i) => ({
    name,
    values: labels.map((_, j) => Math.round(40 + j * 8 + i * 15 + (j % 3) * 5)),
  }));
  return { labels, series };
}

function kpiPayload({ metricName, value, trend, title, dashboardId }) {
  return {
    type: "kpi",
    title: title || metricName,
    metricName,
    value,
    trend: trend === "up" || trend === "down" || trend === "flat" ? trend : "flat",
    layout: { colSpan: 1, rowSpan: 1 },
    dashboardId,
  };
}

function chartPayload({ title, chartType, metrics, timeRange, dashboardId }) {
  const m = Array.isArray(metrics) && metrics.length ? metrics : ["Series A"];
  return {
    type: "chart",
    title: title || m.join(" vs "),
    chartType: chartType === "bar" ? "bar" : "line",
    metrics: m,
    timeRange: timeRange || "12m",
    chartData: demoChartSeries(m),
    layout: { colSpan: 2, rowSpan: 1 },
    dashboardId,
  };
}

function tablePayload({ title, dataset, columns, rows, dashboardId }) {
  const cols = columns || [
    { key: "month", label: "Month" },
    { key: "revenue", label: "Revenue" },
    { key: "expense", label: "Expense" },
  ];
  const r =
    rows ||
    (cols[0]?.key === "month"
      ? [
          { month: "Jan", revenue: "₹24L", expense: "₹18L" },
          { month: "Feb", revenue: "₹26L", expense: "₹19L" },
          { month: "Mar", revenue: "₹28L", expense: "₹20L" },
        ]
      : [{ a: "1", b: "2" }]);
  return {
    type: "table",
    title: title || "Dataset",
    dataset: dataset || "summary",
    columns: cols,
    rows: r,
    layout: { colSpan: 2, rowSpan: 1 },
    dashboardId,
  };
}

/**
 * @param {string} text
 * @param {{ blocks: object[], filters: object, activeDashboardId: string }} ctx
 */
export function parseDashboardCommand(text, ctx) {
  const raw = text.trim();
  if (!raw) return { actions: [], reply: null };

  const lower = raw.toLowerCase();
  const actions = [];
  const replyParts = [];
  const blocks = ctx.blocks || [];
  const dashId = ctx.activeDashboardId;

  const pushAdd = (payload) => {
    actions.push({ type: "ADD_BLOCK", payload: { ...payload, dashboardId: payload.dashboardId || dashId } });
  };

  if (/(?:last|past)\s+(\d+)\s*months?/i.test(raw)) {
    const m = raw.match(/(?:last|past)\s+(\d+)\s*months?/i);
    actions.push({ type: "SET_FILTERS", payload: { timeRange: `${m[1]}m` } });
    replyParts.push(`Filters: last ${m[1]} months.`);
  } else if (/last\s+six\s+months|past\s+six\s+months|6\s*months?/i.test(lower)) {
    actions.push({ type: "SET_FILTERS", payload: { timeRange: "6m" } });
    replyParts.push("Filters: last 6 months.");
  } else if (/last\s+year|12\s*months?|past\s+year/i.test(lower)) {
    actions.push({ type: "SET_FILTERS", payload: { timeRange: "12m" } });
    replyParts.push("Filters: last 12 months.");
  }

  if (/(?:remove|delete)\s+/i.test(raw) && !/^add\s/i.test(raw)) {
    const m = raw.match(/(?:remove|delete)\s+(?:the\s+)?(.+?)\s*$/i);
    if (m) {
      let frag = m[1].replace(/\s+(chart|kpi|table|block|graph)\s*$/i, "").trim();
      const idx = findBlockIndex(blocks, frag);
      if (idx >= 0) {
        actions.push({ type: "REMOVE_BLOCK", payload: { id: blocks[idx].id } });
        replyParts.push(`Removed "${blocks[idx].title || blocks[idx].metricName || "block"}".`);
      } else if (frag) {
        replyParts.push(`No block matched "${frag}". Try the name shown on the card.`);
      }
    }
  }

  if (/add\s+.*runway|runway\s+kpi/i.test(lower)) {
    pushAdd(kpiPayload({ metricName: "Runway", value: "8.4 mo", trend: "down", dashboardId: dashId }));
    replyParts.push("Added Runway KPI.");
  } else if (/add\s+.*burn|burn\s+kpi|monthly\s+burn\s+kpi/i.test(lower)) {
    pushAdd(kpiPayload({ metricName: "Monthly burn", value: "₹14.5L", trend: "up", dashboardId: dashId }));
    replyParts.push("Added Monthly burn KPI.");
  } else if (/add\s+.*cash|cash\s+kpi/i.test(lower)) {
    pushAdd(kpiPayload({ metricName: "Cash in bank", value: "₹2.42 Cr", trend: "up", dashboardId: dashId }));
    replyParts.push("Added Cash KPI.");
  } else if (/add\s+.*revenue|revenue\s+kpi|revenue\s+mtd/i.test(lower)) {
    pushAdd(kpiPayload({ metricName: "Revenue MTD", value: "₹26.8L", trend: "up", dashboardId: dashId }));
    replyParts.push("Added Revenue MTD KPI.");
  } else if (/add\s+(?:a\s+)?kpi/i.test(lower)) {
    const rest = raw.replace(/^.*add\s+(?:a\s+)?kpi\s*/i, "").trim();
    const name = rest || "Custom metric";
    pushAdd(
      kpiPayload({
        metricName: name,
        value: "—",
        trend: "flat",
        title: name,
        dashboardId: dashId,
      }),
    );
    replyParts.push(`Added KPI "${name}".`);
  }

  if (/revenue\s+vs\s+expenses|expenses\s+vs\s+revenue|show\s+revenue\s+vs\s+expenses/i.test(lower)) {
    pushAdd(
      chartPayload({
        title: "Revenue vs expenses",
        chartType: /bar/i.test(raw) ? "bar" : "line",
        metrics: ["Revenue", "Expenses"],
        dashboardId: dashId,
      }),
    );
    replyParts.push("Added chart: Revenue vs Expenses.");
  } else if (/(?:show|add).*\bbar\b.*chart|bar\s+chart/i.test(lower) && /revenue/i.test(lower)) {
    pushAdd(chartPayload({ title: "Revenue", chartType: "bar", metrics: ["Revenue"], dashboardId: dashId }));
    replyParts.push("Added bar chart for Revenue.");
  } else if (/(?:show|add).*\bline\b.*chart|line\s+chart/i.test(lower) && /cash|runway/i.test(lower)) {
    pushAdd(
      chartPayload({
        title: "Cash & runway",
        chartType: "line",
        metrics: ["Cash", "Runway index"],
        dashboardId: dashId,
      }),
    );
    replyParts.push("Added line chart.");
  } else if (/(?:add|show)\s+(?:a\s+)?chart/i.test(lower) && !replyParts.some((r) => /chart/i.test(r))) {
    pushAdd(
      chartPayload({
        title: "Metrics",
        chartType: /bar/i.test(lower) ? "bar" : "line",
        metrics: ["Metric A", "Metric B"],
        dashboardId: dashId,
      }),
    );
    replyParts.push("Added a sample chart — name metrics in a follow-up to refine.");
  }

  if (/add\s+(?:a\s+)?table/i.test(lower)) {
    pushAdd(tablePayload({ dashboardId: dashId }));
    replyParts.push("Added table block.");
  }

  if (/new\s+dashboard|create\s+dashboard/i.test(lower)) {
    const nameMatch = raw.match(/(?:named|called)\s+["']?([^"'\n]+?)["']?\s*$/i);
    const name = nameMatch ? nameMatch[1].trim() : `Dashboard ${(ctx.dashboards?.length || 0) + 1}`;
    actions.push({ type: "ADD_DASHBOARD", payload: { name } });
    replyParts.push(`Created "${name}" and switched to it.`);
  }

  const reply = replyParts.length ? [...new Set(replyParts)].join(" ") : null;
  return { actions, reply };
}

export function summarizeDashboardActions(actions) {
  if (!actions?.length) return null;
  const types = new Set(actions.map((a) => a.type));
  if (types.has("ADD_BLOCK")) return "Dashboard updated with new block(s).";
  if (types.has("REMOVE_BLOCK")) return "Block removed.";
  if (types.has("SET_FILTERS")) return "Filters updated.";
  if (types.has("ADD_DASHBOARD")) return "New dashboard created.";
  return "Dashboard updated.";
}

export function defaultDashboardChatReply(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) {
    return 'Try: "Show revenue vs expenses", "Add runway KPI", "Add a table", "Last 6 months", or "Remove burn chart".';
  }
  if (/help|what\s+can/i.test(t)) {
    return "I can add KPI, line/bar chart, and table blocks; change time filters; remove blocks by name; or create a new dashboard.";
  }
  return 'Say things like "Add runway KPI", "Show revenue vs expenses", "Last 6 months", or "Remove [name]".';
}
