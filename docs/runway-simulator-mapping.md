# Runway Simulator — Workbook → Web Mapping

Source: `1. Runway Simulator_24-m_Cash flows.xlsx`

## Sheets

| Sheet | Role in web tool |
|---|---|
| **Input** | Form defaults + capital event schedules |
| **Output Model** | Deterministic 24-month projection engine |
| **Dashboard** | KPI definitions / runway headline logic |
| Trend Analysis | **Excluded** (MVP) |
| Scenario building | **Web what-if scenarios** (deterministic; not the Excel sheet) |
| Sheet2 | Empty — **Excluded** |

## Form flow (6 steps)

1. Business context
2. Starting financial position
3. Revenue
4. Expenses (variable + fixed)
5. Capital & cash events
6. Review & calculate

## Input sheet (yellow cells)

| Cell | Label | Unit | Default | Web field |
|---|---|---|---|---|
| B4 | Current Cash Balance | ₹ | 1,000,000 | `currentCashBalance` |
| B5 | Model Start Month | text | Jul 2026 | `forecastStartMonth` (YYYY-MM) |
| B8 | Current Volumes | nos. | 500 | detailed mode: `currentVolume` |
| B9 | Monthly Volume Growth | % | 2% | detailed: `monthlyVolumeGrowth` |
| B10 | Average Order / Service Value | ₹ | 1,500 | detailed: `averageOrderValue` |
| B11 | Monthly AOV Growth | % | 0% | detailed: `monthlyAovGrowth` |
| B12 | Current Monthly Revenue | ₹ | `=B10*B8` | simple mode: `currentMonthlyRevenue` |
| B13 | Monthly Revenue Growth | % | 5% | simple: `monthlyRevenueGrowth` |
| B14 | COGS / Cost of Services | % rev | 35% | `cogsPercent` (Variable expenses) |
| B15 | Other Direct Costs | % rev | 5% | `otherDirectCostsPercent` (Variable) |
| B18 | Sales & Marketing | % rev | 40% | `salesMarketingPercent` (Variable) |
| B19 | Product & Technology | % rev | 20% | `productTechPercent` (Variable) |
| B22 | Salary / Payroll | ₹ / mo | 150,000 | `monthlyPayroll` (Fixed) |
| B23 | Payroll Monthly Growth | % | 0.2% | `payrollGrowth` (Fixed) |
| B24 | Other fixed costs | ₹ / mo | 75,000 | `otherFixedCosts` (Fixed) |
| B25 | Other fixed Monthly Growth | % | 0.2% | `otherFixedGrowth` (Fixed) |
| B30:Y30 | Planned CapEx by month | ₹ | M6/10/13 = 500k | `capexEvents[]` |
| B34:Y34 | Equity inflow by month | ₹ | M4=2M, M9=5M | `equityEvents[]` |
| B35:Y35 | Debt/grant inflow by month | ₹ | 0 | `debtEvents[]` |

### Expense classification (web)

**Variable expenses** (entered as % of revenue):

- COGS / cost of services
- Other direct costs
- Sales & marketing
- Product & technology

> Sales & marketing and product & technology are modelled as % of revenue in this simplified tool, so they are classified as variable. A customized WYZ model may later split parts of those categories into fixed and variable components.

**Fixed expenses** (entered as ₹ / month + MoM growth %):

- Monthly payroll + payroll growth
- Other fixed costs + fixed cost growth

**Compatibility grouping** (optional nested view; engine still uses flat fields):

```js
variableExpenses: {
  cogsPercent,
  otherDirectCostsPercent,
  salesAndMarketingPercent, // maps from salesMarketingPercent
  productAndTechnologyPercent // maps from productTechPercent
}
fixedExpenses: {
  monthlyPayroll,
  payrollGrowthPercent, // maps from payrollGrowth
  otherFixedCosts,
  otherFixedCostGrowthPercent // maps from otherFixedGrowth
}
```

