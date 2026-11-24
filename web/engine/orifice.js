// Fixed orifice gas flow. Mirrors workbook sheet 'Fixed Orifice Calculator'.
import { props, fToK, GAS_LIST, PA_PER_PSI, LB_PER_KG } from "./properties.js";

const RU = 8.314462618;
const FT3_M3 = 0.028316846592;
export const CD_MODES = ["Manual", "Wu gas estimate"];

/** Wu, Burton & Schoenau (2002) Eq. 15, sharp-edged orifice. */
export const wuCd = (Re) => 0.61 * (1 + 1.07 * Math.exp(-0.126 * Math.sqrt(Re)) - 2.07 * Math.exp(-0.246 * Math.sqrt(Re)));

export function orifice(i) {
  const gas = String(i.gas).toUpperCase();
  const Pu = (i.pu + i.pamb) * PA_PER_PSI;           // E6 = E17, Pa abs
  const Pd = i.pd * PA_PER_PSI;                      // E7
  const T = fToK(i.t);                               // E9
  const D = i.d * 0.0254;                            // E10
  const A = (Math.PI / 4) * D * D;                   // E22
  const st = props(gas, T, Pu, i.method);            // 'Property calculations' row 7
  const k = st.valid ? st.k : NaN;                   // C33 (BI7)
  const rho = st.valid ? st.rho : NaN;               // C35/C36 (BC7)
  const mu = st.valid ? st.mu : NaN;                 // K14 (BG7)
  const rhoIdeal = (Pu * st.MW) / 1000 / (RU * T);   // C34
  const rc = Math.pow(2 / (k + 1), k / (k - 1));     // C19
  const Pcrit = Pu * rc;                             // E20
  const Pused = Math.max(Pd, Pcrit);                 // E21
  const r = Pused / Pu;                              // C37
  const inputsOK = i.pu >= 0 && i.pd > 0 && i.pamb > 0 && i.t > -459.67 && i.d > 0 && i.pd < i.pu + i.pamb;
  // K15: mass flow at Cd = 1, kg/s
  const m1 = inputsOK ? A * Math.sqrt(((2 * k) / (k - 1)) * Pu * rho * Math.pow(r, 2 / k) * (1 - Math.pow(r, (k - 1) / k))) : NaN;
  const rePerCd = (m1 * D) / (A * mu);               // K16
  // K17: 61 explicit fixed-point iterations of Eq. 15, starting at Cd = 0.61
  let cdPrev = NaN, cd = 0.61;
  const iters = [];
  for (let n = 0; n < 61; n++) {
    const trial = cd, Re = rePerCd * trial;
    cdPrev = trial; cd = wuCd(Re);
    iters.push([n + 1, trial, Re, cd]);
  }
  const relChange = Math.abs(cd - cdPrev) / Math.max(Math.abs(cd), 1e-12); // K20
  const cdWu = relChange < 1e-6 && cd > 0 && cd <= 1 ? cd : NaN;           // K17
  const cdUsed = i.cdMode === "Manual" ? (i.cd > 0 && i.cd <= 1 ? i.cd : NaN) : i.cdMode === "Wu gas estimate" ? cdWu : NaN; // K18
  const check = !Number.isFinite(cdUsed) ? "CHECK INPUTS / Cd" : inputsOK ? "OK" : "CHECK INPUTS";    // C15
  const mdot = check === "OK" ? cdUsed * m1 : NaN;   // C24 kg/s
  const choked = Pd <= Pcrit;                        // C16
  // Standard volume flow (not in the workbook): same density method, at the user's standard state
  const pstd = i.pstd ?? 14.696, tstd = i.tstd ?? 60;
  const stdOK = pstd > 0 && tstd > -459.67;
  const Tstd = fToK(tstd), Pstd = pstd * PA_PER_PSI;
  const stStd = stdOK ? props(gas, Tstd, Pstd, i.method) : { valid: false, status: "Check standard conditions" };
  const rhoStd = stStd.valid ? stStd.rho : NaN;
  const rhoStdIdeal = stdOK ? (Pstd * st.MW) / 1000 / (RU * Tstd) : NaN;
  const qStd = mdot / rhoStd;                        // standard m³/s
  return {
    pstd, tstd, stStd, rhoStd, rhoStdIdeal, qStd,
    scfm: (qStd / FT3_M3) * 60, scfh: (qStd / FT3_M3) * 3600, sm3h: qStd * 3600,
    acfm: (mdot / rho / FT3_M3) * 60,                // at upstream conditions
    check, Pu, Pd, T, D, A, st, k, rho, mu, rhoIdeal, rc, Pcrit, Pused, r, ratio: Pd / Pu, m1, rePerCd, cdWu, cdUsed, relChange, iters,
    regime: check !== "OK" || !Number.isFinite(Pcrit) ? "—" : choked ? "Choked" : "Subcritical",
    mdot, ReFlow: (mdot * D) / (A * mu),             // K19
    cdAtRe: i.re >= 0 ? wuCd(i.re) : NaN,            // K8
  };
}

