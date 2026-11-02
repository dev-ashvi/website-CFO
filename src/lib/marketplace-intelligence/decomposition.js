/**
 * Gross Product Sales decomposition: Sales = Orders × Gross AOV.
 *
 * Audit identity (three-term, no double-counting):
 *   ΔS = S1 − S0
 *   ΔO = O1 − O0
 *   ΔA = A1 − A0
 *   orderEffect       = ΔO × A0
 *   aovEffect         = O0 × ΔA
 *   interactionEffect = ΔO × ΔA
 *   orderEffect + aovEffect + interactionEffect = ΔS
 *
 * Founder-facing presentation (symmetric / Shapley two-factor):
 *   orderContribution = orderEffect + ½·interaction = ΔO × (A0+A1)/2
 *   aovContribution   = aovEffect   + ½·interaction = ΔA × (O0+O1)/2
 *   orderContribution + aovContribution = ΔS
 *
 * Compute on unrounded underlying metrics; round only for display/residual checks.
 */
import { formatMonthLabel } from "./askPresentation.js";
import { roundMoney, ratio } from "./money.js";

export const DECOMPOSITION_METHOD = "sales_orders_aov_three_term_identity";
export const DECOMPOSITION_PRESENTATION_METHOD = "sales_orders_aov_symmetric_shapley";
export const DECOMPOSITION_TOLERANCE_INR = 0.05;

function emptyBase(prior, current, priorLabel, currentLabel) {
  return {
    method: DECOMPOSITION_METHOD,
    presentationMethod: DECOMPOSITION_PRESENTATION_METHOD,
    prior: {
      month: prior?.month || null,
      label: priorLabel,
      sales: prior?.sales ?? null,
      orders: prior?.orders ?? null,
      aov: null,
    },
    current: {
      month: current?.month || null,
      label: currentLabel,
      sales: current?.sales ?? null,
      orders: current?.orders ?? null,
      aov: null,
    },
    deltaSales: null,
    deltaOrders: null,
    deltaAov: null,
    // Three-term audit
    orderEffect: null,
    aovEffect: null,
    interactionEffect: null,
    // Symmetric presentation
    orderContribution: null,
    aovContribution: null,
    comparable: false,
    reconciles: false,
    presentationReconciles: false,
    residual: null,
    presentationResidual: null,
    incomparableReason: null,
  };
}

/**
 * Decompose a period-to-period sales change.
 * @param {{ month?: string, sales: number|null, orders: number|null, aov: number|null }} prior
 * @param {{ month?: string, sales: number|null, orders: number|null, aov: number|null }} current
 */
