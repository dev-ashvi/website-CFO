import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { parseUserInputForAssumption } from "../../planning/AssumptionsContext.jsx";
import { businessAffectsFromOutputs } from "../../planning/assumptions/businessAffects.js";
import {
  ASSUMPTION_TYPE_LABELS,
  defaultUnitForType,
  parseValueForNewAssumption,
} from "../../planning/assumptions/format.js";
import { valueFieldHelp, valuePlaceholder } from "../../planning/assumptions/drawerHelpers.js";
import { OUTPUT_REFS } from "../../planning/assumptions/outputRefs.js";
import { ASSUMPTION_SOURCE, ASSUMPTION_TYPE, ASSUMPTION_UNIT } from "../../planning/assumptions/types.js";
import { parseNaturalLanguagePlanningInput } from "../../planning/parseNaturalLanguagePlanningInput.js";

const OUTPUT_KEYS = Object.keys(OUTPUT_REFS);

const TYPE_OPTIONS = [
  ASSUMPTION_TYPE.PERCENTAGE,
  ASSUMPTION_TYPE.CURRENCY,
  ASSUMPTION_TYPE.COUNT,
  ASSUMPTION_TYPE.FX_RATE,
  ASSUMPTION_TYPE.TEXT,
];

function AiAddProposalCard({ draft, onAdd, onEditFirst, onCancel }) {
  const feeds = draft.outputKeys.map((k) => OUTPUT_REFS[k]?.label).filter(Boolean);
  return (
    <div className="rounded-2xl border border-[#1a3673]/15 bg-white px-4 py-4 text-[12px] text-slate-800 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Planning assistant</p>
      <p className="mt-2 leading-relaxed text-slate-700">I can add this planning input:</p>
      <dl className="mt-3 space-y-1.5">
        <div>
          <dt className="inline font-semibold text-slate-600">Name: </dt>
          <dd className="inline text-slate-900">{draft.label}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-600">Type: </dt>
          <dd className="inline text-slate-900">{draft.typeLabel}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-600">Unit: </dt>
          <dd className="inline text-slate-900">{draft.unitLabel}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-600">Value: </dt>
          <dd className="inline font-semibold tabular-nums text-[#1a3673]">{draft.valueDisplay}</dd>
        </div>
      </dl>
      {draft.note ? (
        <div className="mt-2 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-500">Note: </span>
          {draft.note}
        </div>
      ) : null}
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-slate-600">Feeds into</p>
        <ul className="mt-1.5 list-none space-y-0.5 text-[12px] text-slate-700">
          {feeds.map((label) => (
            <li key={label} className="flex gap-2">
              <span className="text-slate-400">•</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-w-[6rem] flex-1 items-center justify-center rounded-xl bg-[#fc7d25] px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#e86f16]"
        >
          Add input
        </button>
        <button
          type="button"
          onClick={onEditFirst}
          className="inline-flex min-w-[6rem] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Edit first
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-w-[6rem] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function unitOptionsForType(type) {
  switch (type) {
    case ASSUMPTION_TYPE.PERCENTAGE:
      return [{ value: ASSUMPTION_UNIT.PERCENT, label: "Percent (%)" }];
    case ASSUMPTION_TYPE.CURRENCY:
      return [{ value: ASSUMPTION_UNIT.INR, label: "INR" }];
    case ASSUMPTION_TYPE.COUNT:
      return [{ value: ASSUMPTION_UNIT.COUNT, label: "Count (whole number)" }];
    case ASSUMPTION_TYPE.FX_RATE:
      return [{ value: ASSUMPTION_UNIT.INR_PER_USD, label: "INR per 1 USD" }];
    default:
      return [{ value: ASSUMPTION_UNIT.TEXT, label: "Text" }];
  }
}

export default function PlanningAssumptionDrawer({
  open,
  mode,
  assumption,
  onClose,
  onCommitEdit,
  onCommitAdd,
  initialAddMode = "manual",
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const [value, setValue] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addType, setAddType] = useState(ASSUMPTION_TYPE.PERCENTAGE);
  const [addUnit, setAddUnit] = useState(() => defaultUnitForType(ASSUMPTION_TYPE.PERCENTAGE));
  const [addNote, setAddNote] = useState("");
  const [addOutputKeys, setAddOutputKeys] = useState(() => new Set(["forecast_dashboard"]));
  const [error, setError] = useState("");
  const [addTab, setAddTab] = useState("manual");
  const [aiInput, setAiInput] = useState("");
  const [aiThread, setAiThread] = useState([]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "edit" && assumption) {
      setValue(assumption.valueDisplay);
      setAddLabel("");
      setAddValue("");
      setAddNote("");
    } else if (mode === "add") {
      setAddTab(initialAddMode === "ai" ? "ai" : "manual");
      setAiThread([]);
      setAiInput("");
      setAddLabel("");
      setAddValue("");
      setAddType(ASSUMPTION_TYPE.PERCENTAGE);
      setAddUnit(defaultUnitForType(ASSUMPTION_TYPE.PERCENTAGE));
      setAddNote("");
      setAddOutputKeys(new Set(["forecast_dashboard"]));
      setValue("");
    }
  }, [open, mode, assumption, initialAddMode]);

  useEffect(() => {
    setAddUnit(defaultUnitForType(addType));
  }, [addType]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (mode === "add" && addTab === "ai") {
        panelRef.current?.querySelector("#planning-ai-add-input")?.focus();
        return;
      }
      panelRef.current?.querySelector("input:not([type=hidden]), select")?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open, mode, addTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const toggleOutput = (key) => {
    setAddOutputKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return next;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleAiSend = () => {
    const trimmed = aiInput.trim();
    if (!trimmed) return;
    setAiInput("");
    const uid = `ai-u-${Date.now()}`;
    setAiThread((prev) => [...prev, { id: uid, role: "user", content: trimmed }]);

    const parsed = parseNaturalLanguagePlanningInput(trimmed);
    if (!parsed) {
      setAiThread((prev) => [
        ...prev,
        {
          id: `ai-a-${Date.now()}`,
          role: "assistant",
          content:
            "I could not infer a clear planning input from that yet. Try including a name, a number (for example 18% or USD/INR 85), and optionally which outputs it should feed (forecast, investor report, board pack, runway).",
        },
      ]);
      return;
    }

    const draft = { ...parsed, userMessage: trimmed };
    setAiThread((prev) => [
      ...prev,
      {
        id: `ai-p-${Date.now()}`,
        role: "assistant",
        kind: "proposal",
        draft,
      },
    ]);
  };

  const handleAiAddCommit = (draft) => {
    const usedIn = draft.outputKeys.map((k) => OUTPUT_REFS[k]).filter(Boolean);
    onCommitAdd({
      label: draft.label,
      type: draft.type,
      unit: draft.unit,
      value: draft.value,
      valueDisplay: draft.valueDisplay,
      usedIn,
      affects: businessAffectsFromOutputs(usedIn),
      note: draft.note,
      source: ASSUMPTION_SOURCE.CHAT,
      relatedUserMessage: draft.userMessage,
    });
    onClose();
  };

  const handleAiEditFirst = (draft) => {
    setAddLabel(draft.label);
    setAddType(draft.type);
    setAddUnit(draft.unit);
    setAddValue(draft.valueDisplay);
    setAddNote(draft.note || "");
    setAddOutputKeys(new Set(draft.outputKeys));
    setAddTab("manual");
    setError("");
    setAiThread((prev) => [
      ...prev,
      {
        id: `ai-switch-${Date.now()}`,
        role: "assistant",
        content: "Switched to Manual. Review and adjust the fields below, then Save.",
      },
    ]);
  };

  const dismissAiProposal = (msgId) => {
    setAiThread((prev) => prev.filter((m) => m.id !== msgId));
  };

  if (!open) return null;

  const affectsForEdit =
    assumption?.affects?.length ? assumption.affects : businessAffectsFromOutputs(assumption?.usedIn || []);

  const handleSaveEdit = () => {
    if (!assumption) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a value.");
      return;
    }
    const parsed = parseUserInputForAssumption(assumption, trimmed);
    if (!parsed) {
      setError("That value doesn’t match this assumption type. Check the hint below.");
      return;
    }
    onCommitEdit(parsed);
    onClose();
  };

  const handleSaveAdd = () => {
    const lab = addLabel.trim();
    const val = addValue.trim();
    if (!lab) {
      setError("Enter a name for this assumption.");
      return;
    }
    if (!val) {
      setError("Enter a value.");
      return;
    }
    if (addOutputKeys.size === 0) {
      setError("Select at least one place this assumption should feed.");
      return;
    }
    const parsed = parseValueForNewAssumption(val, addType, addUnit);
    if (!parsed) {
      setError("That value doesn’t match the selected type. Check the format hint.");
      return;
    }
    const usedIn = Array.from(addOutputKeys).map((k) => OUTPUT_REFS[k]);
    onCommitAdd({
      label: lab,
      type: addType,
      unit: addUnit,
      value: parsed.value,
      valueDisplay: parsed.valueDisplay,
      usedIn,
      note: addNote.trim() || null,
      affects: businessAffectsFromOutputs(usedIn),
    });
    onClose();
  };

  const unitOpts = unitOptionsForType(addType);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col border-l border-gray-200/90 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-semibold text-[#1a3673]">
            {mode === "edit" ? "Edit planning input" : "Add planning input"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#1a3673]"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {mode === "add" && (
          <div className="flex gap-1 border-b border-gray-100 px-5 py-2.5">
            <button
              type="button"
              onClick={() => {
                setAddTab("manual");
                setError("");
              }}
              className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition ${
                addTab === "manual"
                  ? "bg-[#1a3673] text-white shadow-sm"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => {
                setAddTab("ai");
                setError("");
              }}
              className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition ${
                addTab === "ai"
                  ? "bg-[#1a3673] text-white shadow-sm"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Ask AI
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {mode === "edit" && assumption && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assumption</p>
                <p className="mt-1 text-[16px] font-semibold text-slate-800">{assumption.label}</p>
                <p className="mt-1 text-[12px] text-slate-500">
                  Type: <span className="font-medium text-slate-700">{ASSUMPTION_TYPE_LABELS[assumption.type]}</span>
                  {" · "}
                  Unit: <span className="font-medium text-slate-700">{assumption.unit.replace(/_/g, " ")}</span>
                </p>
              </div>

              {assumption.lastUpdatedAt && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[12px] text-slate-600">
                  <p className="font-medium text-slate-700">
                    {assumption.source === ASSUMPTION_SOURCE.CHAT ? "Last updated via chat" : "Last updated manually"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {new Date(assumption.lastUpdatedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  {assumption.relatedUserMessage && (
                    <p className="mt-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600">
                      From: “{assumption.relatedUserMessage}”
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current value</p>
                <p className="mt-1 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[14px] font-medium text-slate-800">
                  {assumption.valueDisplay}
                </p>
              </div>
              <div>
                <label htmlFor="planning-assumption-value" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  New value
                </label>
                <input
                  id="planning-assumption-value"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError("");
                  }}
                  placeholder={valuePlaceholder(assumption.type, assumption.key)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none transition focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                />
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{valueFieldHelp(assumption.type, assumption.key)}</p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Used in</p>
                <ul className="mt-2 space-y-1 text-[13px] text-slate-600">
                  {assumption.usedIn.map((ref) => (
                    <li key={ref.id} className="flex gap-2">
                      <span className="text-slate-300">•</span>
                      <span>{ref.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Affects</p>
                <ul className="mt-2 space-y-1 text-[13px] text-slate-600">
                  {affectsForEdit.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="text-[#fc7d25]/80">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {assumption.note && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note on file</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{assumption.note}</p>
                </div>
              )}

              <div className="rounded-xl border border-[#1a3673]/12 bg-[#1a3673]/[0.04] px-3 py-3 text-[12px] leading-relaxed text-slate-700">
                Saving will refresh related forecasts and dashboards that depend on this baseline.
              </div>
            </div>
          )}

          {mode === "add" && addTab === "ai" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Examples</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
                  <li>Add a VAT assumption of 18%</li>
                  <li>Create an FX assumption for USD at 85</li>
                  <li>Add a hiring slowdown assumption for Q3</li>
                </ul>
              </div>

              <div>
                <label htmlFor="planning-ai-add-input" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Describe your input
                </label>
                <textarea
                  id="planning-ai-add-input"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAiSend();
                    }
                  }}
                  rows={2}
                  placeholder="Describe the planning input you want to add..."
                  className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                />
                <button
                  type="button"
                  onClick={handleAiSend}
                  disabled={!aiInput.trim()}
                  className="mt-2 w-full rounded-xl bg-[#1a3673] py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c] disabled:opacity-40"
                >
                  Send
                </button>
                <p className="mt-1.5 text-[10px] text-slate-400">Tip: Cmd/Ctrl + Enter to send</p>
              </div>

              {aiThread.length > 0 && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Conversation</p>
                  {aiThread.map((m) => {
                    if (m.role === "user") {
                      return (
                        <div key={m.id} className="flex justify-end">
                          <div className="max-w-[95%] rounded-2xl rounded-br-md bg-[#1a3673] px-3 py-2 text-[12px] leading-relaxed text-white">
                            {m.content}
                          </div>
                        </div>
                      );
                    }
                    if (m.kind === "proposal" && m.draft) {
                      return (
                        <div key={m.id} className="flex justify-start">
                          <AiAddProposalCard
                            draft={m.draft}
                            onAdd={() => handleAiAddCommit(m.draft)}
                            onEditFirst={() => handleAiEditFirst(m.draft)}
                            onCancel={() => dismissAiProposal(m.id)}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className="flex justify-start">
                        <div className="max-w-[100%] rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-800 shadow-sm">
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mode === "add" && addTab === "manual" && (
            <div className="space-y-5">
              <p className="text-[12px] leading-relaxed text-slate-600">
                New inputs become part of your planning baseline and flow to the outputs you select below.
              </p>

              <div>
                <label htmlFor="planning-add-label" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="planning-add-label"
                  value={addLabel}
                  onChange={(e) => {
                    setAddLabel(e.target.value);
                    setError("");
                  }}
                  placeholder="e.g. VAT rate, rent escalation"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                />
              </div>

              <div>
                <label htmlFor="planning-add-type" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Type <span className="text-rose-600">*</span>
                </label>
                <select
                  id="planning-add-type"
                  value={addType}
                  onChange={(e) => {
                    setAddType(e.target.value);
                    setError("");
                  }}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {ASSUMPTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="planning-add-unit" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Unit
                </label>
                <select
                  id="planning-add-unit"
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                >
                  {unitOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="planning-add-value" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Value <span className="text-rose-600">*</span>
                </label>
                <input
                  id="planning-add-value"
                  value={addValue}
                  onChange={(e) => {
                    setAddValue(e.target.value);
                    setError("");
                  }}
                  placeholder={valuePlaceholder(addType, "custom")}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                />
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{valueFieldHelp(addType, "custom")}</p>
              </div>

              <div>
                <label htmlFor="planning-add-note" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Note <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="planning-add-note"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  rows={3}
                  placeholder="Context for your team — why this assumption exists"
                  className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Feeds into <span className="text-rose-600">*</span>
                </p>
                <p className="mt-1 text-[12px] text-slate-500">Choose dashboards and reports this input should connect to.</p>
                <ul className="mt-3 space-y-2">
                  {OUTPUT_KEYS.map((k) => (
                    <li key={k}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={addOutputKeys.has(k)}
                          onChange={() => toggleOutput(k)}
                          className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-[#1a3673] focus:ring-[#1a3673]/30"
                        />
                        <span className="text-[13px] text-slate-700">{OUTPUT_REFS[k].label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[#1a3673]/12 bg-[#1a3673]/[0.04] px-3 py-3 text-[12px] leading-relaxed text-slate-700">
                We’ll derive planning impacts from your selections. Forecasts and packs that use these outputs will pick up this baseline.
              </div>
            </div>
          )}

          {error && (mode === "edit" || (mode === "add" && addTab === "manual")) && (
            <p className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-800" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-4">
          {mode === "add" && addTab === "ai" ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close drawer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={mode === "edit" ? handleSaveEdit : handleSaveAdd}
                className="flex-1 rounded-xl bg-[#1a3673] py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
