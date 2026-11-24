// Relief valve gas capacity (API 520).
import { props, fToK, GAS_LIST, LB_PER_KG } from "./properties.js";

const KPA_PER_PSI = 6.894757293168;
/** API 526 effective orifice areas, in². */
export const API_ORIFICES = { D: 0.11, E: 0.196, F: 0.307, G: 0.503, H: 0.785, J: 1.287, K: 1.838, L: 2.853, M: 3.6, N: 4.34, P: 6.38, Q: 11.05, R: 16, T: 26 };
export const ORIFICE_OPTIONS = ["Custom", ...Object.keys(API_ORIFICES)];
export const Z_METHODS = ["Manual", "Ideal Gas", "Peng-Robinson"];

export function relief(i) {
  const gas = String(i.gas).toUpperCase();
  const P1 = (i.pset + i.pamb) * KPA_PER_PSI;        // kPa abs
  const P2 = i.pback * KPA_PER_PSI;
  const T = fToK(i.t);
  const method = i.zMethod === "Manual" ? "Ideal Gas" : i.zMethod;
  const st = props(gas, T, P1 * 1000, method);
  const MW = st.MW;
  const k = st.valid ? st.k : NaN;
  const Zcalc = st.valid ? (method === "Ideal Gas" ? 1 : st.Z) : NaN;
  const Z = i.zMethod === "Manual" ? (i.zManual > 0 ? i.zManual : NaN) : Zcalc;
  const r = P2 / P1;
  const rc = Math.pow(2 / (k + 1), k / (k - 1));
  const areaIn2 = i.size === "Custom" ? i.area : API_ORIFICES[i.size];
  const areaMm2 = areaIn2 * 645.16;
  const inputsOK = !(i.pset < 0 || i.pback <= 0 || i.pamb <= 0 || i.t <= -459.67 || i.kd <= 0 || i.kd > 1 || i.kb <= 0 || i.kb > 1 ||
    i.kc <= 0 || i.kc > 1 || (i.size === "Custom" && i.area <= 0) || (i.zMethod === "Manual" && i.zManual <= 0) || i.pback >= i.pset + i.pamb);
  const sonic = r <= rc;
  const C = 0.03948 * Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));
  const F2 = Math.sqrt((k / (k - 1)) * Math.pow(r, 2 / k) * ((1 - Math.pow(r, (k - 1) / k)) / (1 - r)));
  const W = !inputsOK ? NaN : sonic
    ? areaMm2 * C * i.kd * i.kb * i.kc * P1 * Math.sqrt(MW / (T * Z))                       // Eq. 3.6
    : (areaMm2 * F2 * i.kd * i.kc / 17.9) * Math.sqrt((MW * P1 * (P1 - P2)) / (T * Z));      // Eq. 3.8
  return {
    inputsOK, P1, P2, T, st, MW, k, Zcalc, Z, r, rc, Pcrit: P1 * rc, areaIn2, areaMm2, sonic, C, F2: sonic ? NaN : F2, W,
    regime: !inputsOK || !Number.isFinite(rc) ? "—" : sonic ? "Sonic / Critical" : "Subcritical",
    equation: !inputsOK || !Number.isFinite(rc) ? "—" : sonic ? "Eq. 3.6" : "Eq. 3.8",
  };
}