export function decomposeSalesOrdersAov(prior, current) {
  const pSales = prior?.sales;
  const cSales = current?.sales;
  const pOrders = prior?.orders;
  const cOrders = current?.orders;
  const pAovRaw = prior?.aov != null && Number.isFinite(prior.aov) ? prior.aov : ratio(pSales, pOrders);
  const cAovRaw = current?.aov != null && Number.isFinite(current.aov) ? current.aov : ratio(cSales, cOrders);

  const priorLabel = prior?.month ? formatMonthLabel(prior.month) || prior.month : "Prior";
  const currentLabel = current?.month
    ? formatMonthLabel(current.month) || current.month
    : "Current";

  const base = emptyBase(prior, current, priorLabel, currentLabel);
  base.prior.aov = pAovRaw ?? null;
  base.current.aov = cAovRaw ?? null;

  if (
    pSales == null ||
    cSales == null ||
    !Number.isFinite(pSales) ||
    !Number.isFinite(cSales) ||
    pOrders == null ||
    cOrders == null ||
    !Number.isFinite(pOrders) ||
    !Number.isFinite(cOrders)
  ) {
    return { ...base, incomparableReason: "missing_sales_or_orders" };
  }

  // Keep unrounded delta for exact reconciliation; roundMoney only for published fields.
  const deltaSalesRaw = cSales - pSales;
  const deltaSales = roundMoney(deltaSalesRaw);
  const deltaOrders = cOrders - pOrders;

  if (pOrders === 0 && cOrders === 0) {
    return {
      ...base,
      deltaSales,
      deltaOrders: 0,
      deltaAov: null,
      comparable: true,
      reconciles: Math.abs(deltaSalesRaw) <= DECOMPOSITION_TOLERANCE_INR,
      presentationReconciles: Math.abs(deltaSalesRaw) <= DECOMPOSITION_TOLERANCE_INR,
      residual: roundMoney(deltaSalesRaw),
      presentationResidual: roundMoney(deltaSalesRaw),
      incomparableReason: deltaSalesRaw !== 0 ? "zero_orders_both_periods" : null,
      orderEffect: 0,
      aovEffect: 0,
      interactionEffect: 0,
      orderContribution: 0,
      aovContribution: 0,
    };
  }

  if (pOrders === 0) {
    return {
      ...base,
      deltaSales,
      deltaOrders,
      deltaAov: null,
      comparable: false,
      reconciles: false,
      presentationReconciles: false,
      residual: roundMoney(deltaSalesRaw),
      presentationResidual: roundMoney(deltaSalesRaw),
      incomparableReason: "zero_prior_orders",
    };
  }

  if (pAovRaw == null || !Number.isFinite(pAovRaw)) {
    return {
      ...base,
      deltaSales,
      deltaOrders,
      deltaAov: null,
      comparable: false,
      reconciles: false,
      presentationReconciles: false,
      residual: roundMoney(deltaSalesRaw),
      presentationResidual: roundMoney(deltaSalesRaw),
      incomparableReason: "missing_prior_aov",
    };
  }

  const cAov =
    cAovRaw != null && Number.isFinite(cAovRaw)
      ? cAovRaw
      : cOrders > 0
        ? ratio(cSales, cOrders)
        : null;
  const deltaAovRaw = cAov != null && Number.isFinite(cAov) ? cAov - pAovRaw : null;

  if (deltaAovRaw == null || !Number.isFinite(deltaAovRaw)) {
    const orderEffectRaw = deltaOrders * pAovRaw;
    const residualRaw = deltaSalesRaw - orderEffectRaw;
    return {
      ...base,
      deltaSales,
      deltaOrders,
      deltaAov: null,
      orderEffect: roundMoney(orderEffectRaw),
      aovEffect: 0,
      interactionEffect: 0,
      orderContribution: roundMoney(orderEffectRaw),
      aovContribution: 0,
      comparable: true,
      reconciles: Math.abs(residualRaw) <= DECOMPOSITION_TOLERANCE_INR,
      presentationReconciles: Math.abs(residualRaw) <= DECOMPOSITION_TOLERANCE_INR,
      residual: roundMoney(residualRaw),
      presentationResidual: roundMoney(residualRaw),
      incomparableReason: cOrders === 0 ? null : "missing_current_aov",
    };
  }

  // Unrounded three-term
  const orderEffectRaw = deltaOrders * pAovRaw;
  const aovEffectRaw = pOrders * deltaAovRaw;
  const interactionRaw = deltaOrders * deltaAovRaw;
  const threeSumRaw = orderEffectRaw + aovEffectRaw + interactionRaw;
  const residualRaw = deltaSalesRaw - threeSumRaw;

  // Symmetric presentation: split interaction equally (Shapley two-factor)
  const orderContributionRaw = orderEffectRaw + interactionRaw / 2;
  const aovContributionRaw = aovEffectRaw + interactionRaw / 2;
  // Equivalent: deltaOrders * (pAovRaw + cAov) / 2  and  deltaAovRaw * (pOrders + cOrders) / 2
  const presentationSumRaw = orderContributionRaw + aovContributionRaw;
  const presentationResidualRaw = deltaSalesRaw - presentationSumRaw;

  return {
    ...base,
    current: { ...base.current, aov: cAov },
    deltaSales,
    deltaOrders,
    deltaAov: roundMoney(deltaAovRaw),
    orderEffect: roundMoney(orderEffectRaw),
    aovEffect: roundMoney(aovEffectRaw),
    interactionEffect: roundMoney(interactionRaw),
    orderContribution: roundMoney(orderContributionRaw),
    aovContribution: roundMoney(aovContributionRaw),
    comparable: true,
    reconciles: Math.abs(residualRaw) <= DECOMPOSITION_TOLERANCE_INR,
    presentationReconciles: Math.abs(presentationResidualRaw) <= DECOMPOSITION_TOLERANCE_INR,
    residual: roundMoney(residualRaw),
    presentationResidual: roundMoney(presentationResidualRaw),
    incomparableReason: null,
  };
}

/**
 * Primary driver from founder-facing two-factor contributions (falls back to three-term).
 */
export function primaryDriverLabel(decomp) {
  if (!decomp?.comparable) return null;
  const parts = [
    {
      id: "orders",
      label: "Orders",
      amount: decomp.orderContribution != null ? decomp.orderContribution : decomp.orderEffect,
    },
    {
      id: "gross_aov",
      label: "Gross AOV",
      amount: decomp.aovContribution != null ? decomp.aovContribution : decomp.aovEffect,
    },
  ].filter((row) => row.amount != null && Number.isFinite(row.amount));
  if (!parts.length) return null;
  parts.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return parts[0];
}