### Notes from workbook (assumptions kept)

- All sales are cash sales
- No working capital impact
- No tax impact
- Ending cash &lt; 0 → treat as cash-out (“No Cash”)

### Simple vs detailed revenue

- **Simple (default):** revenue grows from `currentMonthlyRevenue` using `monthlyRevenueGrowth` (maps to volume=revenue, AOV=1, volume growth=revenue growth).
- **Detailed:** volume × AOV with separate growth rates (Excel path).

## Output Model formulas (replicated)

For month `m` (columns B…Y):

1. **Volume:** M1 = Input volumes; M2+ = `ROUND(prev × (1 + volumeGrowth), 0)`
2. **AOV:** M1 = Input AOV; M2+ = `prev × (1 + aovGrowth)`
3. **Revenue** = Volume × AOV
4. **COGS** = Revenue × COGS%
5. **Gross Profit** = Revenue − COGS
6. **Other Direct** = Revenue × otherDirect%
7. **Net Profit (after direct)** = Gross Profit − Other Direct
8. **S&M** = Revenue × S&M%
9. **CM1** = Net Profit − S&M *(use month-1 formula for all months; Excel M2+ omitted other direct — treated as workbook inconsistency)*
10. **Product/Tech** = Revenue × tech%
11. **CM2** = CM1 − Product/Tech
12. **Payroll:** M1 = input payroll base; M2+ = prev × (1 + growth)
13. **Other fixed:** same growth pattern as payroll
14. **Excel Total Opex (for EBITDA)** = Payroll + Other fixed
15. **EBITDA** = CM2 − Excel Total Opex
16. **CapEx / Equity / Debt** = Input schedule for month `m`
17. **Total Cash Burn** = −EBITDA + CapEx
18. **Funds Inflow** = Equity + Debt
19. **Net Cash Flow** = −TotalCashBurn + FundsInflow
20. **Beginning Cash** = Input cash (M1) else prior Ending (signed; negatives retained after cash-out)
21. **Ending Cash** = Beginning + Net. If Ending &lt; 0, mark **cash-out** and retain the signed balance

> **Fixed-cost timing:** Approved golden workbooks use the input base in Month 1 and compound from Month 2. An earlier note that “Excel applies growth in Month 1” is superseded by `runwayExcelGoldenFixtures.json`.


### Web expense totals (reporting — CapEx excluded)

| Metric | Formula |
|---|---|
| **Total variable expenses** | COGS + Other direct + S&M + Product/Tech |
| **Total fixed expenses** | Payroll + Other fixed |
| **Total operating expenses** | Variable + Fixed (= gross burn) |

Excel’s “Total Opex” line remains payroll + other fixed for the **EBITDA** calculation only. The web reporting field `totalOperatingExpenses` is the full operating cash cost stack (variable + fixed).

## Burn metric definitions (web)

### Engine (per month)

| Metric | Definition | Notes |
|---|---|---|
| **Gross burn** | Total variable + total fixed | Operating cash outflow **before** revenue. CapEx excluded. Exposed as `grossBurn`. |
| **Net burn excl. CapEx** | −EBITDA = Gross burn − Revenue | Operating cash burn **after** revenue. CapEx and funding excluded. Exposed as `netBurn`. |
| **Net burn incl. CapEx** | −EBITDA + CapEx = `totalCashBurn` | Net burn plus that month’s CapEx. Funding excluded. Exposed as `netBurnIncludingCapex`. |

Algebra check: `grossBurn − revenue = −EBITDA = netBurn`. Funding never enters burn metrics.

### Displayed Burn & Cash KPIs (Month 1 / current period)

These are the primary values shown on the results page and in the AI assessment `burnMetrics` payload. They are **not** averages.

