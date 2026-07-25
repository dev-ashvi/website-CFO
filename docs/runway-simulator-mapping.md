# Runway Simulator — Workbook → Web Mapping

Source: `1. Runway Simulator_24-m_Cash flows.xlsx`

## Sheets

| Sheet | Role in web tool |
|---|---|
| **Input** | Form defaults + capital event schedules |
| **Output Model** | Deterministic 24-month projection engine |
| **Dashboard** | KPI definitions / runway headline logic |
| Trend Analysis | **Excluded** (MVP) |
| Scenario building | **Excluded** (locked CTA teaser only) |
| Sheet2 | Empty — **Excluded** |

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
| B14 | COGS / Cost of Services | % rev | 35% | `cogsPercent` |
| B15 | Other Direct Costs | % rev | 5% | `otherDirectCostsPercent` |
| B18 | Sales & Marketing | % rev | 40% | `salesMarketingPercent` |
| B19 | Product & Technology | % rev | 20% | `productTechPercent` |
| B22 | Salary / Payroll | ₹ / mo | 150,000 | `monthlyPayroll` |
| B23 | Payroll Monthly Growth | % | 0.2% | `payrollGrowth` |
| B24 | Other fixed costs | ₹ / mo | 75,000 | `otherFixedCosts` |
| B25 | Other fixed Monthly Growth | % | 0.2% | `otherFixedGrowth` |
| B30:Y30 | Planned CapEx by month | ₹ | M6/10/13 = 500k | `capexEvents[]` |
| B34:Y34 | Equity inflow by month | ₹ | M4=2M, M9=5M | `equityEvents[]` |
| B35:Y35 | Debt/grant inflow by month | ₹ | 0 | `debtEvents[]` |

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
12. **Payroll:** M1 = `payroll × (1 + payrollGrowth)`; M2+ = prev × (1 + growth)
13. **Other fixed:** same growth pattern as payroll
14. **Total Opex** = Payroll + Other fixed
15. **EBITDA** = CM2 − Total Opex
16. **CapEx / Equity / Debt** = Input schedule for month `m`
17. **Total Cash Burn** = −EBITDA + CapEx
18. **Funds Inflow** = Equity + Debt
19. **Net Cash Flow** = −TotalCashBurn + FundsInflow
20. **Beginning Cash** = Input cash (M1) else prior Ending (signed; negatives retained after cash-out)
21. **Ending Cash** = Beginning + Net. If Ending &lt; 0, mark **cash-out** and retain the signed balance (web display shows funding shortfall; Excel labelled this “No Cash”)

## Burn metric definitions (web)

| Metric | Definition | Notes |
|---|---|---|
| **Gross burn** (monthly) | COGS + Other direct + S&amp;M + Product/Tech + Payroll + Other fixed | Total **cash operating outflow**. CapEx excluded (capital). No line double-counted. |
| **Net burn** (monthly) | −EBITDA = Gross burn − Revenue | Operating cash loss **after** revenue. CapEx and funding inflows excluded. |
| **Total cash burn** (runway math) | −EBITDA + CapEx = Net burn + CapEx | Used for cash roll-forward / runway. |
| **Avg monthly gross burn** | Mean of monthly gross burn over 24 months | |
| **Avg monthly net burn** | Mean of `max(netBurn, 0)` over 24 months | Profitable months contribute 0 so the average reflects cash-consuming months only. |

Algebra check: `grossBurn − revenue = −EBITDA = netBurn`. Adding gross and net burn in the UI would double-count shared cost lines — they are alternative views, not additive.

## Dashboard KPIs mapped

| Dashboard | Web KPI |
|---|---|
| Runway months (`SUMPRODUCT` positive ending cash Y1) | Prefer **months until cash-out** across 24m (clearer); also report cash-out label |
| Cash-out month | First month ending cash goes negative |
| Runway status | Configurable: Critical / Attention / Stable / Healthy |
| Gross / Net burn | See burn definitions above |
| Gross margin %, EBITDA | From projection |
| 6m / 12m closing cash | Projection months 6 &amp; 12 (signed; may be negative after cash-out) |

## Excluded from v1

- Scenario building sheet
- Trend Analysis sheet
- Burn-multiple narrative (needs growth burn ÷ growth revenue)
- Full KPI scorecard color traffic lights
- Multi-scenario best/base/worst (CTA lock only)