const fmtStd = (v) => `${+Number(v.pstd).toPrecision(6)} psia, ${+Number(v.tstd).toPrecision(6)} °F`;

export default {
  id: "orifice",
  title: "Fixed Orifice Gas Flow",
  short: "Fixed Orifice",
  version: "1.1.0",
  summary: "Mass and standard volume flow of a gas through a sharp-edged orifice, with choked or subcritical flow and a manual or Reynolds-number-based discharge coefficient.",
  groups: [
    { id: "gas", label: "" },
    { id: "p", label: "Pressures and temperature" },
    { id: "geo", label: "Orifice" },
    { id: "std", label: "Standard conditions (for SCFM)" },
    { id: "re", label: "Discharge coefficient curve explorer" },
  ],
  fields: [
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Hydrogen", group: "gas" },
    { key: "method", label: "Density method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "gas" },
    { key: "pu", label: "Upstream pressure", type: "number", unit: "psig", default: 500, group: "p" },
    { key: "pd", label: "Downstream / back pressure", type: "number", unit: "psia", default: 50, group: "p" },
    { key: "pamb", label: "Ambient pressure", type: "number", unit: "psia", default: 11.7, group: "p" },
    { key: "t", label: "Upstream temperature", type: "number", unit: "°F", default: 70, group: "p" },
    { key: "d", label: "Orifice diameter", type: "number", unit: "in", default: 0.25, group: "geo" },
    { key: "cdMode", label: "Cd used for gas flow", type: "select", options: CD_MODES, default: "Manual", group: "geo" },
    { key: "cd", label: "Manual discharge coefficient Cd", type: "number", unit: "–", default: 0.9, group: "geo", activeIf: (v) => v.cdMode === "Manual" },
    { key: "pstd", label: "Standard pressure", type: "number", unit: "psia", default: 14.696, group: "std", hint: "Common: 14.696 psia (1 atm); 14.73 psia (US gas industry)" },
    { key: "tstd", label: "Standard temperature", type: "number", unit: "°F", default: 60, group: "std", hint: "Common: 60 °F; 70 °F; 32 °F (normal, 0 °C)" },
    { key: "re", label: "Reynolds number to explore", type: "number", unit: "–", default: 1000, group: "re", hint: "Shows Eq. 15 at any Re; does not change the flow result", recordIf: () => false },
  ],

  calculate(v) {
    const r = orifice(v);
    const ok = r.check === "OK" && Number.isFinite(r.mdot);
    const status = r.check !== "OK"
      ? { level: "bad", text: r.check, detail: r.check === "CHECK INPUTS / Cd" && v.cdMode !== "Manual" ? "Wu iteration did not settle or properties are unavailable" : "Back pressure must be below upstream absolute pressure" }
      : !r.st.valid ? { level: "bad", text: r.st.status, detail: "Check gas, method, pressure and temperature" }
      : { level: "ok", text: `${r.regime} flow`, detail: r.st.status };
    const lbhr = r.mdot * LB_PER_KG * 3600;
    const checks = [];
    if (ok) {
      checks.push({ level: "ok", label: `Pressure ratio ${r.ratio.toFixed(4)} vs critical ${r.rc.toFixed(4)}`, detail: r.regime === "Choked" ? "Back pressure at or below critical: flow does not depend on it" : "Subcritical: flow depends on back pressure" });
      const dz = Math.abs(1 - r.st.Z);
      checks.push({ level: dz < 0.05 ? "ok" : "warn", label: "Compressibility at the inlet", detail: `Z = ${r.st.Z.toFixed(4)} (Peng-Robinson)${dz >= 0.05 && v.method === "Ideal Gas" ? "; ideal gas is more than 5 % off, select Peng-Robinson" : ""}` });
      if (v.cdMode === "Wu gas estimate") checks.push({ level: "warn", label: "Wu Cd is a hydraulic correlation", detail: `Self-consistent Cd = ${r.cdWu.toFixed(4)} at Re = ${r.ReFlow.toExponential(3)}. Not validated for compressible or choked gas flow, thick bores or rounded inlets.` });
      if (!r.stStd.valid) checks.push({ level: "warn", label: "Standard flow not available", detail: `${r.stStd.status} at ${v.pstd} psia and ${v.tstd} °F. Mass flow is unaffected.` });
      checks.push({ level: r.ReFlow > 2500 && v.cdMode === "Wu gas estimate" ? "warn" : "ok", label: "Reynolds number at the orifice", detail: `Re = ${r.ReFlow.toExponential(3)}${r.ReFlow > 2500 ? "; above the Wu Fig. 3 range (Re ≤ 2,500), where Cd → 0.61 by extrapolation" : ""}` });
    }
    return {
      ok, status,
      headline: [
        { label: "Mass flow", value: lbhr, unit: "lb/hr", digits: 5 },
        { label: "Standard flow", value: r.scfm, unit: `SCFM (${fmtStd(v)})`, digits: 5 },
        { label: "Flow regime", value: r.regime, unit: `P₂/P₁ ${Number.isFinite(r.ratio) ? r.ratio.toFixed(3) : "–"}` },
      ],
      results: [
        { label: "Mass flow rate", value: r.mdot, unit: "kg/s", digits: 6 },
        { label: "Mass flow rate", value: r.mdot * 60, unit: "kg/min", digits: 6 },
        { label: "Mass flow rate", value: r.mdot * 3600, unit: "kg/hr", digits: 6 },
        { label: "Mass flow rate", value: r.mdot * LB_PER_KG, unit: "lb/s", digits: 6 },
        { label: "Mass flow rate", value: r.mdot * LB_PER_KG * 60, unit: "lb/min", digits: 6 },
        { label: "Mass flow rate", value: lbhr, unit: "lb/hr", digits: 6 },
        { label: `Standard volume flow (${fmtStd(v)})`, value: r.scfm, unit: "SCFM", digits: 6 },
        { label: `Standard volume flow (${fmtStd(v)})`, value: r.scfh, unit: "SCFH", digits: 6 },
        { label: `Standard volume flow (${fmtStd(v)})`, value: r.sm3h, unit: "std m³/hr", digits: 6 },
        { label: "Actual volume flow at upstream", value: r.acfm, unit: "ACFM", digits: 6 },
        { label: "Density at standard conditions", value: r.rhoStd, unit: "kg/m³", digits: 6 },
        { label: "Flow regime", value: r.regime, unit: "" },
        { label: "Upstream absolute pressure", value: v.pu + v.pamb, unit: "psia", digits: 6 },
        { label: "Actual pressure ratio Pd/Pu", value: r.ratio, unit: "–", digits: 6 },
        { label: "Critical pressure ratio", value: r.rc, unit: "–", digits: 6 },
        { label: "Critical back pressure", value: r.Pcrit / PA_PER_PSI, unit: "psia", digits: 6 },
        { label: "Pressure used in flow equation", value: r.Pused / PA_PER_PSI, unit: "psia", digits: 6 },
        { label: "Orifice area", value: (Math.PI / 4) * v.d * v.d, unit: "in²", digits: 6 },
        { label: "Cd applied", value: r.cdUsed, unit: "–", digits: 5 },
        { label: "Upstream density used", value: r.rho, unit: "kg/m³", digits: 6 },
        { label: "Isentropic coefficient k", value: r.k, unit: "–", digits: 5 },
      ],
      tables: [
        {
          title: "Discharge coefficient (Wu et al. 2002, Eq. 15)",
          columns: ["Quantity", "Value"],
          rows: [
            ["Cd at the explorer Re", r.cdAtRe],
            ["√Re at the explorer Re", Math.sqrt(v.re)],
            ["Mass flow at Cd = 1 (kg/s)", r.m1],
            ["Re per unit Cd", r.rePerCd],
            ["Self-consistent Wu gas Cd", r.cdWu],
            ["Last iteration relative change", r.relChange],
            ["Re at the selected flow", r.ReFlow],
            ["Upstream viscosity (Pa·s)", r.mu],
            ["Ideal-gas density (kg/m³)", r.rhoIdeal],
          ],
        },
        {
          title: "Standard volume flow basis",
          columns: ["Quantity", "Value"],
          rows: [
            ["Standard pressure (psia)", v.pstd],
            ["Standard temperature (°F)", v.tstd],
            ["Standard density, ideal gas (kg/m³)", r.rhoStdIdeal],
            [`Standard density, ${v.method} (kg/m³)`, r.rhoStd],
            ["Compressibility Z at standard", r.stStd.valid ? r.stStd.Z : NaN],
          ],
        },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "Isentropic flow of an ideal gas through a sharp-edged orifice, multiplied by a discharge coefficient. When the back pressure is at or below the critical pressure the orifice is choked and the flow no longer depends on back pressure.",
    equations: [
      { note: "Upstream pressure (Pa) and bore area", tex: String.raw`P_u = 6,894.757\,(P_{\mathrm{gauge}} + P_{\mathrm{amb}}) \qquad A = \frac{\pi d^2}{4}` },
      { note: "Critical pressure ratio and the pressure ratio used", tex: String.raw`r_c = \left(\frac{2}{k+1}\right)^{\frac{k}{k-1}} \qquad P_{\mathrm{used}} = \max(P_d,\ r_c P_u) \qquad r = \frac{P_{\mathrm{used}}}{P_u}` },
      { note: "Mass flow", tex: String.raw`\dot m = C_d\,A\,\sqrt{\frac{2k}{k-1}\,P_u\,\rho_u\,r^{2/k}\left[1 - r^{(k-1)/k}\right]}` },
      { note: "Wu Eq. 15. Wu mode runs 61 fixed-point iterations of Cd → Re → Cd from 0.61, accepted when the last change is below 10⁻⁶", tex: String.raw`C_d = 0.61\left[1 + 1.07\,e^{-0.126\sqrt{\mathrm{Re}}} - 2.07\,e^{-0.246\sqrt{\mathrm{Re}}}\right] \qquad \mathrm{Re} = \frac{\dot m\,d}{A\,\mu}` },
      { note: "Standard flow, with standard density from the selected density method", tex: String.raw`Q_{\mathrm{std}} = \frac{\dot m}{\rho_{\mathrm{std}}} \qquad \rho_{\mathrm{std}} = \rho(\text{gas},\ P_{\mathrm{std}},\ T_{\mathrm{std}}) \qquad \mathrm{SCFM} = \frac{60\,Q_{\mathrm{std}}[\text{m³/s}]}{0.0283168}` },
    ],
    assumptions: [
      "Gas phase only; properties at upstream conditions (ideal gas or Peng-Robinson). Property range 250–600 K, 1 kPa–10 MPa.",
      "Manual Cd is the default. The Wu correlation comes from hydraulic sharp-edge data and is an unvalidated estimate for compressible or choked gas flow, thick bores, rounded inlets or valves.",
      "Above the plotted range (Re > 2,500) the Wu curve tends to 0.61; that is extrapolation.",
      "Viscosity uses a low-pressure power law.",
      "Standard flow is the same mass flow expressed as volume at the standard pressure and temperature you enter. \"Standard\" varies by industry and company (60 °F or 70 °F; 14.696 or 14.73 psia; normal = 0 °C), so state the basis with the number.",
    ],
    references: [
      "Methods for the Calculation of Physical Effects (Yellow Book), CPR 14E, 3rd ed., 1997, Ch. 2 Outflow and Spray Release.",
      "Wu, D., Burton, R. & Schoenau, G. (2002), An Empirical Discharge Coefficient Model for Orifice Flow, Int. J. Fluid Power 3(3), Eq. 15.",
    ],
  },
};
