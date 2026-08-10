/**
 * Map approved Excel golden inputs → simulator schema.
 * Fulfilment maps to productTechPercent (engine field productAndTechnology).
 */
export function mapExcelInputsToSimulator(excelInputs) {
  const capexEvents = [];
  const equityEvents = [];
  const debtEvents = [];
  (excelInputs.capexByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) capexEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });
  (excelInputs.equityByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) equityEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });
  (excelInputs.otherFundingByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) debtEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });

  /** @type {import('./types.js').SimulatorInputs} */
  const inputs = {
    companyName: "Golden Excel",
    email: "golden@example.com",
    phone: "+91 9876543210",
    industry: "Other",
    businessModel: "Other",
    startupStage: "Growth",
    mainPriority: "",
    currency: "INR",
    currentCashBalance: Number(excelInputs.startingCash),
    forecastStartMonth: "2026-07",
    revenueMode: "detailed",
    currentMonthlyRevenue: Number(excelInputs.displayedMonthlyRevenue) || 0,
    monthlyRevenueGrowth: 0,
    currentVolume: Number(excelInputs.currentVolume),
    monthlyVolumeGrowth: Number(excelInputs.monthlyVolumeGrowth),
    averageOrderValue: Number(excelInputs.aov),
    monthlyAovGrowth: Number(excelInputs.monthlyAovGrowth),
    cogsPercent: Number(excelInputs.cogsPercent),
    otherDirectCostsPercent: Number(excelInputs.otherDirectPercent),
    salesMarketingPercent: Number(excelInputs.salesMarketingPercent),
    productTechPercent: Number(excelInputs.fulfillmentPercent),
    monthlyPayroll: Number(excelInputs.monthlyPayroll),
    payrollGrowth: Number(excelInputs.payrollGrowth),
    otherFixedCosts: Number(excelInputs.otherFixed),
    otherFixedGrowth: Number(excelInputs.otherFixedGrowth),
    capexEvents,
    equityEvents,
    debtEvents,
  };

  if (excelInputs.fulfillmentChangeMonth && excelInputs.fulfillmentChangedPercent != null) {
    const match = String(excelInputs.fulfillmentChangeMonth).match(/(\d+)/);
    const fromMonth = match ? Number(match[1]) : 0;
    if (fromMonth >= 1) {
      inputs.productTechPercentChangeFromMonth = fromMonth;
      inputs.productTechPercentAfterChange = Number(excelInputs.fulfillmentChangedPercent);
    }
  }

  return inputs;
}

/**
 * Scenario 1 engine inputs from golden fixture (for dev QA / diagnostics).
 * @param {object} fixtureInputs scenario1.inputs from runwayExcelGoldenFixtures.json
 */
export function mapScenario1ExcelToSimulator(fixtureInputs) {
  return mapExcelInputsToSimulator(fixtureInputs);
}
