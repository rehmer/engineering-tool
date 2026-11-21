// Number formatting shared by the tool views and the calc record.

/** Significant-figure formatting with thousands separators; exponent form for very large or small values. */
export function fmt(v, sig = 4) {
  if (v === null || v === undefined || typeof v !== "number" || !Number.isFinite(v)) return "NA";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e7 || a < 1e-4) return v.toExponential(Math.max(1, sig - 1));
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return v.toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 8), maximumFractionDigits: Math.min(d, 8) });
}

export const pct = (v, digits = 3) => (Number.isFinite(v) ? (v * 100).toFixed(digits) + " %" : "NA");

/** Format a result row value: numbers, {pct} objects, or plain strings. */
export function cell(v, sig = 6) {
  if (v && typeof v === "object" && "pct" in v) return pct(v.pct);
  if (typeof v === "number") return fmt(v, sig);
  return v ?? "";
}

export function resultValue(row) {
  if (row.sci) return Number.isFinite(row.value) ? row.value.toExponential(2) : "NA";
  return typeof row.value === "number" ? fmt(row.value, row.digits ?? 5) : String(row.value ?? "");
}

/** Display an input value with its unit. */
export function inputValue(field, v, all) {
  if (field.type === "number") return { value: String(v), unit: field.unitKey ? all[field.unitKey] : field.unit || "" };
  return { value: String(v), unit: "" };
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const today = () => new Date().toISOString().slice(0, 10);
