// Valve flow from Cv, or the Cv needed for a flow, for a gas or a liquid.
// Gas: ISA S75.01 SCFM correlation with a fixed choke at P₂ = 0.5·P₁.
// Liquid: ANSI/ISA-75.01.01 (IEC 60534-2-1) incompressible equation with choked-flow limit, Fp = 1.
import { props, fToK, GAS_LIST, PA_PER_PSI, LB_PER_KG, MW_AIR } from "./properties.js";

const N2 = 22.67;          // SCFM / psia / °R basis
const FT3_M3 = 0.028316846592;
const M3S_PER_GPM = 6.30901964e-5;
const RHO_WATER = 999.01;  // kg/m³, water at 60 °F (specific gravity reference)

export const MODES = ["Flow from Cv", "Cv from flow"];
export const FLUIDS = ["Gas", "Liquid"];
export const GAS_FLOW_UNITS = ["SCFM", "SCFH", "Sm³/h", "lb/hr", "kg/hr"];
export const LIQ_FLOW_UNITS = ["gpm", "L/min", "m³/h", "lb/hr", "kg/hr"];

/** Gas flow (SCFM at 14.7 psia, 60 °F) through a valve of known Cv. */
export function cvFlow(i) {
  const gas = String(i.gas).toUpperCase();
  const P1 = i.p1 + i.pamb, P2 = i.p2 + i.pamb, dP = P1 - P2;  // psia
  const TR = i.t + 459.67;                                      // °R
  const MW = props(gas, 300, 101325, "Ideal Gas").MW;
  const SG = MW / MW_AIR;
  const stStd = props(gas, fToK(60), 14.7 * PA_PER_PSI, i.method);
  const stUp = props(gas, fToK(i.t), P1 * PA_PER_PSI, i.method);
  const stRef = props(gas, fToK(i.tref), i.pref * PA_PER_PSI, i.method);
  const rhoStd = stStd.valid ? stStd.rho : NaN, rhoUp = stUp.valid ? stUp.rho : NaN, rhoRef = stRef.valid ? stRef.rho : NaN;
  const inputsOK = !(P1 <= 0 || P2 < 0 || P1 <= P2 || i.t <= -459.67 || i.cv <= 0 || i.pref <= 0 || i.tref <= -459.67);
  const choked = P2 <= 0.5 * P1;
  // SCFM per unit Cv; flow and Cv are proportional
  const perCv = choked
    ? 0.471 * N2 * P1 * Math.sqrt(1 / (SG * TR))
    : N2 * P1 * (1 - (2 * dP) / (3 * P1)) * Math.sqrt(dP / (P1 * SG * TR));
  const scfm = !inputsOK ? NaN : i.cv * perCv;
  return gasFlows({ inputsOK, P1, P2, dP, TR, MW, SG, choked, perCv, scfm, rhoStd, rhoUp, rhoRef, stStd, stUp, stRef }, i);
}

function gasFlows(r, i) {
  const mdot = (r.scfm * FT3_M3) / 60 * r.rhoStd;               // kg/s
  return {
    ...r, mdot,
    regime: !r.inputsOK ? "—" : r.choked ? "High pressure drop / choked" : "Low pressure drop",
    slpm: r.scfm * 28.316846592,
    nm3h: (mdot / r.rhoRef) * 3600,
    acfm: ((mdot / r.rhoUp) * 60) / FT3_M3,
    rhoStdIdeal: (14.7 * PA_PER_PSI * (r.MW / 1000)) / (8.314462618 * fToK(60)),
    rhoUpIdeal: (r.P1 * PA_PER_PSI * (r.MW / 1000)) / (8.314462618 * fToK(i.t)),
    rhoRefIdeal: (i.pref * PA_PER_PSI * (r.MW / 1000)) / (8.314462618 * fToK(i.tref)),
  };
}

/** Required gas Cv for a known flow. */
export function cvGasRequired(i) {
  const r = cvFlow({ ...i, cv: 1 });                             // flow per unit Cv
  const q = i.qGas;
  const scfm = i.qGasUnit === "SCFM" ? q : i.qGasUnit === "SCFH" ? q / 60
    : i.qGasUnit === "Sm³/h" ? (q / FT3_M3) / 60
    : i.qGasUnit === "lb/hr" ? ((q / LB_PER_KG / 3600) / r.rhoStd / FT3_M3) * 60
    : i.qGasUnit === "kg/hr" ? ((q / 3600) / r.rhoStd / FT3_M3) * 60 : NaN;
  const ok = r.inputsOK && q > 0 && Number.isFinite(scfm);
  const cv = ok ? scfm / r.perCv : NaN;
  return { ...gasFlows({ ...r, inputsOK: ok, scfm: ok ? scfm : NaN }, i), cv };
}

