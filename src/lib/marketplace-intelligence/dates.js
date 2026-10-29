/** Date helpers for Amazon India DD/M/YYYY and ISO filters. */

export function parseAmazonDate(raw) {
  const text = String(raw || "").trim();
  if (!text) return { iso: null, error: "empty_date" };
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { iso: null, error: `unparseable_date:${text}` };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, error: `invalid_date:${text}` };
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(check.getTime())) return { iso: null, error: `invalid_date:${text}` };
  return { iso, error: null };
}

export function weekKey(isoDate) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T00:00:00+05:30`);
  const day = (date.getUTCDay() + 6) % 7; // Monday=0 in IST calendar date
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - day);
  return monday.toISOString().slice(0, 10);
}

export function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : null;
}

export function inDateRange(isoDate, range) {
  if (!range?.start && !range?.end) return true;
  if (!isoDate) return false;
  if (range.start && isoDate < range.start) return false;
  if (range.end && isoDate > range.end) return false;
  return true;
}
