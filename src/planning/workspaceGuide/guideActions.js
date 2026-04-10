/**
 * Demo-only parser: natural-ish phrases → structured workspace actions + optional reply.
 */

import { WORKSPACE_STEPS } from "../../workspace/workspaceFlowConfig.js";

const STEP_ORDER = WORKSPACE_STEPS.map((s) => s.id);

const ARROW = { up: "↑", down: "↓", flat: "→", mix: "~" };

function numFrom(str) {
  const n = parseFloat(String(str).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function findAssumptionIdByName(assumptions, frag) {
  if (!assumptions?.length || !frag) return null;
  const q = frag.toLowerCase().trim();
  const a = assumptions.find(
    (x) =>
      x.name.toLowerCase().includes(q) ||
      q.includes(x.name.toLowerCase()) ||
      x.name.toLowerCase().replace(/\s+/g, " ") === q.replace(/\s+/g, " "),
  );
  return a?.id ?? null;
}

function inferTypeFromName(nameFrag, suffix) {
  if (suffix === "%") return "percentage";
  if (suffix === "₹") return "currency";
  const n = nameFrag.toLowerCase();
  if (/fx|growth|margin|rate|cac|churn|conversion/i.test(n)) return "percentage";
  if (/cash|revenue|arr|mrr|burn|salary|cost|buffer|fund/i.test(n)) return "currency";
  return "number";
}

/**
 * @param {string} text
 * @param {*} ctx snapshot from snapshotForGuide()
 */
export function parseGuideMessage(text, ctx) {
  const raw = text.trim();
  if (!raw) return { actions: [], reply: null };

  const lower = raw.toLowerCase();
  const actions = [];
  const replyParts = [];
  const assumptions = ctx.assumptions ?? [];
  const dataFiles = ctx.data?.files ?? [];

  // --- Data binding (chat-first workspace) ---
  if (/^use\s+all\b|^select\s+all(\s+files)?\b|^bind\s+all\b/i.test(raw)) {
    const ids = dataFiles.map((f) => f.id);
    actions.push({ type: "set_data_selected_files", ids });
    const metricLabels = (ctx.data?.metrics ?? []).map((m) => m.label).join(", ");
    replyParts.push(
      ids.length
        ? `Selected all ${ids.length} workspace file(s). Metrics in state: ${metricLabels || "standard set loaded where needed."}`
        : "No demo files are listed yet — add data under Data → Files, then return or say which file to use.",
    );
  } else {
    const fileUse = raw.match(/(?:^use|^bind|^select)\s+([a-z0-9][a-z0-9_.-]*\.(?:csv|xlsx|pdf))/i);
    if (fileUse) {
      const fname = fileUse[1];
      actions.push({ type: "select_data_file_by_pattern", pattern: fname });
      replyParts.push(
        `Binding “${fname}” to the workspace — selected files and metrics update from shared state (demo).`,
      );
    }
  }

  if (/i\s+uploaded|uploaded\s+a\s+file|just\s+uploaded|file\s+is\s+ready/i.test(lower)) {
    const names = dataFiles.map((f) => f.name).join(", ");
    const det = (ctx.data?.metrics ?? []).map((m) => m.label).join(", ");
    replyParts.push(
      names
        ? `I see these workspace files: ${names}. ${det ? `Detected metrics in state: ${det}. ` : ""}Say “use revenue.csv” to bind one file, or “use all” to select everything.`
        : "Once files appear in Data → Files, metrics sync here. You can still say “use revenue.csv” if that file is already in the workspace list.",
    );
  }

  // --- Add assumption (explicit “add …”) ---
  if (/^add\s+/i.test(raw)) {
    let am = raw.match(/add\s+(.+?)\s+growing\s+([\d.]+)\s*%\s*(.*)/i);
    if (am) {
      const name = am[1].trim();
      const v = numFrom(am[2]);
      if (name && v != null) {
        actions.push({
          type: "add_assumption",
          payload: {
            name,
            type: "percentage",
            value: v,
            description: (am[3] || "").trim() || "Monthly growth (workspace demo).",
            usedIn: ["CAC / acquisition views", "Revenue model"],
          },
        });
        replyParts.push(
          `Added “${name}” at ${v}% — it’s in your assumptions list and wired into the demo “used in” tags.`,
        );
      }
    } else if ((am = raw.match(/add\s+(.+?)\s+([\d.]+)\s*%/i))) {
      const name = am[1].trim();
      const v = numFrom(am[2]);
      if (name && v != null) {
        actions.push({
          type: "add_assumption",
          payload: {
            name,
            type: "percentage",
            value: v,
            description: "",
            usedIn: ["Workspace models (demo)"],
          },
        });
        replyParts.push(`Created “${name}” at ${v}% — it appears in the assumptions panel below.`);
      }
    } else if ((am = raw.match(/add\s+(.+?)\s+₹?\s*([\d,.]+)\s*(cr|crore|l|lakh|lakhs)?/i))) {
      const name = am[1].trim();
      let v = numFrom(am[2]);
      if (name && v != null) {
        const unit = (am[3] || "").toLowerCase();
        if (unit.startsWith("cr")) v *= 1e7;
        else if (unit.startsWith("l")) v *= 1e5;
        actions.push({
          type: "add_assumption",
          payload: {
            name,
            type: "currency",
            value: v,
            description: "",
            usedIn: ["Cash flow model", "Dashboard"],
          },
        });
        replyParts.push(`Added “${name}” as a currency line — check Assumptions for the amount.`);
      }
    } else if ((am = raw.match(/add\s+(.+?)\s+(\d+)\s*(?:roles|\/qtr|per\s+quarter)?/i))) {
      const name = am[1].trim();
      const v = numFrom(am[2]);
      if (name && v != null && Number.isInteger(v)) {
        actions.push({
          type: "add_assumption",
          payload: {
            name,
            type: "number",
            value: v,
            description: "Headcount / capacity driver.",
            usedIn: ["Burn model", "Runway projection"],
          },
        });
        replyParts.push(`Added “${name}” (${v}) as a numeric driver — models reference it in the demo workspace.`);
      }
    }
  }

  // --- Suggest driver (demo template) ---
  if (/suggest\s+(?:a\s+)?(?:new\s+)?driver|add\s+a\s+suggested\s+driver/i.test(lower)) {
    actions.push({
      type: "add_assumption",
      payload: {
        name: "Pipeline conversion",
        type: "percentage",
        value: 22,
        description: "Suggested driver — align with sales ops on definition.",
        usedIn: ["Revenue model", "Scenarios"],
      },
    });
    replyParts.push("I dropped in a suggested pipeline conversion driver — tune the value with your GTM lead.");
  }

  // --- Patch by name: set / change / update X to Y ---
  const um = raw.match(/(?:set|change|update)\s+(.+?)\s+to\s+([\d.]+)\s*(%|₹)?/i);
  if (um && !/^add\s+/i.test(raw)) {
    const nameFrag = um[1].trim();
    const v = numFrom(um[2]);
    const suffix = um[3] || "";
    if (nameFrag && v != null && !/scenario|preview|dashboard/i.test(nameFrag)) {
      let type = inferTypeFromName(nameFrag, suffix);
      if (suffix === "₹") type = "currency";
      if (suffix === "%") type = "percentage";
      const existingId = findAssumptionIdByName(assumptions, nameFrag);
      if (existingId) {
        actions.push({
          type: "patch_assumption_by_name",
          nameMatch: nameFrag,
          patch: { value: v, type },
        });
        replyParts.push(
          `Done — I updated “${nameFrag}” to ${suffix === "%" ? `${v}%` : suffix === "₹" ? `₹${v}` : v}. Your Assumptions list is in sync.`,
        );
      } else {
        actions.push({
          type: "add_assumption",
          payload: {
            name: nameFrag.replace(/\b\w/g, (c) => c.toUpperCase()),
            type,
            value: v,
            description: "",
            usedIn: ["Workspace models (demo)"],
          },
        });
        replyParts.push(
          `No existing driver matched “${nameFrag}” — I created a new assumption with that value; ask me to adjust it anytime.`,
        );
      }
    }
  }

  // --- Remove assumption ---
  const rm = raw.match(/(?:delete|remove)\s+(?:assumption\s+)?(.+)/i);
  if (rm && !/^add\s+/i.test(raw)) {
    const frag = rm[1].replace(/\bassumption\b/i, "").trim();
    const id = findAssumptionIdByName(assumptions, frag);
    if (id) {
      actions.push({ type: "remove_assumption", id });
      replyParts.push(`Removed that driver from the workspace assumption list.`);
    }
  }

  // --- Scenarios (levers / previews) ---
  if (/(create\s+)?downside\s+scenario|stress\s+case|worst\s+case/i.test(lower)) {
    actions.push({
      type: "set_scenario_preview",
      payload: {
        label: "Downside case",
        revenueDelta: ARROW.down,
        runwayDelta: ARROW.down,
        burnDelta: ARROW.up,
      },
      levers: { revenue: false, hiring: true, fx: false },
    });
    replyParts.push(
      "I framed a downside scenario: revenue and runway compress while burn stays elevated until you cut cost or hiring.",
    );
  } else if (/reduce\s+hiring|moderate\s+hiring|slow\s+hiring|cut\s+hiring|hiring\s+moderation/i.test(lower)) {
    actions.push({
      type: "set_scenario_preview",
      payload: {
        label: "Hiring moderation",
        revenueDelta: ARROW.flat,
        runwayDelta: ARROW.up,
        burnDelta: ARROW.down,
      },
      levers: { revenue: false, hiring: true, fx: false },
    });
    replyParts.push(
      "I created a hiring moderation preview — runway improves while burn softens. Check the Scenarios step for the summary.",
    );
  } else if (
    /increase\s+revenue|revenue\s+upside|grow\s+revenue/i.test(lower) &&
    !actions.some((a) => ["add_assumption", "patch_assumption_by_name"].includes(a.type))
  ) {
    actions.push({
      type: "set_scenario_preview",
      payload: {
        label: "Revenue upside",
        revenueDelta: ARROW.up,
        runwayDelta: ARROW.up,
        burnDelta: ARROW.flat,
      },
      levers: { revenue: true, hiring: false, fx: false },
    });
    replyParts.push("I applied a revenue upside lens — revenue and runway tick up in the preview while burn holds steady.");
  } else if (/change\s+fx|fx\s+shock|currency/i.test(lower)) {
    actions.push({
      type: "set_scenario_preview",
      payload: {
        label: "FX sensitivity",
        revenueDelta: ARROW.mix,
        runwayDelta: ARROW.flat,
        burnDelta: ARROW.flat,
      },
      levers: { revenue: false, hiring: false, fx: true },
    });
    replyParts.push("FX sensitivity is highlighted — reporting revenue moves with translational effects in this demo preview.");
  }

  if (/apply\s+preview|apply\s+scenario|lock\s+preview/i.test(lower)) {
    actions.push({ type: "apply_scenario_preview" });
    replyParts.push("Preview applied — your dashboard step will treat this as the active scenario overlay (demo).");
  }

  if (/save\s+(?:the\s+)?dashboard/i.test(lower)) {
    actions.push({ type: "save_dashboard" });
    replyParts.push("Dashboard marked saved in workspace state — see the Dashboard step panel.");
  }

  if (
    ctx.currentStepId === "connect" &&
    /(connect\s+data|upload\s+data|use\s+sample\s+data|detect\s+metrics|upload\s+a\s+csv|connect\s+(my\s+)?accounting)/i.test(lower) &&
    !/^use\s+/i.test(raw) &&
    !/i\s+uploaded|uploaded\s+a\s+file/i.test(lower)
  ) {
    replyParts.push(
      "Uploads and OAuth live under Data → Files and Data → Connect. Here, chat can bind files (e.g. “use revenue.csv”) and you’ll see metrics below when they sync from Data or from binding.",
    );
  }

  if (/show\s+top\s+risk|highlight\s+risk|what\s+.*\s+risk/i.test(lower)) {
    actions.push({
      type: "add_insight",
      payload: {
        title: "Top risk: liquidity timing",
        detail: "Large contracts skew collections — near-term cash is sensitive to a handful of payers.",
        severity: "High",
      },
    });
    replyParts.push("Surfaced a top risk card at the top of your Insights list — review it before the board cycle.");
  }

  if (/create\s+burn\s+reduction\s+plan|burn\s+reduction\s+plan/i.test(lower)) {
    actions.push({
      type: "add_plan",
      payload: {
        title: "Burn reduction program",
        detail: "Target 12–15% discretionary takeout over 60 days with weekly tracking vs baseline burn.",
      },
    });
    replyParts.push("I added a burn reduction plan draft to your Plans step — refine owners and dates with leadership.");
  } else if (/turn\s+this\s+into\s+a\s+plan|convert\s+to\s+plan|make\s+it\s+a\s+plan/i.test(lower)) {
    const top = ctx.insights?.[0];
    if (top?.title) {
      actions.push({
        type: "add_plan",
        payload: {
          title: `Plan: ${top.title}`,
          detail: top.detail || "Derived from the top insight in your workspace — adjust scope with finance.",
        },
      });
      replyParts.push(`I turned “${top.title}” into a draft plan — open Plans to review wording and impact.`);
    } else {
      actions.push({
        type: "add_plan",
        payload: {
          title: "Plan: Address top workspace signal",
          detail: "Placeholder plan — tie to the insight you care about most.",
        },
      });
      replyParts.push("Added a generic plan shell — add specifics after you pick which signal to operationalize.");
    }
  }

  const goMap = [
    [/go\s+to\s+connect|open\s+connect|step\s+1/i, "connect"],
    [/go\s+to\s+assumptions|open\s+assumptions/i, "assumptions"],
    [/go\s+to\s+models|open\s+models/i, "models"],
    [/go\s+to\s+scenarios|open\s+scenarios/i, "scenarios"],
    [/go\s+to\s+insights|open\s+insights/i, "insights"],
    [/go\s+to\s+dashboard|open\s+dashboard/i, "dashboard"],
    [/go\s+to\s+plans|open\s+plans/i, "plans"],
  ];
  for (const [re, step] of goMap) {
    if (re.test(lower)) {
      const idx = STEP_ORDER.indexOf(step);
      const furthest = ctx.furthestStepIndex ?? 6;
      if (idx > furthest) {
        replyParts.push("That step is still locked — use Continue or finish earlier steps first.");
      } else {
        actions.push({ type: "go_to_step", step });
        replyParts.push(`Moving you to ${step} in the workspace.`);
      }
      break;
    }
  }

  if (/complete\s+(?:this\s+)?step|mark\s+.*\s+complete|finish\s+connect|done\s+with\s+connect/i.test(lower)) {
    const step = ctx.currentStepId || "connect";
    actions.push({ type: "mark_step_complete", step });
    replyParts.push(`Marked the ${step} step complete and unlocked the next stage in your flow.`);
  }

  const reply = replyParts.length ? replyParts.join(" ") : null;
  return { actions, reply };
}

export function summarizeActions(actions) {
  if (!actions?.length) return null;
  const types = new Set(actions.map((a) => a.type));
  if (types.has("add_assumption")) return "New assumption added to your workspace.";
  if (types.has("patch_assumption_by_name")) return "Assumptions updated in your workspace.";
  if (types.has("remove_assumption")) return "An assumption was removed from the list.";
  if (types.has("set_scenario_preview")) return "Scenario preview refreshed — see the Scenarios step.";
  if (types.has("add_plan")) return "Plans list updated with a new draft.";
  if (types.has("add_insight")) return "Insights refreshed with a new signal.";
  if (types.has("set_data_selected_files") || types.has("select_data_file_by_pattern")) return "Data selection updated.";
  if (types.has("save_dashboard")) return "Dashboard save recorded.";
  if (types.has("go_to_step")) return "Navigation updated.";
  return "Workspace updated.";
}

export function defaultCopilotReply(text, stepId) {
  const t = (text || "").trim().toLowerCase();
  if (!t) {
    const hints = {
      connect: "Say “I uploaded a file”, “use revenue.csv”, or “use all”. Open Data for real uploads; chat binds workspace files and shows metrics below.",
      assumptions: "Try: “set revenue growth to 12%”, “add CAC growing 5% monthly”, “remove FX drift”.",
      models: "Ask how models use your drivers, or say “go to scenarios” to stress-test.",
      scenarios: "Try: “create downside scenario”, “reduce hiring”, “apply preview”.",
      insights: "Try: “show top risk”, “convert to plan”.",
      dashboard: "Try: “save dashboard” after you like the preview.",
      plans: "Try: “create burn reduction plan” or “finalize plan”.",
    };
    return hints[stepId] || "Type what you want to change — I update workspace state and the panel below reflects it.";
  }
  if (/help|what\s+(can|should)\s+i/i.test(t)) {
    const help = {
      connect:
        "Use chat to bind files (“use revenue.csv”, “use all”) and watch metrics. For real ingestion, use Data → Files or Connect. Continue unlocks when at least one metric is present.",
      assumptions: "I add, patch, and remove assumptions from your messages — the list below is read-only.",
      models: "Models summarize your drivers; change assumptions via chat on the Assumptions step.",
      scenarios: "Ask for downside case, hiring moderation, revenue upside, FX — then “apply preview” if you like it.",
      insights: "Ask to surface a risk or turn an insight into a plan draft.",
      dashboard: "Scenario overlays and KPIs reflect state; say “save dashboard” to mark saved.",
      plans: "Ask for a plan draft or to finalize when ready.",
    };
    return help[stepId] || `You are on the ${stepId} step — describe the change you want in plain language.`;
  }
  if (/^hi\b|hello/i.test(t)) {
    return "Hi — this workspace is chat-first: tell me what to bind, change, or stress-test, and I’ll update state below.";
  }
  if (/runway|cash|burn/i.test(t)) {
    return "Say “create downside scenario”, “reduce hiring”, or “apply preview” — I’ll move scenario levers for you.";
  }
  const fallbacks = {
    connect: "Try “use all”, “use revenue.csv”, or “I uploaded a file”.",
    assumptions: "Try “set hiring plan to 6” or “add pipeline conversion 22%”.",
    scenarios: "Try “create downside scenario” or “apply preview”.",
    dashboard: "Try “save dashboard”.",
  };
  return fallbacks[stepId] || "Describe the change you want — e.g. assumptions, scenarios, or plans.";
}
