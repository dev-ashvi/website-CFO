import { classifyTransactionRow } from "./classify.js";
import { detectAmazonTransactionCsv, parseCsvText } from "./csv.js";
import { parseAmazonDate } from "./dates.js";
import { parseIndianNumber, roundMoney } from "./money.js";
import { MISSING_PRODUCT_COST, MISSING_REFERRAL_SPLIT, MISSING_UNITS } from "./schema.js";

function moneyField(record, key, issues, sourceRow) {
  const parsed = parseIndianNumber(record[key]);
  if (parsed.error) {
    issues.push({
      code: "malformed_number",
      sourceRow,
      field: key,
      message: `Row ${sourceRow}: could not parse ${key} ("${record[key]}").`,
    });
    return { value: null, missing: true };
  }
  if (parsed.empty) return { value: 0, missing: true };
  return { value: roundMoney(parsed.value), missing: false };
}

export function normalizeAmazonCsvText(csvText) {
  const parsed = parseCsvText(csvText);
  if (parsed.error) {
    return {
      ok: false,
      formatId: null,
      transactions: [],
      issues: [parsed.error],
      missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS, MISSING_REFERRAL_SPLIT],
      period: null,
    };
  }

  const detection = detectAmazonTransactionCsv(parsed.headers);
  if (!detection.ok) {
    return {
      ok: false,
      formatId: null,
      transactions: [],
      issues: [detection],
      missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS, MISSING_REFERRAL_SPLIT],
      period: null,
    };
  }

  const issues = [];
  const transactions = [];

  for (const row of parsed.rows) {
    const { sourceRow, record } = row;
    const date = parseAmazonDate(record.Date);
    if (date.error) {
      issues.push({
        code: "malformed_date",
        sourceRow,
        message: `Row ${sourceRow}: ${date.error}`,
      });
      continue;
    }

    const productCharges = moneyField(record, "Total product charges", issues, sourceRow);
    const promotionalRebates = moneyField(record, "Total promotional rebates", issues, sourceRow);
    const amazonFees = moneyField(record, "Amazon fees", issues, sourceRow);
    const otherAmount = moneyField(record, "Other", issues, sourceRow);
    const totalInr = moneyField(record, "Total (INR)", issues, sourceRow);
    if (
      [productCharges, promotionalRebates, amazonFees, otherAmount, totalInr].some((field) => field.value == null)
    ) {
      continue;
    }

    const base = {
      platform: "amazon",
      sourceRow,
      postedAt: date.iso,
      postedAtRaw: record.Date,
      status: String(record["Transaction Status"] || "").trim(),
      accountType: String(record["Account Type"] || "").trim(),
      transactionType: String(record["Transaction type"] || "").trim(),
      orderId: String(record["Order ID"] || "").trim() || null,
      productDetails: String(record["Product Details"] || "").trim(),
      productCharges: productCharges.value,
      promotionalRebates: promotionalRebates.value,
      amazonFees: amazonFees.value,
      amazonFeesMissing: amazonFees.missing,
      otherAmount: otherAmount.value,
      totalInr: totalInr.value,
      currency: "INR",
      quantity: null,
      productCost: null,
    };

    const classification = classifyTransactionRow(base);
    const componentSum = roundMoney(
      (base.productCharges || 0) +
        (base.promotionalRebates || 0) +
        (base.amazonFees || 0) +
        (base.otherAmount || 0),
    );
    if (Math.abs(componentSum - base.totalInr) > 0.05) {
      issues.push({
        code: "row_total_mismatch",
        sourceRow,
        message: `Row ${sourceRow}: component sum ${componentSum} does not equal Total (INR) ${base.totalInr}.`,
      });
    }

    transactions.push({
      ...base,
      productName: classification.productName,
      classification,
      lines: classification.lines,
      unknown: classification.known === false,
    });
  }

  const dates = transactions.map((t) => t.postedAt).filter(Boolean).sort();
  return {
    ok: true,
    formatId: detection.formatId,
    transactions,
    issues,
    missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS, MISSING_REFERRAL_SPLIT],
    period: dates.length
      ? { start: dates[0], end: dates[dates.length - 1], rowCount: transactions.length }
      : null,
  };
}

export function decodeUtf8(bytes) {
  if (typeof bytes === "string") return bytes;
  return new TextDecoder("utf-8").decode(bytes);
}