| Card | Definition | Engine fields |
|---|---|---|
| **Monthly gross burn** | Month 1 operating outflow before revenue | `months[0].grossBurn` → `burnMetrics.monthlyGrossBurn` |
| **Monthly net burn (excl. CapEx)** | Month 1 operating burn after revenue | `months[0].netBurn` → `burnMetrics.monthlyNetBurnExcludingCapex` |
| **Monthly net burn (incl. CapEx)** | Month 1 operating burn after revenue + Month 1 CapEx | `months[0].netBurnIncludingCapex` → `burnMetrics.monthlyNetBurnIncludingCapex` |

Subtitle: “Current monthly burn based on your starting assumptions.”

Signed values are shown as-is (negative net burn = cash-flow positive month). Expected cash-out remains on the **runway hero only** — not repeated in Burn & Cash.

### Internal forecast averages (not primary KPIs)

Retained for runway math, charts, and backward compatibility. Do not confuse with displayed Month 1 burn cards.

| Metric | Definition | Fields |
|---|---|---|
| Avg monthly gross burn | Mean of monthly gross burn over 24 months | `avgMonthlyGrossBurn` / `burnMetrics.avgGrossBurn` |
| Avg monthly net burn (excl. CapEx) | Mean of `max(netBurn, 0)` over 24 months | `avgMonthlyNetBurn` / `burnMetrics.avgNetBurnExcludingCapex` |
| Avg monthly net burn (incl. CapEx) | Mean of `max(totalCashBurn, 0)` over 24 months | `avgMonthlyNetBurnIncludingCapex` / `burnMetrics.avgNetBurnIncludingCapex` |

What-if scenario comparisons use the same **Month 1 net burn (excl. CapEx)** definition for base and scenario (`snapshotComparisonMetrics.avgNetBurn`).

## Results KPI card definitions (Month 1 unless noted)

Displayed under the runway hero. All values come from the deterministic engine — the AI assessment may explain them but must not recalculate.

**Page order:** (1) Runway hero → (2) Financial Performance → (3) Burn & Cash → (4) charts / Cash Flow Intelligence.

### Financial Performance

| Card | Absolute value | Secondary | Engine fields |
|---|---|---|---|
| **Revenue** | Month 1 revenue | Label: “Current monthly revenue” | `months[0].revenue` → `financialPerformance.revenue` |
| **Gross Margin** | Month 1 gross profit | Gross margin % | `grossProfit`, `grossMargin` |
| **CM1** | Month 1 CM1 | CM1 margin % | `cm1`, `cm1Margin` |
| **EBITDA** | Month 1 EBITDA | EBITDA margin % | `ebitda`, `ebitdaMargin` |

### Formula notes (unchanged workbook logic)

| Metric | Formula |
|---|---|
| **Gross Profit** | Revenue − COGS |
| **Gross Margin %** | Gross Profit ÷ Revenue |
| **CM1** | Gross Profit − Other Direct − S&M *(workbook month-1 path applied every month)* |
| **CM1 Margin %** | CM1 ÷ Revenue |
| **EBITDA** | CM2 − Payroll − Other fixed |
| **EBITDA Margin %** | EBITDA ÷ Revenue |

> **Ambiguity resolved:** Some product copy describes “gross margin after COGS and other direct costs.” The **approved engine / Excel Gross Profit** line is **Revenue − COGS only**. Other direct costs are deducted on the path to CM1, not inside Gross Profit. KPI cards and tooltips follow the engine.

## Closing cash including vs excluding CapEx

Two deterministic cash series are projected each month.

### Including CapEx (actual cash position)

This is the real projected cash balance after operations, funding and CapEx.

| Field | Role |
|---|---|
| `closingCash` / `closingCashIncludingCapex` | Source of truth |
| `cashOut` | First month closing cash &lt; 0 (and thereafter) |
| `netCashFlow` | −(−EBITDA + CapEx) + equity + debt |

**Drives:** runway months, expected cash-out, 6m/12m cash, health status, AI assessment, primary shortfall, what-if scenario cash charts.

### Excluding CapEx (operating cash position)

