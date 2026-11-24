// Selectable input units. Every tool calculates in its own US units (the unit shown on the
// field definition); this layer converts what the user types in another unit to that base
// unit, and back for display. Results keep their own unit lists.

// Each unit: [factor, offset] so that base = value × factor + offset.
const PSI_PER_KPA = 0.14503773773020923;
const DIMS = {
  gauge: { // gauge pressure; stays gauge (the tools add the ambient pressure)
    base: "psig", si: "kPa(g)",
    units: { psig: [1, 0], "kPa(g)": [PSI_PER_KPA, 0], "bar(g)": [100 * PSI_PER_KPA, 0], "MPa(g)": [1000 * PSI_PER_KPA, 0], "kg/cm²(g)": [14.223343307120331, 0] },
  },
  abs: { // absolute pressure
    base: "psia", si: "kPa(a)",
    units: { psia: [1, 0], "kPa(a)": [PSI_PER_KPA, 0], "bar(a)": [100 * PSI_PER_KPA, 0], "MPa(a)": [1000 * PSI_PER_KPA, 0], atm: [14.695948775513449, 0], "kg/cm²(a)": [14.223343307120331, 0], mmHg: [0.019336777713, 0], inHg: [0.49115408, 0] },
  },
  stress: {
    base: "psi", si: "MPa",
    units: { psi: [1, 0], ksi: [1000, 0], Msi: [1e6, 0], kPa: [PSI_PER_KPA, 0], MPa: [1000 * PSI_PER_KPA, 0], GPa: [1e6 * PSI_PER_KPA, 0] },
  },
  temp: {
    base: "°F", si: "°C",
    units: { "°F": [1, 0], "°C": [1.8, 32], K: [1.8, -459.67], "°R": [1, -459.67] },
  },
  lenIn: {
    base: "in", si: "mm",
    units: { in: [1, 0], mm: [1 / 25.4, 0], cm: [1 / 2.54, 0], m: [1 / 0.0254, 0], ft: [12, 0] },
  },
  lenFt: {
    base: "ft", si: "m",
    units: { ft: [1, 0], m: [1 / 0.3048, 0], in: [1 / 12, 0], mm: [1 / 304.8, 0], km: [1000 / 0.3048, 0], mi: [5280, 0] },
  },
  area: {
    base: "in²", si: "mm²",
    units: { "in²": [1, 0], "mm²": [1 / 645.16, 0], "cm²": [1 / 6.4516, 0] },
  },
  force: {
    base: "lbf", si: "N",
    units: { lbf: [1, 0], kip: [1000, 0], N: [0.22480894309971047, 0], kN: [224.80894309971047, 0] },
  },
  lineLoad: {
    base: "lbf/in", si: "N/mm",
    units: { "lbf/in": [1, 0], "lbf/ft": [1 / 12, 0], "kip/ft": [1000 / 12, 0], "N/mm": [5.710147154732646, 0], "N/m": [0.005710147154732646, 0], "kN/m": [5.710147154732646, 0] },
  },
  conductivity: {
    base: "Btu/(hr·ft·°F)", si: "W/(m·K)",
    units: { "Btu/(hr·ft·°F)": [1, 0], "W/(m·K)": [0.5778, 0], "Btu·in/(hr·ft²·°F)": [1 / 12, 0] },
  },
};
const BY_BASE = Object.fromEntries(Object.entries(DIMS).map(([k, d]) => [d.base, k]));

/** Dimension of a number field, from the unit on its definition; null when it has no unit choice. */
export function dimOf(field) {
  if (field.type !== "number" || field.unitKey || field.noConvert) return null;
  return BY_BASE[field.unit] || null;
}

/** Unit choices for a field (base unit first). */
export const unitsOf = (field) => Object.keys(DIMS[dimOf(field)].units);

/** Unit the field shows for a unit system ("US" or "SI"). */
export const systemUnit = (field, system) => (system === "SI" ? DIMS[dimOf(field)].si : DIMS[dimOf(field)].base);

/** Displayed value → the tool's base unit. */
export function toBase(field, unit, x) {
  const u = DIMS[dimOf(field)].units[unit];
  return u ? x * u[0] + u[1] : x;
}

/** Base-unit value → displayed unit, trimmed to 10 significant digits so round trips read cleanly. */
export function fromBase(field, unit, x) {
  const u = DIMS[dimOf(field)].units[unit];
  if (!u || u[0] === 1 && u[1] === 0) return x;
  return +(((x - u[1]) / u[0]).toPrecision(10));
}

/** Units shown for each convertible field of a tool: saved choices over the system defaults. */
export function unitsFor(tool, system, saved = {}) {
  const out = {};
  for (const f of tool.fields) {
    if (!dimOf(f)) continue;
    out[f.key] = saved[f.key] && saved[f.key] in DIMS[dimOf(f)].units ? saved[f.key] : systemUnit(f, system);
  }
  return out;
}

/** Value as shown in the input box: 6 significant digits after a conversion, untouched in the base unit. */
export function displayValue(field, unit, x) {
  const u = DIMS[dimOf(field)].units[unit];
  if (!u || u[0] === 1 && u[1] === 0) return String(x);
  return String(+fromBase(field, unit, x).toPrecision(6));
}
