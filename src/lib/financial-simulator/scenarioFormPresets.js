import FIXTURES from "./__fixtures__/runwayExcelGoldenFixtures.json" with { type: "json" };
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";
import { RUNWAY_FORM_SCHEMA_VERSION } from "./defaults.js";

const emptyEvent = () => ({ monthIndex: "", amount: "" });

function buildScenario1Template() {
  const engine = mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario1.inputs));

  return {
    ...engine,
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    companyName: engine.companyName || "Scenario 1 QA",
    email: engine.email || "qa@example.com",
    phone: engine.phone || "+91 9876543210",
    salesMarketingPercent: 0.2,
    productTechPercent: 0.4,
    // Approved Scenario 1 workbook: CapEx = ₹0 for all months.
    capexEvents: [emptyEvent()],
    equityEvents: [emptyEvent()],
    debtEvents: [emptyEvent()],
  };
}

function buildScenario2Template() {
  const engine = mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario2.inputs));
  const primaryEquity = engine.equityEvents.find((e) => e.amount > 0) || {
    monthIndex: 6,
    amount: 5_000_000,
  };

  return {
    ...engine,
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    companyName: engine.companyName || "Scenario 2 QA",
    email: engine.email || "qa@example.com",
    phone: engine.phone || "+91 9876543210",
    salesMarketingPercent: 0.2,
    productTechPercent: 0.4,
    // Same operating base as Scenario 1 — CapEx remains zero; only equity differs.
    capexEvents: [emptyEvent()],
    equityEvents: [{ monthIndex: Number(primaryEquity.monthIndex), amount: Number(primaryEquity.amount) }],
    debtEvents: [emptyEvent()],
  };
}

function buildScenario4Template() {
  const engine = mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario1.inputs));

  return {
    ...engine,
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    companyName: engine.companyName || "Scenario 4 QA",
    email: engine.email || "qa@example.com",
    phone: engine.phone || "+91 9876543210",
    salesMarketingPercent: 0.2,
    productTechPercent: 0.4,
    // Scenario 4: Month 1 CapEx ₹10L + Equity ₹40L Month 6
    capexEvents: [{ monthIndex: 1, amount: 1_000_000 }],
    equityEvents: [{ monthIndex: 6, amount: 4_000_000 }],
    debtEvents: [emptyEvent()],
  };
}

/** Frozen canonical templates (source of truth for presets). */
export const SCENARIO_1_FORM_TEMPLATE = Object.freeze(buildScenario1Template());
export const SCENARIO_2_FORM_TEMPLATE = Object.freeze(buildScenario2Template());
export const SCENARIO_4_FORM_TEMPLATE = Object.freeze(buildScenario4Template());

/** Mutable clone for React form state. */
export function cloneFormInputs(preset) {
  return structuredClone
    ? structuredClone(preset)
    : JSON.parse(JSON.stringify(preset));
}

/**
 * Scenario 1 form state from approved Excel golden fixture.
 * Fulfilment → productTechPercent; CapEx none; no funding.
 */
export function getScenario1FormInputs() {
  return cloneFormInputs(SCENARIO_1_FORM_TEMPLATE);
}

/**
 * Scenario 2 = Scenario 1 + ₹50L equity Month 6. CapEx remains none.
 */
export function getScenario2FormInputs() {
  return cloneFormInputs(SCENARIO_2_FORM_TEMPLATE);
}

/**
 * Scenario 4 = Scenario 1 ops + Month 1 CapEx ₹10L + Equity ₹40L Month 6.
 */
export function getScenario4FormInputs() {
  return cloneFormInputs(SCENARIO_4_FORM_TEMPLATE);
}