Independent roll-forward that keeps all operating and funding assumptions but removes CapEx outflows.

| Field | Formula |
|---|---|
| Opening M1 | Starting cash (`currentCashBalance`) |
| `netCashFlowExcludingCapex` | EBITDA + equity + debt (= `netCashFlow + CapEx`) |
| `closingCashExcludingCapex` | Opening excluding + net cash flow excluding |
| Opening M(n) | Prior closing excluding CapEx |
| `cumulativeCapex` | Sum of CapEx through month *m* |

Do **not** derive excluding cash by adding that month’s CapEx back onto `closingCash` — the series must carry the cumulative CapEx impact.

Identity (when both series start from the same cash):  
`closingCashExcludingCapex − closingCash = cumulativeCapex`.

### CapEx comparison KPIs (`kpis.capexComparison`)

| Field | Definition |
|---|---|
| `cashOutMonthIncludingCapex` | Same as primary `cashOutMonthIndex` |
| `cashOutMonthExcludingCapex` | First month `cashOutExcludingCapex` |
| `runwayMonthsIncludingCapex` | Same as primary `runwayMonths` |
| `runwayMonthsExcludingCapex` | Runway from excluding-CapEx series |
| `month24CashIncludingCapex` / `Excluding` | Month-24 closing balances |
| `capexRunwayImpactMonths` | Runway excluding − runway including (0 when neither cash-out; null when not meaningful) |
| `cumulativeCapex` | Total CapEx over 24 months |

### Chart behavior

- Title: **Closing cash position**
- Orange line: **Including CapEx** (primary)
- Navy line: **Excluding CapEx** (diagnostic)
- Primary cash-out marker on including series; muted second marker only if excluding cash-out differs
- Deterministic comparison caption + optional CapEx impact note
- What-if scenario charts continue to compare **including-CapEx** cash only (base vs scenario)

## Result metrics — expense mix (Expense Breakdown)

**Expense Breakdown is a Month 1 snapshot** — not a 24-month forecast average.

It answers: “What does my cost structure look like today?”  
Cash Flow Intelligence remains the full-horizon view of cash movement over time.

| Field | Definition |
|---|---|
| `period` | Always `"month1"` for the displayed mix |
| `variableExpenses` | Month 1 COGS + other direct + S&M + product/tech |
| `fixedExpenses` | Month 1 payroll + other fixed costs |
| `variableSharePercent` | Month 1 variable ÷ Month 1 operating expenses (0–1 in KPIs; percent in AI payload) |
| `fixedSharePercent` | Month 1 fixed ÷ Month 1 operating expenses |
| `largestExpenseCategory` | Highest Month 1 category among COGS, other direct, S&M, product/tech, payroll, other fixed |
| `largestExpenseCategoryAmount` | Absolute Month 1 amount for that category |

CapEx and funding are excluded. Shares sum to 100% (within rounding).

Forecast averages (`averageMonthlyVariableExpenses` / `averageMonthlyFixedExpenses`) may still exist internally for legacy consumers — they are **not** the displayed Expense Breakdown KPIs.

## What-if cost scenarios

Cost reduction applies from **month 2** onward (month 1 unchanged). Choose one target (not both by default):

| Target | Categories reduced |
|---|---|
| **Variable** | COGS, other direct, S&M, product/tech |
| **Fixed** | Payroll, other fixed |

Quick options: 5% / 10% / 15%. CapEx is never reduced. Payroll-delay remains a separate scenario.

## Dashboard KPIs mapped

| Dashboard | Web KPI |
|---|---|
| Runway months | Prefer **months until cash-out** across 24m; also report cash-out label |
| Cash-out month | First month ending cash goes negative |
| Runway status | Configurable: Critical / Attention / Stable / Healthy |
| Gross / Net burn | See burn definitions above |
| Gross margin %, EBITDA | From projection |
| 6m / 12m closing cash | Projection months 6 &amp; 12 (signed; may be negative after cash-out) |
| Expense mix | Variable vs fixed averages and shares |

