/** Temporary probe — delete after fixture generation. */
function round(n) {
  return Math.round(n);
}

function gen({ fulfillmentByMonth, equityMonth = 0, equityAmt = 0, capexMonth = 13, capexAmt = 300_000, cogsPct = 0.4, smPct = 0.2 }) {
  let volume = 2000;
  const aov = 1500;
  const volG = 0.01;
  const g = 0.002;
  const payrollBase = (150_000 * 225_000) / 225_450;
  const otherBase = (75_000 * 225_000) / 225_450;
  let payroll = payrollBase * (1 + g);
  let other = otherBase * (1 + g);
  let openInc = 3_000_000;
  let openEx = 3_000_000;
  let cumCapex = 0;
  const months = [];
  for (let m = 1; m <= 24; m++) {
    if (m > 1) {
      volume = round(volume * (1 + volG));
      payroll *= 1 + g;
      other *= 1 + g;
    }
    const ful = fulfillmentByMonth(m);
    const revenue = volume * aov;
    const cogs = revenue * cogsPct;
    const fulfillment = revenue * ful;
    const sm = revenue * smPct;
    const tech = 0;
    const varExcel = fulfillment + sm;
    const varEngine = cogs + fulfillment + sm + tech;
    const cm2 = revenue - varEngine;
    const fixed = payroll + other;
    const ebitda = cm2 - fixed;
    const capex = m === capexMonth ? capexAmt : 0;
    const equity = m === equityMonth ? equityAmt : 0;
    cumCapex += capex;
    const ncfInc = ebitda - capex + equity;
    const ncfEx = ebitda + equity;
    const closeInc = openInc + ncfInc;
    const closeEx = openEx + ncfEx;
    months.push({
      m,
      volume,
      revenue,
      cogs,
      fulfillment,
      ful,
      sm,
      varExcel,
      varEngine,
      fixed,
      ebitda,
      capex,
      equity,
      closeInc,
      closeEx,
      cumCapex,
    });
    openInc = closeInc;
    openEx = closeEx;
  }
  return months;
}

function chk(label, a, e, tol = 1) {
  const d = a - e;
  const ok = Math.abs(d) <= tol || Math.abs(d) < Math.max(0.01, Math.abs(e) * 1e-6);
  console.log(`${ok ? "OK" : "FAIL"} ${label}: got=${a} exp=${e} diff=${d}`);
}

const s1 = gen({ fulfillmentByMonth: () => 0.4 });
chk("M1 rev", s1[0].revenue, 3_000_000);
chk("M1 varExcel", s1[0].varExcel, 1_800_000);
chk("M1 fixed", s1[0].fixed, 225_000, 0.01);
chk("M1 ebitda", s1[0].ebitda, -225_000, 0.01);
chk("M1 close", s1[0].closeInc, 2_775_000, 0.01);
chk("M12 rev", s1[11].revenue, 3_346_500);
chk("M12 ebitda", s1[11].ebitda, -229_999.7982, 0.5);
chk("M12 close", s1[11].closeInc, 270_101.1061, 1);
chk("M13 ebitda", s1[12].ebitda, -230_459.7978, 0.5);
chk("M13 closeInc", s1[12].closeInc, -260_358.6916, 1);
chk("M13 closeEx", s1[12].closeEx, 39_641.3084, 1);
chk("M24 closeInc", s1[23].closeInc, -2_826_040.881, 1);
chk("M24 closeEx", s1[23].closeEx, -2_526_040.881, 1);

console.log("\nM12 detail", s1[11]);
console.log("M13 detail", s1[12]);
console.log("M24 detail", s1[23]);

// volume path for M12
let v = 2000;
for (let i = 2; i <= 12; i++) v = Math.round(v * 1.01);
console.log("vol12", v, "rev", v * 1500);