/** Liquid flow from Cv, or the Cv for a flow (ANSI/ISA-75.01.01, Fp = 1). */
export function cvLiquid(i) {
  const P1 = i.p1 + i.pamb, P2 = i.p2 + i.pamb, dP = P1 - P2;   // psia, psi
  const FF = 0.96 - 0.28 * Math.sqrt(Math.max(i.pv, 0) / i.pc);
  const dPchoke = i.fl * i.fl * (P1 - FF * i.pv);                // ΔP at which flow chokes
  const inputsOK = P1 > 0 && P2 >= 0 && dP > 0 && i.sg > 0 && i.fl > 0 && i.fl <= 1 && i.pv >= 0 && i.pc > i.pv && dPchoke > 0;
  const choked = dP >= dPchoke;
  const dPsize = Math.min(dP, dPchoke);
  const gpmPerCv = Math.sqrt(dPsize / i.sg);
  const rho = i.sg * RHO_WATER;                                   // kg/m³
  let gpm, cv;
  if (i.mode === "Cv from flow") {
    const q = i.qLiq, u = i.qLiqUnit;
    gpm = u === "gpm" ? q : u === "L/min" ? q / 3.785411784 : u === "m³/h" ? q / 0.227124707
      : u === "lb/hr" ? (q / LB_PER_KG / 3600 / rho) / M3S_PER_GPM
      : u === "kg/hr" ? (q / 3600 / rho) / M3S_PER_GPM : NaN;
    cv = gpm / gpmPerCv;
    if (!(q > 0)) gpm = cv = NaN;
  } else {
    cv = i.cv > 0 ? i.cv : NaN;
    gpm = cv * gpmPerCv;
  }
  if (!inputsOK) gpm = cv = NaN;
  const mdot = gpm * M3S_PER_GPM * rho;                           // kg/s
  return {
    inputsOK, P1, P2, dP, FF, dPchoke, choked, dPsize, rho, gpm, cv, mdot,
    regime: !inputsOK ? "—" : choked ? "Choked (flashing or cavitating)" : "Not choked",
    lpm: gpm * 3.785411784, m3h: gpm * 0.227124707,
    // fraction of the choking pressure drop used; above about 0.5–0.7 cavitation may begin (valve-specific)
    xChoke: dP / dPchoke,
  };
}

const isGas = (v) => v.fluid !== "Liquid";
const isLiq = (v) => v.fluid === "Liquid";
const cvMode = (v) => v.mode === "Cv from flow";