## Differences from Excel workbook

- Web groups expenses into **variable** vs **fixed** for founder clarity; Excel lists the same lines without that UI split.
- Web `totalOperatingExpenses` / `grossBurn` / `totalVariableExpenses` include **Fulfilment** (mapped to `productTechPercent`). Some Excel sheet rows labelled “Variable costs” / “Gross Burn” omit Fulfilment; golden tests reconstruct website aggregates from Excel line items.
- Web what-if scenarios exist in-product; Excel Scenario building sheet remains excluded as a sheet import.
- Contact fields (email, phone) are collected for lead context and do not affect math.
- Website runway uses fractional cash-out math; do not assert Excel’s legacy runway formula against `kpis.runwayMonths` in golden tests.

## Excel Golden-Master Test Scenarios

Source fixture: `src/lib/financial-simulator/__fixtures__/runwayExcelGoldenFixtures.json`  
Tests: `src/lib/financial-simulator/runwayExcelGolden.test.js`

### Revenue convention

Golden scenarios always use **detailed** mode:

`Revenue = Volume × AOV`

| Input | Value |
|---|---|
| Starting volume | 2,000 |
| Monthly volume growth | 1% |
| Starting AOV | ₹1,500 |
| Monthly AOV growth | 0% |

Do **not** use the displayed 5% monthly-revenue-growth input. Expected revenues include Month 1 = ₹30,00,000; Month 2 = ₹30,30,000; Month 24 = ₹37,71,000.

### Scenario differences

| Scenario | Difference from base |
|---|---|
| **1 — Base + CapEx** | CapEx ₹3,00,000 in Month 13; fulfilment 40% all months; no funding |
| **2 — Equity funding** | Scenario 1 + ₹50,00,000 equity in Month 6 |
| **3 — Fulfilment improvement** | Fulfilment 40% Months 1–6, then 35% from Month 7; CapEx Month 13; no funding |

### Field mapping (Excel → engine)

| Excel row | Engine field |
|---|---|
| Current Volumes | `volume` |
| Average Order Value | `averageOrderValue` |
| Revenue | `revenue` |
| COGS | `cogs` |
| Other Direct Costs | `otherDirectCosts` |
| Fulfillment & other variable costs | `productAndTechnology` |
| Sales & Marketing costs | `salesAndMarketing` |
| Salary / Payroll | `payroll` |
| Other fixed costs | `otherFixedCosts` |
| Fixed costs | `totalFixedExpenses` |
| EBITDA | `ebitda` |
| CapEx | `capex` |
| Funds Inflow | `equityFunding + debtOrOtherFunding` |
| Net Cash Outflow | `netCashFlow` |
| Beginning Cash | `openingCash` |
| Ending Cash | `closingCash` / `closingCashIncludingCapex` |
| Ending Cash excluding CapEx | `closingCashExcludingCapex` |
| Net Burn (exc. Capex) | `netBurn` |

Website `totalVariableExpenses` / `grossBurn` are compared to the **sum of Excel line items including Fulfilment**, not the Excel aggregate rows that omit Fulfilment.

### Month-boundary behavior (Scenario 3)

- Months 1–6: fulfilment = 40% (`productTechPercent`)
- From Month 7: fulfilment = 35% (`productTechPercentChangeFromMonth` + `productTechPercentAfterChange`)

### Floating-point tolerance

- Currency: ± ₹1
- Percentages: ± 0.000001
- Volumes / indexes: exact

### Engine change locked by golden masters

Payroll / other fixed: **Month 1 = input base; growth compounds from Month 2** (matches approved golden workbooks).

## Excluded from v1

- Trend Analysis sheet
- Burn-multiple narrative (needs growth burn ÷ growth revenue)
- Full KPI scorecard color traffic lights
- Multi-scenario best/base/worst (CTA lock only)
