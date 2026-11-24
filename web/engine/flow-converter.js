// Gas flow rate converter. Mirrors workbook sheet 'Flow rate converter'.
// Cell references in comments point at that sheet.
import { GAS, props, psatWater, fToK } from "./properties.js";
import { EQ_GASES, EQ_BASES, STD_UNITS, EQ_METHOD, equivalenceReport } from "./fluid-equivalence.js";

const R_SHEET = 8.314;           // the sheet's own gas constant (C30, C34)
const PA_PER_PSI_SHEET = 6895;   // the sheet's psi→Pa factor (E6:E13)
const LB_TO_KG = 0.45359237;
const KGM3_TO_LBFT3 = 0.062428;

export const MASS_UNITS = {
  "lbm/hr": 1, "lb/min": 60, "lb/s": 3600,
  "kg/hr": 1 / LB_TO_KG, "kg/min": 60 / LB_TO_KG, "kg/s": 3600 / LB_TO_KG,
};

export const FLUIDS = ["Acetylene", "Air", "Ammonia", "Argon", "Butane", "Carbon Dioxide", "Helium", "Hydrogen", "Methane", "Nitrogen", "Water"];

/** Core calculation with the workbook's input set (rh and rhs as fractions, as stored in C15/F15). */
export function convert(i) {
  const fluid = String(i.fluid).toUpperCase();
  const water = fluid === "WATER", air = fluid === "AIR";
  const eng = water ? "AIR" : fluid;
  const Ptot = i.pg + i.pamb;                     // C12 psia
  const E12 = PA_PER_PSI_SHEET * Ptot;            // Pa abs
  const E13 = PA_PER_PSI_SHEET * i.ps;            // reference Pa abs
  const E8 = fToK(i.t), E14 = fToK(i.ts);
  const MW = water ? 18.015268 : GAS[eng][0];
  const pvA = air ? Math.min(E12 * 0.999999, Math.max(0, i.rh) * psatWater(((i.t - 32) * 5) / 9)) : 0;
  const pvS = air ? Math.min(E13 * 0.999999, Math.max(0, i.rhs) * psatWater(((i.ts - 32) * 5) / 9)) : 0;
  const act = props(eng, E8, E12, i.method);
  const ref = props(eng, E14, E13, i.method);
  const humid = (P, pv, T) => ((P - pv) * 0.02896546 + pv * 0.01801528) / (R_SHEET * T);
  const C30 = water ? 999.8 : air ? humid(E12, pvA, E8) : (MW * E12) / (1000 * R_SHEET * E8);
  const E30 = air ? C30 : water ? 999.8 : act.valid ? act.rho : NaN;
  const C32 = water ? 999.8 : air ? C30 : i.method === "Ideal Gas" ? (act.valid ? C30 : NaN) : E30;
  const C34 = water ? NaN : ref.valid ? (air ? humid(E13, pvS, E14) : (MW * E13) / (1000 * R_SHEET * E14)) : NaN;
  const C33 = air ? C34 : water ? NaN : ref.valid ? ref.rho : NaN;
  const rhoRef = i.method === "Ideal Gas" ? C34 : C33;
  const m = i.mlbhr;
  return {
    water, air, MW, Tact: E8, Pact: E12, Tref: E14, Pref: E13, pvA, pvS, act, ref,
    rhoIdeal: C30, rhoSel: E30, rhoUsed: C32, rhoRefIdeal: C34, rhoRefSel: C33, rhoRef,
    mass: { lbs: m / 3600, lbmin: m / 60, lbhr: m, kgs: (m * LB_TO_KG) / 3600, kgmin: (m * LB_TO_KG) / 60, kghr: m * LB_TO_KG },
    nm3: water ? NaN : (m * LB_TO_KG) / rhoRef,                 // C23
    scfm: water ? NaN : m / (rhoRef * KGM3_TO_LBFT3) / 60,      // C24
    acfm: m / (C32 * KGM3_TO_LBFT3) / 60,                       // C25
  };
}

const pctDiff = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? (a - b) / b : NaN);

export const INPUT_BASES = ["Mass flow", "Standard volume flow", "Actual volume flow"];
/** Actual volume units, as factors to ft³/min at line conditions. */
export const ACT_UNITS = { "ACFM": 1, "ACFH": 1 / 60, "Am³/hr": 35.3146667215 / 60, "Am³/min": 35.3146667215, "ALPM": 0.0353146667215 };

