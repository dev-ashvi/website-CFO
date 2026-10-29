/**
 * Minimal RFC4180-ish CSV parser for Amazon Seller Central exports.
 */

export function parseCsvText(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  if (!input.trim()) {
    return { headers: [], rows: [], error: { code: "empty_csv", message: "The CSV file is empty." } };
  }

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length && rows[rows.length - 1].every((cell) => String(cell).trim() === "")) {
    rows.pop();
  }
  if (!rows.length) {
    return { headers: [], rows: [], error: { code: "empty_csv", message: "The CSV file is empty." } };
  }

  const headers = rows[0].map((h) => String(h || "").trim());
  const body = rows.slice(1).map((cells, index) => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = cells[i] == null ? "" : String(cells[i]);
    });
    return { sourceRow: index + 2, record };
  });

  return { headers, rows: body, error: null };
}

export const AMAZON_TRANSACTION_HEADERS_V1 = [
  "Date",
  "Transaction Status",
  "Account Type",
  "Transaction type",
  "Order ID",
  "Product Details",
  "Total product charges",
  "Total promotional rebates",
  "Amazon fees",
  "Other",
  "Total (INR)",
];

export function detectAmazonTransactionCsv(headers) {
  const normalized = (headers || []).map((h) => String(h || "").trim());
  const missing = AMAZON_TRANSACTION_HEADERS_V1.filter((h) => !normalized.includes(h));
  if (missing.length) {
    return {
      ok: false,
      formatId: null,
      code: "unsupported_csv_format",
      message: `This CSV is not the supported Amazon transaction export. Missing columns: ${missing.join(", ")}.`,
      missing,
    };
  }
  return {
    ok: true,
    formatId: "amazon_transaction_csv_v1",
    code: "recognised",
    message: "Recognised Amazon Seller Central transaction CSV (V1).",
    missing: [],
  };
}