export default {
  id: "cv-flow",
  title: "Cv Valve Flow",
  short: "Cv Valve Flow",
  version: "2.0.0",
  summary: "Flow through a valve of known Cv, or the Cv needed for a given flow, for a gas (ISA S75.01) or a liquid (ANSI/ISA-75.01.01 with choked-flow limit).",
  groups: [
    { id: "calc", label: "" },
    { id: "fluid", label: "Fluid" },
    { id: "valve", label: "Valve and flow" },
    { id: "p", label: "Operating conditions" },
    { id: "liq", label: "Liquid choked-flow data" },
    { id: "ref", label: "Reference / normal conditions" },
  ],
  fields: [
    { key: "mode", label: "Calculate", type: "select", options: MODES, default: "Flow from Cv", group: "calc" },
    { key: "fluid", label: "Fluid type", type: "select", options: FLUIDS, default: "Gas", group: "calc" },
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Argon", group: "fluid", showIf: isGas },
    { key: "method", label: "Density method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "fluid", showIf: isGas },
    { key: "sg", label: "Specific gravity (water at 60 °F = 1)", type: "number", unit: "–", default: 1, group: "fluid", showIf: isLiq, hint: "Water 1.0; gasoline about 0.72; diesel about 0.85" },
    { key: "cv", label: "Valve flow coefficient", type: "number", unit: "Cv", default: 0.73, group: "valve", full: true, showIf: (v) => !cvMode(v) },
    { key: "qGas", label: "Gas flow", type: "number", default: 100, unitKey: "qGasUnit", units: GAS_FLOW_UNITS, group: "valve", full: true, showIf: (v) => cvMode(v) && isGas(v), recordIf: (v) => cvMode(v) && isGas(v), hint: "Standard flow at 14.7 psia and 60 °F, or mass flow" },
    { key: "qGasUnit", type: "unit", default: "SCFM" },
    { key: "qLiq", label: "Liquid flow", type: "number", default: 10, unitKey: "qLiqUnit", units: LIQ_FLOW_UNITS, group: "valve", full: true, showIf: (v) => cvMode(v) && isLiq(v), recordIf: (v) => cvMode(v) && isLiq(v) },
    { key: "qLiqUnit", type: "unit", default: "gpm" },
    { key: "p1", label: "Upstream pressure", type: "number", unit: "psig", default: 15, group: "p" },
    { key: "p2", label: "Downstream pressure", type: "number", unit: "psig", default: 1, group: "p" },
    { key: "pamb", label: "Atmospheric pressure", type: "number", unit: "psia", default: 14.7, group: "p" },
    { key: "t", label: "Upstream temperature", type: "number", unit: "°F", default: 70, group: "p", showIf: isGas },
    { key: "fl", label: "Liquid pressure recovery factor FL", type: "number", unit: "–", default: 0.9, group: "liq", showIf: isLiq, hint: "From the valve maker. Typical: globe 0.9, ball 0.6, butterfly 0.55" },
    { key: "pv", label: "Vapour pressure at inlet temperature", type: "number", unit: "psia", default: 0.3633, group: "liq", showIf: isLiq, hint: "Water: 0.363 psia at 70 °F; 1.69 psia at 120 °F" },
    { key: "pc", label: "Critical pressure of the liquid", type: "number", unit: "psia", default: 3200.1, group: "liq", showIf: isLiq, hint: "Water 3,200 psia" },
    { key: "pref", label: "Reference pressure", type: "number", unit: "psia", default: 14.696, group: "ref", showIf: isGas },
    { key: "tref", label: "Reference temperature", type: "number", unit: "°F", default: 32, group: "ref", showIf: isGas, hint: "For Nm³/h; SCFM is always at 14.7 psia and 60 °F" },
  ],

  calculate(v) {
    return isLiq(v) ? liquidResult(v) : gasResult(v);
  },

  method: {
    basis: "Gas: the ISA S75.01-1989 correlation for a valve of known Cv, in SCFM at 14.7 psia and 60 °F, then converted to mass, actual and normal flow with the densities at those states. Liquid: the ANSI/ISA-75.01.01 (IEC 60534-2-1) incompressible-flow equation with no attached fittings (Fp = 1); once the pressure drop reaches the choked limit, the flow no longer increases. For Cv from flow, the same equations are solved for Cv.",
    equations: [
      { note: "Gas: P₁ and P₂ absolute (psia), T₁ in °R", tex: String.raw`\Delta p = P_1 - P_2 \qquad G_g = \frac{M}{28.965}` },
      { note: "Gas, low pressure drop, P₂ > 0.5·P₁", tex: String.raw`q = N_2\,C_v\,P_1\left(1-\frac{2\,\Delta p}{3\,P_1}\right)\sqrt{\frac{\Delta p}{P_1\,G_g\,T_1}}` },
      { note: "Gas, choked, P₂ ≤ 0.5·P₁", tex: String.raw`q = \frac{0.471\,N_2\,C_v\,P_1}{\sqrt{G_g\,T_1}} \qquad N_2 = 22.67` },
      { note: "Gas mass flow and other volume flows", tex: String.raw`\dot m = \frac{0.0283168\,q}{60}\,\rho_{\mathrm{std}} \qquad \text{Nm³/h} = \frac{3600\,\dot m}{\rho_{\mathrm{ref}}} \qquad \mathrm{ACFM} = \frac{60\,\dot m}{0.0283168\,\rho_1}` },
      { note: "Liquid (Q in gpm, pressures in psi)", tex: String.raw`Q = C_v\,\sqrt{\frac{\Delta P_{\mathrm{sizing}}}{G_f}} \qquad \Delta P_{\mathrm{sizing}} = \min\left(\Delta P,\ \Delta P_{\mathrm{choked}}\right)` },
      { note: "Liquid choked-flow limit", tex: String.raw`\Delta P_{\mathrm{choked}} = F_L^2\left(P_1 - F_F\,P_v\right) \qquad F_F = 0.96 - 0.28\sqrt{\frac{P_v}{P_c}}` },
      { note: "Cv from flow: flow is proportional to Cv, so divide by the flow at Cv = 1 (q₁) under the same conditions", tex: String.raw`C_v = \frac{q}{q_1}` },
    ],
    assumptions: [
      "Gas: the correlation assumes ideal-gas behaviour and switches to choked flow at a fixed P₂/P₁ = 0.5. It does not use the valve's pressure-drop ratio factor xT or the specific-heat factor Fk. SCFM is at 14.7 psia and 60 °F; the reference / normal flow uses the editable conditions.",
      "Liquid: Newtonian, single-phase liquid at the inlet; no reducers or attached fittings (Fp = 1); turbulent flow (no Reynolds-number correction). FL is valve-specific; use the maker's value at the expected opening.",
      "Liquid cavitation can begin before the choked limit, typically above about 50–70 % of ΔP choked, depending on the valve. Check noise and damage limits with the valve maker.",
      "Not for two-phase flow or near condensation. For gas valve sizing, use the current ANSI/ISA-75.01.01 (IEC 60534-2-1) method with the valve's xT.",
    ],
    references: [
      "ISA S75.01-1989, Flow Equations for Sizing Control Valves; ISA S75.02-1989, Control Valve Capacity Test Procedure.",
      "ANSI/ISA-75.01.01 (IEC 60534-2-1), Industrial-Process Control Valves, Flow capacity: sizing equations for fluid flow under installed conditions (liquid equation and choked flow).",
    ],
  },
};

function gasResult(v) {
  const want = cvMode(v);
  const r = want ? cvGasRequired(v) : cvFlow(v);
  const ok = r.inputsOK && Number.isFinite(r.scfm) && (!want || Number.isFinite(r.cv));
  const bad = [r.stStd, r.stUp, r.stRef].find((s) => !s.valid);
  const status = !r.inputsOK ? { level: "bad", text: "CHECK INPUTS", detail: want ? "P₁ must exceed P₂; flow and reference pressure must be positive" : "P₁ must exceed P₂; Cv and reference pressure must be positive" }
    : bad ? { level: "warn", text: want ? "Cv found; some density-based flows unavailable" : "SCFM valid; density-based flows unavailable", detail: bad.status }
    : { level: "ok", text: r.regime, detail: r.stUp.status };
  const checks = [];
  if (ok) {
    checks.push({ level: "ok", label: `P₂/P₁ = ${(r.P2 / r.P1).toFixed(4)}`, detail: r.choked ? "At or below 0.5: choked equation, flow independent of P₂" : "Above 0.5: low pressure drop equation" });
    const x = r.dP / r.P1;
    if (!r.choked && x > 0.4) checks.push({ level: "warn", label: "Near the choke threshold", detail: "This correlation switches abruptly at P₂ = 0.5·P₁; ANSI/ISA-75.01.01 uses xT and Fk instead" });
    const dz = Math.abs(1 - r.stUp.Z);
    checks.push({ level: dz < 0.05 ? "ok" : "warn", label: "Gas close to ideal at the inlet", detail: `Z = ${r.stUp.Z.toFixed(4)}. The Cv correlation itself assumes ideal gas.` });
  }
  const lbh = r.mdot * LB_PER_KG * 3600;
  return {
    ok, status,
    headline: want ? [
      { label: "Required Cv", value: r.cv, unit: "Cv", digits: 4 },
      { label: "Standard flow", value: r.scfm, unit: "SCFM (14.7 psia, 60 °F)", digits: 5 },
      { label: "Flow regime", value: r.choked ? "Choked" : "Low ΔP", unit: `P₂/P₁ ${Number.isFinite(r.P2 / r.P1) ? (r.P2 / r.P1).toFixed(3) : "–"}` },
    ] : [
      { label: "Standard flow", value: r.scfm, unit: "SCFM (14.7 psia, 60 °F)", digits: 5 },
      { label: "Mass flow", value: lbh, unit: "lb/h", digits: 5 },
      { label: "Actual upstream flow", value: r.acfm, unit: "ACFM", digits: 5 },
    ],
    results: [
      ...(want ? [{ label: "Required valve flow coefficient", value: r.cv, unit: "Cv", digits: 6 }] : []),
      { label: "Gas flow", value: r.scfm, unit: "SCFM", digits: 6 },
      { label: "Gas flow", value: r.slpm, unit: "standard L/min", digits: 6 },
      { label: "Reference / normal gas flow", value: r.nm3h, unit: "Nm³/h", digits: 6 },
      { label: "Actual upstream gas flow", value: r.acfm, unit: "ACFM", digits: 6 },
      { label: "Mass flow", value: r.mdot, unit: "kg/s", digits: 6 },
      { label: "Mass flow", value: r.mdot * 3600, unit: "kg/h", digits: 6 },
      { label: "Mass flow", value: r.mdot * LB_PER_KG * 60, unit: "lb/min", digits: 6 },
      { label: "Mass flow", value: lbh, unit: "lb/h", digits: 6 },
      { label: "Flow regime", value: r.regime, unit: "" },
      { label: "Pressure drop Δp", value: r.dP, unit: "psi", digits: 6 },
      { label: "Critical downstream pressure", value: 0.5 * r.P1 - v.pamb, unit: "psig", digits: 6 },
      { label: "Gas specific gravity (air = 1)", value: r.SG, unit: "–", digits: 6 },
    ],
    tables: [
      { title: "Densities", columns: ["State", "Ideal gas (kg/m³)", "Selected method (kg/m³)"],
        rows: [["Standard, 14.7 psia & 60 °F", r.rhoStdIdeal, r.rhoStd], ["Upstream", r.rhoUpIdeal, r.rhoUp], ["Reference / normal", r.rhoRefIdeal, r.rhoRef]] },
    ],
    checks,
    raw: r,
  };
}

function liquidResult(v) {
  const want = cvMode(v);
  const r = cvLiquid(v);
  const ok = r.inputsOK && Number.isFinite(r.gpm) && Number.isFinite(r.cv);
  const status = !r.inputsOK ? { level: "bad", text: "CHECK INPUTS", detail: "P₁ must exceed P₂; SG, FL (0–1) and critical pressure above vapour pressure" }
    : !ok ? { level: "bad", text: "CHECK INPUTS", detail: want ? "Flow must be positive" : "Cv must be positive" }
    : { level: r.choked ? "warn" : "ok", text: r.regime, detail: r.choked ? "Flow is limited by the choked pressure drop" : `ΔP is ${(r.xChoke * 100).toFixed(0)} % of the choked limit` };
  const checks = [];
  if (ok) {
    checks.push({ level: r.choked ? "warn" : "ok", label: `ΔP ${r.dP.toFixed(3)} psi vs choked limit ${r.dPchoke.toFixed(3)} psi`, detail: r.choked ? "Choked: the sizing pressure drop is capped at the choked limit. Expect flashing (P₂ below vapour pressure) or cavitation." : "Below the choked limit: flow follows the square-root law" });
    if (!r.choked && r.xChoke > 0.5) checks.push({ level: "warn", label: "Cavitation possible", detail: `ΔP is ${(r.xChoke * 100).toFixed(0)} % of the choked limit; incipient cavitation often starts at 50–70 %. Check with the valve maker.` });
    if (r.P2 < v.pv) checks.push({ level: "warn", label: "Flashing", detail: "Downstream pressure is below the vapour pressure: the liquid partly vaporises after the valve" });
    checks.push({ level: "ok", label: "Fp = 1 (no reducers or fittings)", detail: "Apply the piping geometry factor if the valve is smaller than the line" });
  }
  const lbh = r.mdot * LB_PER_KG * 3600;
  return {
    ok, status,
    headline: want ? [
      { label: "Required Cv", value: r.cv, unit: "Cv", digits: 4 },
      { label: "Liquid flow", value: r.gpm, unit: "gpm", digits: 5 },
      { label: "Flow regime", value: r.choked ? "Choked" : "Not choked", unit: `ΔP / ΔP choked ${Number.isFinite(r.xChoke) ? r.xChoke.toFixed(3) : "–"}` },
    ] : [
      { label: "Liquid flow", value: r.gpm, unit: "gpm", digits: 5 },
      { label: "Mass flow", value: lbh, unit: "lb/h", digits: 5 },
      { label: "Flow regime", value: r.choked ? "Choked" : "Not choked", unit: `ΔP / ΔP choked ${Number.isFinite(r.xChoke) ? r.xChoke.toFixed(3) : "–"}` },
    ],
    results: [
      ...(want ? [{ label: "Required valve flow coefficient", value: r.cv, unit: "Cv", digits: 6 }] : []),
      { label: "Liquid flow", value: r.gpm, unit: "gpm", digits: 6 },
      { label: "Liquid flow", value: r.lpm, unit: "L/min", digits: 6 },
      { label: "Liquid flow", value: r.m3h, unit: "m³/h", digits: 6 },
      { label: "Mass flow", value: r.mdot, unit: "kg/s", digits: 6 },
      { label: "Mass flow", value: r.mdot * 3600, unit: "kg/h", digits: 6 },
      { label: "Mass flow", value: lbh, unit: "lb/h", digits: 6 },
      { label: "Flow regime", value: r.regime, unit: "" },
      { label: "Pressure drop ΔP", value: r.dP, unit: "psi", digits: 6 },
      { label: "Choked pressure drop ΔP choked", value: r.dPchoke, unit: "psi", digits: 6 },
      { label: "Sizing pressure drop", value: r.dPsize, unit: "psi", digits: 6 },
      { label: "Liquid critical pressure ratio factor FF", value: r.FF, unit: "–", digits: 5 },
      { label: "Liquid density", value: r.rho, unit: "kg/m³", digits: 6 },
    ],
    tables: [],
    checks,
    raw: r,
  };
}