/** Mass flow (lbm/hr) from the selected input basis. Densities don't depend on flow, so solve with a unit flow first. */
function massFromInputs(v, base) {
  if (v.basis === "Standard volume flow") {
    const r = convert({ ...base, mlbhr: 1 });
    return v.qs * STD_UNITS[v.qsunit] * 60 * r.rhoRef * KGM3_TO_LBFT3;
  }
  if (v.basis === "Actual volume flow") {
    const r = convert({ ...base, mlbhr: 1 });
    return v.qa * ACT_UNITS[v.qaunit] * 60 * r.rhoUsed * KGM3_TO_LBFT3;
  }
  return v.m * MASS_UNITS[v.munit];
}

const eqOn = (v) => v.eqRec === "Yes";

export default {
  id: "flow-converter",
  title: "Gas Flow Rate Converter",
  short: "Flow Rate Converter",
  version: "1.1.0",
  summary: "Convert between mass, actual volume and standard volume flow. Uses ideal-gas or Peng-Robinson density, with humidity correction for air. Includes a fluid-equivalence calculator for standard flow tested with one gas.",
  groups: [
    { id: "fluid", label: "" },
    { id: "actual", label: "Actual conditions" },
    { id: "ref", label: "Standard / normal reference" },
    { id: "equiv", label: "", panel: "equiv" },
    { id: "equiv-p", label: "Device conditions (same for both gases)", panel: "equiv" },
  ],
  fields: [
    { key: "fluid", label: "Fluid", type: "select", options: FLUIDS, default: "Argon", group: "fluid" },
    { key: "method", label: "Density method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Ideal Gas", group: "fluid" },
    { key: "basis", label: "Known flow is", type: "select", options: INPUT_BASES, default: "Mass flow", group: "fluid", full: true },
    { key: "m", label: "Mass flow rate", type: "number", default: 631.6, unitKey: "munit", units: Object.keys(MASS_UNITS), group: "fluid", full: true, showIf: (v) => v.basis === "Mass flow" },
    { key: "munit", type: "unit", default: "lbm/hr" },
    { key: "qs", label: "Standard volume flow (at the reference below)", type: "number", default: 100, unitKey: "qsunit", units: Object.keys(STD_UNITS), group: "fluid", full: true, showIf: (v) => v.basis === "Standard volume flow" },
    { key: "qsunit", type: "unit", default: "SCFM" },
    { key: "qa", label: "Actual volume flow (at the actual conditions below)", type: "number", default: 100, unitKey: "qaunit", units: Object.keys(ACT_UNITS), group: "fluid", full: true, showIf: (v) => v.basis === "Actual volume flow" },
    { key: "qaunit", type: "unit", default: "ACFM" },
    { key: "pg", label: "Gauge pressure", type: "number", unit: "psig", default: 100, group: "actual" },
    { key: "pamb", label: "Ambient pressure", type: "number", unit: "psia", default: 12.2, group: "actual", hint: "14.7 psia at sea level; 12.2 psia ≈ 4,500 ft" },
    { key: "t", label: "Temperature", type: "number", unit: "°F", default: 70, group: "actual" },
    { key: "rh", label: "Relative humidity", type: "number", unit: "% RH", default: 0, min: 0, max: 100, group: "actual", activeIf: (v) => v.fluid === "Air" },
    { key: "ps", label: "Reference pressure", type: "number", unit: "psia", default: 14.7, group: "ref" },
    { key: "ts", label: "Reference temperature", type: "number", unit: "°F", default: 70, group: "ref", hint: "Use 32 °F for Nm³ at 0 °C" },
    { key: "rhs", label: "Reference humidity", type: "number", unit: "% RH", default: 0, min: 0, max: 100, group: "ref", activeIf: (v) => v.fluid === "Air" },
    // fluid equivalence panel
    { key: "eqFrom", label: "Tested fluid", recLabel: "Equivalence: tested fluid", type: "select", options: EQ_GASES, default: "Air", group: "equiv", recordIf: eqOn },
    { key: "eqTo", label: "Convert to", recLabel: "Equivalence: other fluid", type: "select", options: EQ_GASES, default: "Nitrogen", group: "equiv", recordIf: eqOn },
    { key: "eqQ", label: "Tested standard flow", recLabel: "Equivalence: tested standard flow", type: "number", default: 100, unitKey: "eqUnit", units: Object.keys(STD_UNITS), group: "equiv", full: true, recordIf: eqOn },
    { key: "eqUnit", type: "unit", default: "SCFM" },
    { key: "eqBasis", label: "Conversion basis", recLabel: "Equivalence: basis", type: "select", options: EQ_BASES, default: EQ_BASES[0], group: "equiv", full: true, recordIf: eqOn },
    { key: "eqP1", label: "Inlet pressure", recLabel: "Equivalence: inlet pressure", type: "number", unit: "psig", default: 100, group: "equiv-p", recordIf: eqOn },
    { key: "eqP2", label: "Outlet pressure", recLabel: "Equivalence: outlet pressure", type: "number", unit: "psig", default: 0, group: "equiv-p", recordIf: eqOn, hint: "0 psig = discharge to atmosphere" },
    { key: "eqT", label: "Inlet temperature", recLabel: "Equivalence: inlet temperature", type: "number", unit: "°F", default: 70, group: "equiv-p", recordIf: eqOn },
    { key: "eqRec", label: "Include in calc record", type: "select", options: ["No", "Yes"], default: "No", group: "equiv-p", recordIf: () => false },
  ],

  calculate(v) {
    const base = {
      fluid: v.fluid, method: v.method,
      pg: v.pg, pamb: v.pamb, t: v.t, rh: v.rh / 100, ps: v.ps, ts: v.ts, rhs: v.rhs / 100,
    };
    const r = convert({ ...base, mlbhr: massFromInputs(v, base) });
    const eq = equivalenceReport({
      from: v.eqFrom, to: v.eqTo, q: v.eqQ, unit: v.eqUnit, basis: v.eqBasis,
      p1: v.eqP1, p2: v.eqP2, t: v.eqT, pamb: v.pamb, ps: v.ps, ts: v.ts, method: v.method,
    });
    const checks = [];
    let status;
    if (r.water && v.basis === "Standard volume flow") {
      status = { level: "bad", text: "Water has no standard volume", detail: "Enter mass flow or actual volume flow" };
    } else if (r.water) {
      status = { level: "warn", text: "Water: constant liquid density 999.8 kg/m³", detail: "No standard volume for liquids" };
    } else if (!Number.isFinite(r.acfm) || !Number.isFinite(r.scfm)) {
      status = { level: "bad", text: (!r.act.valid ? r.act : r.ref).status, detail: "Check inputs" };
    } else if (r.air) {
      status = { level: "ok", text: "Humid air, ideal mixture", detail: r.act.status };
    } else {
      status = { level: "ok", text: r.act.status, detail: v.method };
    }
    if (!r.water) {
      checks.push({ level: r.act.valid ? "ok" : "bad", label: "Actual state inside property range", detail: `${r.Tact.toFixed(2)} K, ${(r.Pact / 1000).toFixed(2)} kPa abs; limits 250–600 K, 1 kPa–10 MPa, phase screen` });
      checks.push({ level: r.ref.valid ? "ok" : "bad", label: "Reference state inside property range", detail: `${r.Tref.toFixed(2)} K, ${(r.Pref / 1000).toFixed(2)} kPa abs` });
      if (!r.air) {
        const dz = Math.abs(1 - r.act.Z);
        checks.push({ level: dz < 0.05 ? "ok" : "warn", label: "Compressibility at actual state", detail: `Z = ${r.act.Z.toFixed(5)} (Peng-Robinson)${dz >= 0.05 && v.method === "Ideal Gas" ? "; ideal gas is more than 5 % off, consider Peng-Robinson" : ""}` });
      } else {
        checks.push({ level: "ok", label: "Air treated as ideal humid mixture", detail: "The density method selector does not apply to air" });
      }
    }
    if (v.pg + v.pamb <= 0) checks.push({ level: "bad", label: "Absolute pressure must be positive", detail: "" });
    const H = {
      mass: { key: "mass", label: "Mass flow", value: r.mass.lbhr, unit: "lbm/hr", digits: 5 },
      scfm: { key: "scfm", label: "Standard flow", value: r.scfm, unit: "SCFM", digits: 5 },
      acfm: { key: "acfm", label: "Actual flow", value: r.acfm, unit: "ACFM", digits: 5 },
      nm3: { key: "nm3", label: "Normal / std volume", value: r.nm3, unit: "m³/hr at reference", digits: 5 },
    };
    const headline = v.basis === "Standard volume flow" ? [H.mass, H.acfm, H.nm3]
      : v.basis === "Actual volume flow" ? [H.mass, H.scfm, H.nm3]
      : [H.scfm, H.acfm, H.nm3];
    const withEq = eqOn(v);
    return {
      ok: status.level !== "bad",
      status,
      headline,
      equivalence: eq,
      method: withEq ? {
        basis: `${this.method.basis} Fluid equivalence: ${EQ_METHOD.basis}`,
        equations: [...this.method.equations, ...EQ_METHOD.equations.map((e) => ({ ...e, note: `Equivalence${e.note ? `: ${e.note}` : ""}` }))],
        assumptions: [...this.method.assumptions, ...EQ_METHOD.assumptions.map((e) => `Equivalence: ${e}`)],
        references: [...this.method.references, ...EQ_METHOD.references],
      } : undefined,
      extraResults: withEq ? eq.results : [],
      extraChecks: withEq ? [{ level: eq.status.level, label: `Equivalence: ${eq.status.text}`, detail: eq.status.detail }, ...eq.checks.map((c) => ({ ...c, label: `Equivalence: ${c.label}` }))] : [],
      results: [
        { label: "Known flow is", value: v.basis, unit: "" },
        { label: "Standard volume flow", value: r.scfm, unit: "SCFM", digits: 5 },
        { label: "Actual volume flow", value: r.acfm, unit: "ACFM", digits: 5 },
        { label: "Standard / normal volume flow", value: r.nm3, unit: "m³/hr", digits: 5 },
        { label: "Mass flow rate", value: r.mass.lbhr, unit: "lbm/hr", digits: 6 },
        { label: "Mass flow rate", value: r.mass.kghr, unit: "kg/hr", digits: 6 },
        { label: "Mass flow rate", value: r.mass.lbs, unit: "lb/s", digits: 6 },
        { label: "Mass flow rate", value: r.mass.kgs, unit: "kg/s", digits: 6 },
        { label: "Density used, actual", value: r.rhoUsed, unit: "kg/m³", digits: 6 },
        { label: "Density used, reference", value: r.rhoRef, unit: "kg/m³", digits: 6 },
      ],
      tables: [
        {
          title: "Fluid properties",
          columns: ["Property", "Ideal gas", "Selected method", "Difference"],
          rows: [
            ["Molecular weight (g/mol)", r.MW, "", ""],
            ["Actual density (kg/m³)", r.rhoIdeal, r.rhoSel, r.water ? NaN : { pct: pctDiff(r.rhoIdeal, r.rhoSel) }],
            ["Reference density (kg/m³)", r.rhoRefIdeal, r.rhoRefSel, r.water ? NaN : { pct: pctDiff(r.rhoRefIdeal, r.rhoRefSel) }],
            ["Compressibility Z, actual", 1, r.water || r.air ? NaN : r.act.Z, ""],
            ["Water vapour pressure, actual / ref (Pa)", r.air ? r.pvA : NaN, r.air ? r.pvS : NaN, ""],
          ],
        },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "Volume flow is mass flow divided by density. Actual flow uses density at line conditions; standard flow uses density at the reference pressure, temperature and, for air, humidity.",
    equations: [
      { note: "Absolute pressure and unit conversions", tex: String.raw`P_{\mathrm{abs}} = P_{\mathrm{gauge}} + P_{\mathrm{ambient}} \qquad P[\mathrm{Pa}] = 6,895\,P[\mathrm{psi}] \qquad T[\mathrm{K}] = \frac{5}{9}\left(T[\mathrm{°F}] - 32\right) + 273.15` },
      { note: "Ideal gas", tex: String.raw`\rho_{\mathrm{ideal}} = \frac{P\,M}{R\,T} \qquad R = 8.314\ \text{Pa·m³/(mol·K)}` },
      { note: "Humid air (Huang 2018)", tex: String.raw`\rho = \frac{(P-p_v)\cdot 0.02896546 + p_v\cdot 0.01801528}{R\,T} \qquad p_v = \mathrm{RH}\cdot p_{\mathrm{sat}}(T)` },
      { note: "Peng-Robinson: Z from the PR cubic (gas root)", tex: String.raw`\rho = \frac{P\,M}{Z\,R\,T}` },
      { note: "Volume flows (ṁ in lb/hr for ACFM and SCFM, kg/hr for m³/hr)", tex: String.raw`\mathrm{ACFM} = \frac{\dot m}{60 \times 0.062428\,\rho_{\mathrm{actual}}} \qquad \mathrm{SCFM} = \frac{\dot m}{60 \times 0.062428\,\rho_{\mathrm{ref}}} \qquad \text{m³/hr} = \frac{\dot m}{\rho_{\mathrm{ref}}}` },
    ],
    assumptions: [
      "Single-phase gas; property range 250–600 K and 1 kPa–10 MPa abs, with a saturation screen.",
      "Air is always an ideal humid-air mixture; the density method applies to other gases.",
      "Acetylene is ideal-gas only. Water uses a fixed liquid density of 999.8 kg/m³ and has no standard volume.",
    ],
    references: [
      "Peng, D.-Y. and Robinson, D. B. (1976), A New Two-Constant Equation of State, Ind. Eng. Chem. Fundam. 15(1).",
      "Huang, J. (2018), A Simple Accurate Formula for Calculating Saturation Vapor Pressure of Water and Ice, J. Appl. Meteor. Climatol. 57.",
    ],
  },
};