export default {
  id: "relief-valve",
  title: "Relief Valve Gas Capacity",
  short: "Relief Valve",
  version: "1.0.0",
  summary: "Gas relieving capacity of a pressure-relief valve by the API 520 critical and subcritical equations, for an API letter orifice or a custom effective area.",
  groups: [
    { id: "gas", label: "" },
    { id: "p", label: "Relieving conditions" },
    { id: "valve", label: "Valve and coefficients" },
  ],
  fields: [
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Argon", group: "gas" },
    { key: "zMethod", label: "Compressibility method", type: "select", options: Z_METHODS, default: "Peng-Robinson", group: "gas" },
    { key: "zManual", label: "Manual compressibility Z", type: "number", unit: "–", default: 1, group: "gas", activeIf: (v) => v.zMethod === "Manual" },
    { key: "pset", label: "Relieving pressure", type: "number", unit: "psig", default: 9, group: "p", hint: "Set pressure plus allowed overpressure" },
    { key: "pback", label: "Back pressure", type: "number", unit: "psia", default: 14.7, group: "p" },
    { key: "pamb", label: "Ambient pressure", type: "number", unit: "psia", default: 14.7, group: "p" },
    { key: "t", label: "Relieving temperature", type: "number", unit: "°F", default: 70, group: "p" },
    { key: "size", label: "API orifice size", type: "select", options: ORIFICE_OPTIONS, default: "Custom", group: "valve" },
    { key: "area", label: "Custom effective area", type: "number", unit: "in²", default: 0.11, group: "valve", activeIf: (v) => v.size === "Custom" },
    { key: "kd", label: "Discharge coefficient Kd", type: "number", unit: "–", default: 0.975, group: "valve" },
    { key: "kb", label: "Back pressure factor Kb", type: "number", unit: "–", default: 1, group: "valve", hint: "Applied in the critical equation only" },
    { key: "kc", label: "Combination factor Kc", type: "number", unit: "–", default: 1, group: "valve", hint: "0.9 with an upstream rupture disk" },
  ],

  calculate(v) {
    const r = relief(v);
    const ok = r.inputsOK && Number.isFinite(r.W);
    const status = !r.inputsOK ? { level: "bad", text: "CHECK INPUTS", detail: "Coefficients 0–1, positive area and Z, back pressure below relieving pressure" }
      : !r.st.valid ? { level: "bad", text: r.st.status, detail: "Check gas, method, pressure and temperature" }
      : { level: "ok", text: `${r.regime} flow · API 520 ${r.equation}`, detail: r.st.status };
    const lbhr = r.W * LB_PER_KG;
    const checks = [];
    if (ok) {
      checks.push({ level: "ok", label: `Back pressure ratio ${r.r.toFixed(4)} vs critical ${r.rc.toFixed(4)}`, detail: r.sonic ? "Critical flow: capacity independent of back pressure (Kb applies)" : "Subcritical flow: Kb is not applied in Eq. 3.8" });
      if (v.zMethod !== "Manual") checks.push({ level: Math.abs(1 - r.Zcalc) < 0.05 ? "ok" : "warn", label: "Compressibility at relieving conditions", detail: `Z = ${r.Zcalc.toFixed(4)}` });
      checks.push({ level: r.k > 1.001 && r.k <= 1.8 ? "ok" : "warn", label: "Isentropic coefficient", detail: `k = ${r.k.toFixed(4)} at relieving conditions` });
      if (!r.sonic && r.r > 0.9) checks.push({ level: "warn", label: "Very low pressure drop across the valve", detail: "Subcritical capacity is sensitive to back pressure near P₂/P₁ = 1" });
    }
    return {
      ok, status,
      headline: [
        { label: "Relief capacity", value: lbhr, unit: "lb/hr", digits: 5 },
        { label: "Relief capacity", value: r.W, unit: "kg/hr", digits: 5 },
        { label: "Effective area", value: r.areaIn2, unit: `in² · ${v.size === "Custom" ? "custom" : "API " + v.size}`, digits: 4 },
      ],
      results: [
        { label: "Relief capacity", value: r.W, unit: "kg/hr", digits: 6 },
        { label: "Relief capacity", value: r.W / 60, unit: "kg/min", digits: 6 },
        { label: "Relief capacity", value: r.W / 3600, unit: "kg/s", digits: 6 },
        { label: "Relief capacity", value: lbhr, unit: "lb/hr", digits: 6 },
        { label: "Relief capacity", value: lbhr / 60, unit: "lb/min", digits: 6 },
        { label: "Relief capacity", value: lbhr / 3600, unit: "lb/s", digits: 6 },
        { label: "Flow regime", value: r.regime, unit: "" },
        { label: "Equation used", value: r.equation, unit: "" },
        { label: "Upstream absolute pressure P₁", value: v.pset + v.pamb, unit: "psia", digits: 6 },
        { label: "Back pressure ratio P₂/P₁", value: r.r, unit: "–", digits: 6 },
        { label: "Critical pressure ratio", value: r.rc, unit: "–", digits: 6 },
        { label: "Critical back pressure", value: r.Pcrit / KPA_PER_PSI, unit: "psia", digits: 6 },
        { label: "Effective area", value: r.areaMm2, unit: "mm²", digits: 6 },
        { label: "Sonic coefficient C", value: r.C, unit: "–", digits: 6 },
        { label: "Subcritical coefficient F₂", value: r.F2, unit: "–", digits: 6 },
        { label: "Compressibility used Z", value: r.Z, unit: "–", digits: 6 },
        { label: "Isentropic coefficient k", value: r.k, unit: "–", digits: 6 },
        { label: "Molecular weight", value: r.MW, unit: "g/mol", digits: 6 },
      ],
      tables: [
        { title: "API 526 effective orifice areas", columns: ["Letter", "Area (in²)", "Capacity at these conditions (lb/hr)"],
          rows: ok ? Object.entries(API_ORIFICES).map(([L, a]) => [L, a, lbhr * a / r.areaIn2]) : [] },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "API 520 Part I gas sizing equations, rearranged to give capacity for a known effective area. The critical (sonic) equation applies when the back pressure ratio is at or below the critical pressure ratio; otherwise the subcritical equation with coefficient F₂ applies.",
    equations: [
      { note: "Pressures in kPa absolute", tex: String.raw`P_1 = 6.894757\,(P_{\mathrm{relieving}} + P_{\mathrm{amb}}) \qquad r = \frac{P_2}{P_1} \qquad r_c = \left(\frac{2}{k+1}\right)^{\frac{k}{k-1}}` },
      { note: "Gas coefficient", tex: String.raw`C = 0.03948\,\sqrt{k\left(\frac{2}{k+1}\right)^{\frac{k+1}{k-1}}}` },
      { note: "Critical flow, Eq. 3.6 (W kg/h, A mm², P kPa abs, T K)", tex: String.raw`W = A\,C\,K_d\,K_b\,K_c\,P_1\sqrt{\frac{M}{T\,Z}}` },
      { note: "Subcritical coefficient", tex: String.raw`F_2 = \sqrt{\frac{k}{k-1}\,r^{2/k}\,\frac{1 - r^{(k-1)/k}}{1-r}}` },
      { note: "Subcritical flow, Eq. 3.8", tex: String.raw`W = \frac{A\,F_2\,K_d\,K_c}{17.9}\sqrt{\frac{M\,P_1\,(P_1 - P_2)}{T\,Z}}` },
    ],
    assumptions: [
      "Gas phase only. Pressures in the equations are absolute; the back pressure is entered in psia.",
      "Kb is applied in the critical equation only; the subcritical equation applies Kd and Kc.",
      "k and Z come from the selected property method at relieving conditions. Manual Z uses ideal-gas heat capacities for k.",
      "Effective areas are the API 526 letter designations. Use the certified area and Kd for the actual valve when known.",
    ],
    references: [
      "API Standard 520 Part I, Sizing, Selection, and Installation of Pressure-relieving Devices (gas sizing equations 3.6 and 3.8 in the SI form used here).",
      "API Standard 526, Flanged Steel Pressure-relief Valves (effective orifice areas).",
    ],
  },
};
